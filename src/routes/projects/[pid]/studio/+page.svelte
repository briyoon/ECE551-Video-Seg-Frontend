<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import ProjectNav from '$lib/components/ProjectNav.svelte';
	import { PUBLIC_API_BASE } from '$env/static/public';

	// shadcn‑svelte UI components
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { ChevronDown } from '@lucide/svelte';
	import type {
		MediaRead,
		ProjectRead,
		ImageAnnotationRead,
		VideoAnnotationRead,
		ModelRead,
		ImageAnnotationCreate
	} from '$lib/api/openapi/types.gen';
	import {
		listMediaApiV1ProjectsPidMediaGet as listMedia,
		listImageAnnotationsApiV1ProjectsPidAnnotationsImageGet as listImgAnn,
		listVideoAnnotationsApiV1ProjectsPidAnnotationsVideoGet as listVidAnn,
		listApiV1ProjectsPidModelsGet as listModels,
		addImageAnnotationApiV1ProjectsPidAnnotationsImagePost as addImgAnn,
		listImageAnnotationsApiV1ProjectsPidAnnotationsImageGet as getImgAnn,
		deleteImageAnnotationApiV1ProjectsPidAnnotationsImageAidDelete as deleteImgAnn
	} from '$lib/api/openapi/sdk.gen';
	import { client } from '$lib/api/client';
	import {
		Collapsible,
		CollapsibleContent,
		CollapsibleTrigger
	} from '$lib/components/ui/collapsible';
	import { toast } from 'svelte-sonner';

	const project = /** @type {ProjectRead} */ (/** @ts-ignore */ getContext<ProjectRead>('project'));

	let viewerEl: HTMLElement; // bind to the <main> viewer

	/* ─────────────────────── state & refs ─────────────────────── */
	let media: MediaRead[] = $state([]);
	let annotated: MediaRead[] = $state([]);
	let unannotated: MediaRead[] = $state([]);
	let selected: MediaRead | undefined = $state();

	let showUnannotated = $state(true);
	let showAnnotated = $state(true);

	let models: ModelRead[] = $state([]);
	let selectedModelId: string | undefined = $state();

	let annotations: (ImageAnnotationRead | VideoAnnotationRead)[] = $state([]);

	// viewer transform
	let scale = 1;
	let offsetX = 0;
	let offsetY = 0;

	// undo / redo
	let undoStack: (typeof annotations)[] = $state([]);
	let redoStack: (typeof annotations)[] = $state([]);

	// canvases
	let annCanvas: HTMLCanvasElement;

	// @ts-expect-error TS2493: 'Image' not available during SSR
	let imgEl: HTMLImageElement = $state();
	let imgW = 1,
		imgH = 1; // natural resolution

	function handleImgLoad() {
		imgW = imgEl?.naturalWidth;
		imgH = imgEl?.naturalHeight;
		drawOverlay(); // need these numbers to paint correctly
	}

	/* ───────────────────── helper utilities ───────────────────── */
	const alphaSort = <T extends { path?: string; name?: string }>(arr: T[]) =>
		[...arr].sort((a, b) => (a.path ?? a.name ?? '').localeCompare(b.path ?? b.name ?? ''));

	async function refreshMedia() {
		const { data } = await listMedia({ client, path: { pid: project.id } });
		media = data ?? [];
		annotated = alphaSort(media.filter((m) => (m as any).annotation_count > 0));
		unannotated = alphaSort(media.filter((m) => (m as any).annotation_count === 0));
		if (!selected && media.length) selectMedia(media[0]);
	}

	async function refreshModels() {
		const { data } = await listModels({ client, path: { pid: project.id } });
		models = data ?? [];
		if (!selectedModelId && models.length) selectedModelId = String(models[0].id);
	}

	async function refreshAnnotations() {
		if (!selected) return;
		if (selected.media_type === 'image') {
			const { data } = await listImgAnn({
				client,
				path: { pid: project.id },
				query: { media_id: selected.id }
			});
			annotations = data ?? [];
		} else {
			const { data } = await listVidAnn({
				client,
				path: { pid: project.id },
				query: { media_id: selected.id }
			});
			annotations = data ?? [];
		}
		drawOverlay();
	}

	function selectMedia(item: MediaRead) {
		selected = item;
		scale = 1;
		offsetX = 0;
		offsetY = 0;
		refreshAnnotations();
	}

	function fileName() {
		return selected ? selected.path.split('/').pop() : '';
	}

	/* ─────────────────── annotation operations ─────────────────── */
	function pushUndo() {
		undoStack.push(JSON.parse(JSON.stringify(annotations)));
		redoStack = [];
	}

	function toImageCoords(e: MouseEvent) {
		/* rectangles */
		const mainRect = annCanvas.getBoundingClientRect();
		const imgRect = imgEl.getBoundingClientRect();

		/* object‑contain scale factor */
		const baseScale = imgRect.width / imgW; // imgW set in handleImgLoad()

		/* mouse position in viewer space */
		const mx = e.clientX - mainRect.left;
		const my = e.clientY - mainRect.top;

		/* remove viewer pan & the img’s offset inside <main> */
		const vx = mx - offsetX - (imgRect.left - mainRect.left);
		const vy = my - offsetY - (imgRect.top - mainRect.top);

		/* reverse zoom & object‑contain, then round */
		const x = Math.round(vx / (scale * baseScale));
		const y = Math.round(vy / (scale * baseScale));

		/* clamp to the native image size */
		return [Math.max(0, Math.min(imgW - 1, x)), Math.max(0, Math.min(imgH - 1, y))];
	}

	async function addAnnotation(x: number, y: number, positive = true) {
		if (!selected) return;
		pushUndo();

		let res;
		if (selected.media_type === 'image') {
			let newAnnotation: ImageAnnotationCreate = {
				media_id: selected.id,
				points: [[x, y]],
				labels: [positive ? 1 : 0]
			};

			res = await addImgAnn({
				client,
				body: newAnnotation,
				path: { pid: project.id }
			});
		} else if (selected.media_type === 'video') {
			console.error('Video annotation not implemented yet');
			return;
		} else {
			console.error('Unsupported media type for annotation:', selected.media_type);
			return;
		}

		if (res.response.ok && res.data) {
			toast.success('Annotation added');
		} else {
			toast.error('Failed to add annotation');
		}

		refreshAnnotations();
		refreshMedia();
		inferencePlaceholder();
		drawOverlay();
	}

	async function deleteNearest(x: number, y: number) {
		if (!annotations.length || !selected) return;
		pushUndo();
		const idx = annotations.reduce((best, ann, i) => {
			const [ax, ay] = (ann as any).points[0];
			const [bx, by] = (annotations[best] as any).points[0];
			return (ax - x) ** 2 + (ay - y) ** 2 < (bx - x) ** 2 + (by - y) ** 2 ? i : best;
		}, 0);

		let res;
		if (selected.media_type === 'image') {
			res = await deleteImgAnn({
				client,
				path: {
					pid: project.id,
					aid: (annotations[idx] as ImageAnnotationRead).id
				}
			});
		} else if (selected.media_type === 'video') {
			console.error('Video annotation deletion not implemented yet');
			return;
		} else {
			console.error('Unsupported media type for deletion:', selected.media_type);
			return;
		}

		if (res.response.ok && res.data) {
			toast.success('Annotation deleted');
		} else {
			toast.error('Failed to delete annotation');
		}

		refreshAnnotations();
		refreshMedia();
		inferencePlaceholder();
		drawOverlay();
	}

	function undo() {
		if (!undoStack.length) return;
		redoStack.push(JSON.parse(JSON.stringify(annotations)));
		annotations = undoStack.pop()!;
		inferencePlaceholder();
		drawOverlay();
	}
	function redo() {
		if (!redoStack.length) return;
		undoStack.push(JSON.parse(JSON.stringify(annotations)));
		annotations = redoStack.pop()!;
		inferencePlaceholder();
		drawOverlay();
	}

	/* ───────────── image navigation ───────────── */
	function indexIn(list: MediaRead[], id?: number) {
		return list.findIndex((m) => m.id === id);
	}

	function prevImage() {
		if (!media.length) return;
		const idx = indexIn(media, selected?.id);
		const prev = media[(idx - 1 + media.length) % media.length];
		selectMedia(prev);
	}

	function nextImage() {
		if (!media.length) return;
		const idx = indexIn(media, selected?.id);
		const next = media[(idx + 1) % media.length];
		selectMedia(next);
	}

	function nextUnannotated() {
		if (!unannotated.length) return;
		const idx = indexIn(unannotated, selected?.id);
		const next = unannotated[(idx + 1) % unannotated.length];
		selectMedia(next);
	}

	/* ─────────────── inference placeholder (stub) ─────────────── */
	function inferencePlaceholder() {
		console.log('▶️ inference placeholder', {
			model_id: Number(selectedModelId), // convert when you need the number
			media_id: selected?.id,
			annotations
		});
	}

	/* ──────────────────────── keyboard shortcuts ─────────────────────── */
	function handleKey(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') {
			nextImage();
			return;
		}
		if (e.key === 'ArrowLeft') {
			prevImage();
			return;
		}
		if (e.key.toLowerCase() === 'u') {
			nextUnannotated();
			return;
		}

		if (e.ctrlKey && e.key === 'z') {
			undo();
			return;
		}
		if (e.ctrlKey && e.key === 'y') {
			redo();
			return;
		}
	}

	function drawOverlay() {
		const ctx = annCanvas?.getContext('2d');
		if (!ctx || !selected || !imgEl) return;

		const dpr = window.devicePixelRatio || 1;

		/* viewer box */
		const dispW = viewerEl.clientWidth;
		const dispH = viewerEl.clientHeight;

		annCanvas.style.width = `${dispW}px`;
		annCanvas.style.height = `${dispH}px`;

		annCanvas.width = dispW * dpr;
		annCanvas.height = dispH * dpr;

		ctx.scale(dpr, dpr);

		ctx.clearRect(0, 0, dispW, dispH);

		/* apply transforms */
		const mainRect = annCanvas.getBoundingClientRect();
		const imgRect = imgEl.getBoundingClientRect();
		const baseScale = imgRect.width / imgW;

		ctx.translate(offsetX + (imgRect.left - mainRect.left), offsetY + (imgRect.top - mainRect.top));
		ctx.scale(scale * baseScale, scale * baseScale);

		annotations.forEach((ann) => {
			const [x, y] = (ann as any).points[0];
			ctx.fillStyle = (ann as any).labels[0] === 1 ? '#22c55e' : '#ef4444';
			ctx.beginPath();
			ctx.arc(x, y, 4 / (scale * baseScale), 0, Math.PI * 2);
			ctx.fill();
		});
	}

	function getSelectedModel(): ModelRead | undefined {
		// convert the string back to a number for comparison
		return models.find((m) => m.id === Number(selectedModelId));
	}

	/* ────────────────────── lifecycle hooks ────────────────────── */
	onMount(() => {
		refreshMedia();
		refreshModels();
	});
</script>

<svelte:window on:keydown={handleKey} />

<!-- Header -->
<div class="mb-6">
	<ProjectNav
		content={[
			{ name: 'Projects', href: '/' },
			{ name: project.name, href: `/projects/${project.id}` },
			[
				{ name: 'Gallery', href: `/projects/${project.id}/gallery` },
				{ name: 'Studio', href: `/projects/${project.id}/studio`, active: true },
				{ name: 'Models', href: `/projects/${project.id}/models` },
				{ name: 'Export', href: `/projects/${project.id}/export` }
			]
		]}
	/>
</div>

<!-- ───────────────────────────── WORKSPACE LAYOUT ───────────────────────────── -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="flex h-[calc(100vh-7rem)] w-full gap-2 select-none">
	<!-- LEFT SIDEBAR -->
	<aside class="w-[270px] shrink-0 rounded-lg border bg-background p-2">
		<ScrollArea class="h-full pr-1">
			<Collapsible bind:open={showUnannotated}>
				<CollapsibleTrigger>
					<Button variant="ghost" class="mb-1 w-full justify-between">
						<span class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Unannotated
						</span>
						<span class="ml-2 text-muted-foreground">{unannotated.length}</span>
						<ChevronDown
							class="h-4 w-4 transition-transform duration-200 {showUnannotated
								? 'rotate-180'
								: ''}"
						/>
					</Button>
				</CollapsibleTrigger>

				<CollapsibleContent>
					<ul class="space-y-1">
						{#each unannotated as item}
							<li>
								<Button
									variant={selected?.id === item.id ? 'secondary' : 'ghost'}
									class="w-full justify-start"
									onclick={() => selectMedia(item)}
								>
									{item.path.split('/').pop()}
								</Button>
							</li>
						{/each}
					</ul>
				</CollapsibleContent>
			</Collapsible>

			<!-- ─── ANNOTATED ─── -->
			<Collapsible bind:open={showAnnotated} class="mt-4">
				<CollapsibleTrigger>
					<Button variant="ghost" class="mb-1 w-full justify-between">
						<span class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Annotated
						</span>
						<span class="ml-2 text-muted-foreground">{annotated.length}</span>
						<ChevronDown
							class="h-4 w-4 transition-transform duration-200 {showAnnotated ? 'rotate-180' : ''}"
						/>
					</Button>
				</CollapsibleTrigger>

				<CollapsibleContent>
					<ul class="space-y-1">
						{#each annotated as item}
							<li>
								<Button
									variant={selected?.id === item.id ? 'secondary' : 'ghost'}
									class="w-full justify-start"
									onclick={() => selectMedia(item)}
								>
									{item.path.split('/').pop()}
								</Button>
							</li>
						{/each}
					</ul>
				</CollapsibleContent>
			</Collapsible>
		</ScrollArea>
	</aside>

	<!-- CENTER VIEWER -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<main
		bind:this={viewerEl}
		class="relative flex-1 rounded-lg bg-black"
		oncontextmenu={(e) => e.preventDefault()}
		onclick={(e) => {
			if (!selected) return;
			const [ix, iy] = toImageCoords(e);
			if (e.ctrlKey || e.metaKey) addAnnotation(ix, iy, false);
			else if (e.button === 0) addAnnotation(ix, iy, true);
		}}
		onauxclick={(e) => {
			if (e.button === 2 && selected) {
				const [ix, iy] = toImageCoords(e);
				deleteNearest(ix, iy);
			}
		}}
	>
		{#if selected}
			{#if fileName()}
				<div
					class="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-2 py-1 text-lg text-white"
				>
					{fileName()}
				</div>
			{/if}
			{#if selected.media_type === 'image'}
				<img
					bind:this={imgEl}
					onload={handleImgLoad}
					src={`${PUBLIC_API_BASE}/api/v1/projects/${project.id}/media/${selected.id}`}
					alt={selected.path}
					draggable="false"
					class="absolute inset-0 m-auto max-h-full max-w-full object-contain"
				/>
			{:else}
				<video
					src={`${PUBLIC_API_BASE}/api/v1/projects/${project.id}/media/${selected.id}`}
					controls
					class="absolute inset-0 m-auto max-h-full max-w-full object-contain"
				>
					<track kind="captions" />
				</video>
			{/if}
		{/if}

		<!-- overlay canvases -->
		<canvas bind:this={annCanvas} class="pointer-events-none absolute inset-0"></canvas>
	</main>

	<!-- RIGHT TOOLBAR -->
	<aside class="flex w-[270px] shrink-0 flex-col rounded-lg border bg-background p-2">
		<div class="mb-4 flex items-center justify-between gap-1">
			<Button size="sm" variant="ghost" title="Previous (←)" onclick={prevImage}>(←) Prev</Button>
			<Button size="sm" variant="ghost" title="Next (→)" onclick={nextImage}>Next (→)</Button>
			<Button size="sm" variant="outline" title="Next unannotated (U)" onclick={nextUnannotated}>
				Next (U)
			</Button>
		</div>
		<!-- model picker -->
		<div>
			<span class="mb-1 block text-sm font-medium text-foreground">Model</span>

			<Select
				type="single"
				bind:value={selectedModelId}
				onValueChange={() => inferencePlaceholder()}
			>
				<SelectTrigger class="w-full" placeholder="Select a model">
					{getSelectedModel()?.name}
				</SelectTrigger>

				<SelectContent>
					{#each models as m}
						<SelectItem value={String(m.id)}>{m.name}</SelectItem>
					{/each}
				</SelectContent>
			</Select>
		</div>

		<!-- annotation list + undo/redo -->
		<div class="flex min-h-0 flex-1 flex-col">
			<div class="mb-2 flex items-center justify-between">
				<h4 class="text-sm font-medium">Annotations ({annotations.length})</h4>
				<div class="space-x-1">
					<Button variant="ghost" size="sm" onclick={undo} disabled={undoStack.length === 0}
						>Undo</Button
					>
					<Button variant="ghost" size="sm" onclick={redo} disabled={redoStack.length === 0}
						>Redo</Button
					>
				</div>
			</div>

			<ScrollArea class="flex-1 overflow-y-auto pr-1">
				<ul class="h-full space-y-1 text-xs">
					{#each annotations as ann}
						<li class="flex items-center justify-between rounded bg-muted/60 px-2 py-1">
							<span class="truncate {ann.labels[0] === 1 ? 'text-green-600' : 'text-red-600'}">
								{ann.labels[0] === 1 ? 'Positive' : 'Negative'} • {(ann as any).points[0].join(',')}
							</span>
							<Button
								variant="ghost"
								size="icon"
								class="ml-2 text-muted-foreground hover:text-destructive"
								onclick={() => deleteNearest((ann as any).points[0][0], (ann as any).points[0][1])}
							>
								&times;
							</Button>
						</li>
					{/each}
				</ul>
			</ScrollArea>
		</div>
	</aside>
</div>

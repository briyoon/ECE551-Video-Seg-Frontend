<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import ProjectNav from '$lib/components/ProjectNav.svelte';
	import VideoPlayer from '$lib/components/VideoPlayer.svelte';
	import { PUBLIC_API_BASE } from '$env/static/public';

	// shadcn‑svelte UI components
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { ChevronDown, LoaderCircle } from '@lucide/svelte';
	import type {
		MediaRead,
		ProjectRead,
		ImagePromptRead,
		VideoPromptRead,
		ImagePromptCreate,
		VideoPromptCreate,
		ImageAnnotationRead,
		VideoAnnotationRead,
		LabelRead
	} from '$lib/api/openapi/types.gen';
	import {
		listMediaApiV1ProjectsPidMediaGet as listMedia,
		listImagePromptsApiV1ProjectsPidPromptsImageGet as listImagePrompt,
		listVideoPromptsApiV1ProjectsPidPromptsVideoGet as listVideoPrompt,
		listModelsApiV1ModelsGet as listModels,
		addImagePromptApiV1ProjectsPidPromptsImagePost as addImagePrompt,
		deleteImagePromptApiV1ProjectsPidPromptsImageAidDelete as deleteImagePrompt,
		getImageAnnotationApiV1ProjectsPidAnnotationsImageMidGet as getImageAnnotation,
		getVideoAnnotationApiV1ProjectsPidAnnotationsVideoMidGet as getVideoAnnotation,
		addVideoPromptApiV1ProjectsPidPromptsVideoPost as addVideoPrompt,
		deleteVideoPromptApiV1ProjectsPidPromptsVideoAidDelete as deleteVideoPrompt,
		listLabelsApiV1ProjectsPidLabelsGet as listLabels
	} from '$lib/api/openapi/sdk.gen';
	import { client } from '$lib/api/client';
	import {
		Collapsible,
		CollapsibleContent,
		CollapsibleTrigger
	} from '$lib/components/ui/collapsible';
	import { toast } from 'svelte-sonner';

	const project = /** @type {ProjectRead} */ (/** @ts-ignore */ getContext<ProjectRead>('project'));

	let viewerEl: HTMLElement;

	let eventStream: EventSource | undefined = $state();

	/* ─────────────────────── state & refs ─────────────────────── */
	let media: MediaRead[] = $state([]);
	let annotated: MediaRead[] = $state([]);
	let unannotated: MediaRead[] = $state([]);
	let selected: MediaRead | undefined = $state();
	let queued = $state(new Set<number>());

	let isLoadingVideo = $state(false);
	let isSubmitting = $state(false);
	let isPlaying = $state(false);

	let showUnannotated = $state(true);
	let showAnnotated = $state(true);

	let models: string[] = $state([]);
	let selectedModelId: string | undefined = $state();

	let labels: LabelRead[] = $state([]);
	let selectedLabelId: number | undefined = $state(); // active label for new prompts

	let prompts: (ImagePromptRead | VideoPromptRead | VideoPromptCreate)[] = $state([]);
	let annotations: (ImageAnnotationRead | VideoAnnotationRead)[] = $state([]);

	// video specific
	let currentFrameIdx = $state(0);
	let videoPromptsCache: VideoPromptRead[] = $state([]);
	let videoAnnotationsCache: VideoAnnotationRead[] = $state([]);
	let pendingPrompts: VideoPromptCreate[] = $state([]); // buffered prompts
	let pendingDeletes: number[] = $state([]); // buffered delete IDs
	let annotationVersion = $state(Date.now()); // cache buster for SSR frames

	function updateVideoView() {
		if (selected?.media_type !== 'video') return;
		const cached = videoPromptsCache.filter(
			(p) => p.frame_idx === currentFrameIdx && !pendingDeletes.includes(p.id)
		);
		const pending = pendingPrompts.filter((p) => p.frame_idx === currentFrameIdx);
		prompts = [...cached, ...pending];

		annotations = videoAnnotationsCache.filter((a) => a.frame_idx === currentFrameIdx);
		drawOverlay();
	}

	// viewer transform
	let scale = 1;
	let offsetX = 0;
	let offsetY = 0;

	// undo / redo
	let undoStack: (typeof prompts)[] = $state([]);
	let redoStack: (typeof prompts)[] = $state([]);

	// canvases
	let annCanvas: HTMLCanvasElement;

	// @ts-expect-error TS2493: 'Image' not available during SSR
	let imgEl: HTMLImageElement = $state();
	let imgW = 1;
	let imgH = 1; // natural resolution

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
		annotated = alphaSort(media.filter((m) => (m as MediaRead).prompt_count > 0));
		unannotated = alphaSort(media.filter((m) => (m as MediaRead).prompt_count === 0));
		if (!selected && media.length) selectMedia(media[0]);
	}

	async function refreshLabels() {
		const { data } = await listLabels({ client, path: { pid: project.id } });
		labels = data ?? [];
		if (labels.length && selectedLabelId === undefined) selectedLabelId = labels[0].id;
	}

	async function refreshModels() {
		const { data } = await listModels({ client });
		models = data ?? [];
		selectedModelId = project.default_model_id;
	}

	async function refreshPrompts() {
		if (!selected) return;
		console.log('refreshPrompts', selected.id, currentFrameIdx);
		if (selected.media_type === 'image') {
			const { data } = await listImagePrompt({
				client,
				path: { pid: project.id },
				query: { media_id: selected.id }
			});
			prompts = data ?? [];
			drawOverlay();
		} else {
			const { data } = await listVideoPrompt({
				client,
				path: { pid: project.id },
				query: { media_id: selected.id } // Fetch ALL
			});
			videoPromptsCache = data ?? [];
			updateVideoView();
		}
	}

	async function refreshAnnotations() {
		if (!selected) return;
		if (selected.media_type === 'image') {
			const { data } = await getImageAnnotation({
				client,
				path: { pid: project.id, mid: selected.id }
			});
			annotations = data ?? [];
			drawOverlay();
		} else {
			const { data } = await getVideoAnnotation({
				client,
				path: { pid: project.id, mid: selected.id },
				query: {} // Fetch ALL
			});
			videoAnnotationsCache = data ?? [];
			updateVideoView();
		}
	}

	function selectMedia(item: MediaRead) {
		selected = item;
		scale = 1;
		offsetX = 0;
		offsetY = 0;
		currentFrameIdx = 0; // Reset frame index

		// Reset UI states
		isLoadingVideo = false;
		isSubmitting = false;

		refreshPrompts();
		refreshAnnotations();
	}

	function fileName() {
		return selected ? selected.path.split('/').pop() : '';
	}

	/* ─────────────────── annotation operations ─────────────────── */
	function isImagePrompt(p: ImagePromptRead | VideoPromptRead): p is ImagePromptRead {
		return 'x' in p;
	}

	function pushUndo() {
		undoStack.push(JSON.parse(JSON.stringify(prompts)));
		redoStack = [];
	}

	function toImageCoords(e: MouseEvent) {
		/* rectangles */
		const mainRect = annCanvas.getBoundingClientRect();
		const imgRect = imgEl.getBoundingClientRect();

		/* object‑contain scale factor */
		const baseScale = Math.min(
			imgRect.width / imgW, // scale chosen when width is the limiting side
			imgRect.height / imgH // scale chosen when height is the limiting side
		);
		const targetW = imgW * baseScale;
		const targetH = imgH * baseScale;
		const ox = (imgRect.width - targetW) / 2;
		const oy = (imgRect.height - targetH) / 2;

		/* mouse position in viewer space */
		const mx = e.clientX - mainRect.left;
		const my = e.clientY - mainRect.top;

		/* remove viewer pan & the img’s offset & centering offset */
		const vx = mx - offsetX - (imgRect.left - mainRect.left) - ox;
		const vy = my - offsetY - (imgRect.top - mainRect.top) - oy;

		/* reverse zoom & object‑contain, then round */
		const x = Math.round(vx / (scale * baseScale));
		const y = Math.round(vy / (scale * baseScale));

		/* clamp to the native image size */
		return [Math.max(0, Math.min(imgW - 1, x)), Math.max(0, Math.min(imgH - 1, y))];
	}

	async function addPrompt(x: number, y: number, positive = true) {
		if (!selected) return;
		if (selectedLabelId === undefined) {
			toast.error('Please select a label first');
			return;
		}
		pushUndo();

		let res;
		if (selected.media_type === 'image') {
			let newPrompt: ImagePromptCreate = {
				media_id: selected.id,
				label_id: selectedLabelId!,
				x: x,
				y: y,
				click_label: positive ? 1 : 0
			};

			try {
				// start spinner early
				queued.add(Number(selected.id));
				queued = new Set(queued);

				res = await addImagePrompt({
					client,
					body: newPrompt,
					path: { pid: project.id },
					query: { model_key: selectedModelId as any }
				});

				if (!res.response.ok) throw new Error('Failed');
				// On success, we keep the spinner active until SSE event arrives
				toast.success('Prompt added');
			} catch (err) {
				console.error(err);
				toast.error('Failed to add prompt');
				queued.delete(Number(selected.id));
				queued = new Set(queued);
			}
		} else if (selected.media_type === 'video') {
			let objIdx = 0;
			// check if we have an existing object for this label
			// Search in cache AND pending
			const allPrompts = [...videoPromptsCache, ...pendingPrompts];
			// Filter by label ID?
			// Ideally we want to match existing object ID for that label.
			const match = allPrompts.find((p) => p.label_id === selectedLabelId);
			if (match) {
				objIdx = match.obj_idx;
			} else {
				// new object
				if (allPrompts.length > 0) {
					objIdx = Math.max(...allPrompts.map((p) => p.obj_idx)) + 1;
				}
			}

			let newPrompt: VideoPromptCreate = {
				media_id: selected.id,
				label_id: selectedLabelId!,
				frame_idx: currentFrameIdx,
				obj_idx: objIdx,
				points: [[x, y]],
				labels: [positive ? 1 : 0]
			};

			pendingPrompts.push(newPrompt);
			toast.info('Prompt buffered (Press Enter to Submit)');
			drawOverlay();
		} else {
			console.error('Unsupported media type for prompt:', selected.media_type);
			return;
		}

		refreshPrompts();
		refreshMedia();
	}

	async function submitPrompts() {
		if ((!pendingPrompts.length && !pendingDeletes.length) || !selected) return;

		isSubmitting = true;
		queued.add(Number(selected.id));
		queued = new Set(queued);

		try {
			const payload = {
				add: pendingPrompts,
				delete: pendingDeletes
			};

			const res = await fetch(
				`${PUBLIC_API_BASE}/api/v1/projects/${project.id}/prompts/video/sync?model_key=${encodeURIComponent(
					selectedModelId!
				)}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				}
			);

			if (!res.ok) throw new Error('Failed');

			toast.info('Processing updates...');

			pendingPrompts = [];
			pendingDeletes = [];
			updateVideoView();
		} catch (err) {
			console.error(err);
			toast.error('Failed to submit updates');
			queued.delete(Number(selected.id));
			queued = new Set(queued);
		} finally {
			isSubmitting = false;
		}
	}

	async function loadVideo() {
		if (!selected || selected.media_type !== 'video') return;

		isLoadingVideo = true;
		const id = selected.id;
		queued.add(id);
		queued = new Set(queued);

		try {
			const res = await fetch(
				`${PUBLIC_API_BASE}/api/v1/projects/${project.id}/prompts/video/load?media_id=${id}&model_key=${encodeURIComponent(selectedModelId)}`,
				{
					method: 'POST'
				}
			);
			if (!res.ok) throw new Error('Failed to load video');
			toast.success('Video loaded into memory');
		} catch (err) {
			console.error(err);
			toast.error('Failed to load video');
		} finally {
			queued.delete(id);
			queued = new Set(queued);
			isLoadingVideo = false;
		}
	}

	async function deleteNearestPrompt(x: number, y: number) {
		if (!prompts.length || !selected) return;
		pushUndo();
		const idx = prompts.reduce((best, prompt, i) => {
			let px = 0,
				py = 0;
			if (isImagePrompt(prompt)) {
				px = prompt.x;
				py = prompt.y;
			} else {
				px = prompt.points[0][0];
				py = prompt.points[0][1];
			}

			const [ax, ay] = [px, py];

			let bx = 0,
				by = 0;
			const bestP = prompts[best];
			if (isImagePrompt(bestP)) {
				bx = bestP.x;
				by = bestP.y;
			} else {
				bx = bestP.points[0][0];
				by = bestP.points[0][1];
			}

			return (ax - x) ** 2 + (ay - y) ** 2 < (bx - x) ** 2 + (by - y) ** 2 ? i : best;
		}, 0);

		// start spinner early

		try {
			let res;
			if (selected.media_type === 'image') {
				queued.add(Number(selected.id));
				queued = new Set(queued);
				res = await deleteImagePrompt({
					client,
					path: {
						pid: project.id,
						aid: (prompts[idx] as ImagePromptRead).id
					}
				});
				if (res && !res.response.ok) throw new Error('Failed');
				// On success, we keep the spinner active until SSE event arrives
				toast.success('Prompt deleted');
			} else if (selected.media_type === 'video') {
				const p = prompts[idx];
				if ('id' in p) {
					// Server key
					pendingDeletes.push(p.id);
					toast.info('Deletion buffered');
				} else {
					// Local key (pending prompt)
					pendingPrompts = pendingPrompts.filter((item) => item !== p);
					toast.info('Buffered prompt removed');
				}
				updateVideoView();
			} else {
				throw new Error('Unsupported media type');
			}
		} catch (err) {
			console.error(err);
			toast.error('Failed to delete prompt');
			if (selected.media_type === 'image') {
				queued.delete(Number(selected.id));
				queued = new Set(queued);
			}
		}

		refreshPrompts();
		refreshMedia();
	}

	function undo() {
		if (!undoStack.length) return;
		redoStack.push(JSON.parse(JSON.stringify(prompts)));
		prompts = undoStack.pop()!;
		drawOverlay();
	}
	function redo() {
		if (!redoStack.length) return;
		undoStack.push(JSON.parse(JSON.stringify(prompts)));
		prompts = redoStack.pop()!;
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

	/* ──────────────────────── keyboard shortcuts ─────────────────────── */
	function handleKey(e: KeyboardEvent) {
		const n = parseInt(e.key);
		if (!isNaN(n) && n >= 1 && n <= labels.length) {
			selectedLabelId = labels[n - 1].id;
			e.preventDefault();
		}

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

		if (e.key === 'Enter') {
			submitPrompts();
			return;
		}
	}

	/* ────────────── RLE decoding & mask drawing ────────────── */
	function decodeRle(rle: string | null | undefined, width: number, height: number) {
		if (!rle) return new Uint8Array(0);
		const nums = rle.split(/[\s,]+/).map(Number); // handle commas or spaces
		const mask = new Uint8Array(width * height);
		for (let i = 0; i < nums.length; i += 2) {
			const start = nums[i];
			const len = nums[i + 1];
			mask.fill(1, start, start + len);
		}
		return mask;
	}

	function drawMasks(ctx: CanvasRenderingContext2D) {
		if (!annotations.length) return;

		const imgData = ctx.createImageData(imgW, imgH);
		const data = imgData.data;

		annotations.forEach((ann) => {
			const colorHex = labels.find((l) => l.id === ann.label_id)?.color ?? '#ffffff';
			const r = parseInt(colorHex.slice(1, 3), 16);
			const g = parseInt(colorHex.slice(3, 5), 16);
			const b = parseInt(colorHex.slice(5, 7), 16);

			const mask = decodeRle(ann.mask_rle, imgW, imgH);
			for (let i = 0; i < mask.length; i++) {
				if (mask[i]) {
					const idx = i * 4;
					data[idx] = r;
					data[idx + 1] = g;
					data[idx + 2] = b;
					data[idx + 3] = 128; // A
				}
			}

			const offsets4 = [-1, 1, -imgW, imgW]; // L, R, U, D
			const offsets8 = [-imgW - 1, -imgW, -imgW + 1, -1, 0, 1, imgW - 1, imgW, imgW + 1]; // for dilation

			for (let i = 0; i < mask.length; ++i) {
				if (!mask[i]) continue;

				// is this pixel on the mask boundary?
				const isEdge = offsets4.some((o) => {
					const n = i + o;
					return n < 0 || n >= mask.length ? true : !mask[n];
				});

				if (isEdge) {
					// paint this pixel *and* its 8-connected neighbours
					offsets8.forEach((o) => {
						const j = i + o;
						if (j < 0 || j >= mask.length) return;
						const jdx = j * 4;
						data[jdx] = r;
						data[jdx + 1] = g;
						data[jdx + 2] = b;
						data[jdx + 3] = 255; // fully opaque outline
					});
				}
			}
		});

		const temp = document.createElement('canvas');
		temp.width = imgW;
		temp.height = imgH;
		temp.getContext('2d')!.putImageData(imgData, 0, 0);

		ctx.drawImage(temp, 0, 0);
	}

	function drawPrompts(ctx: CanvasRenderingContext2D) {
		const mainRect = annCanvas!.getBoundingClientRect();
		const imgRect = imgEl!.getBoundingClientRect();
		const baseScale = Math.min(imgRect.width / imgW, imgRect.height / imgH);

		prompts.forEach((p) => {
			let pts: number[][] = [];
			let lbls: number[] = [];

			if (isImagePrompt(p)) {
				pts = [[p.x, p.y]];
				lbls = [p.click_label];
			} else {
				pts = p.points;
				lbls = p.labels;
			}

			pts.forEach((pt, i) => {
				const [x, y] = pt;
				ctx.fillStyle = labels.find((l) => l.id === p.label_id)?.color ?? '#ffffff';
				const r = 8 / (scale * baseScale);
				ctx.beginPath();
				ctx.arc(x, y, r, 0, Math.PI * 2);
				ctx.fill();
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 1 / (scale * baseScale);
				ctx.beginPath();
				ctx.moveTo(x - r * 0.6, y);
				ctx.lineTo(x + r * 0.6, y);
				if (lbls[i] === 1) {
					ctx.moveTo(x, y - r * 0.6);
					ctx.lineTo(x, y + r * 0.6);
				}
				ctx.stroke();
			});
		});

		// draw pending
		pendingPrompts.forEach((p) => {
			if (p.frame_idx !== currentFrameIdx) return;
			const pt = p.points[0];
			const [x, y] = pt;

			ctx.fillStyle = labels.find((l) => l.id === p.label_id)?.color ?? '#ffffff';
			const r = 8 / (scale * baseScale);

			// Dashed stroke for pending
			ctx.save();
			ctx.setLineDash([2, 2]);

			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
			ctx.strokeStyle = '#ffff00'; // Yellow stroke for pending
			ctx.lineWidth = 2 / (scale * baseScale);
			ctx.beginPath();
			ctx.moveTo(x - r * 0.6, y);
			ctx.lineTo(x + r * 0.6, y);
			if (p.labels[0] === 1) {
				ctx.moveTo(x, y - r * 0.6);
				ctx.lineTo(x, y + r * 0.6);
			}
			ctx.stroke();
			ctx.restore();
		});
	}

	function drawOverlay() {
		const ctx = annCanvas?.getContext('2d');
		if (!ctx || !selected || !imgEl) return;

		const dpr = window.devicePixelRatio || 1;

		const dispW = viewerEl.clientWidth;
		const dispH = viewerEl.clientHeight;

		annCanvas.style.width = `${dispW}px`;
		annCanvas.style.height = `${dispH}px`;
		annCanvas.width = dispW * dpr;
		annCanvas.height = dispH * dpr;

		ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
		ctx.clearRect(0, 0, annCanvas.width, annCanvas.height);

		const mainRect = annCanvas.getBoundingClientRect();
		const imgRect = imgEl.getBoundingClientRect();

		ctx.scale(scale * dpr, scale * dpr);
		ctx.translate(offsetX, offsetY);
		ctx.translate(imgRect.left - mainRect.left, imgRect.top - mainRect.top);

		const baseScale = Math.min(imgRect.width / imgW, imgRect.height / imgH);
		const targetW = imgW * baseScale;
		const targetH = imgH * baseScale;
		const ox = (imgRect.width - targetW) / 2;
		const oy = (imgRect.height - targetH) / 2;

		ctx.scale(baseScale, baseScale);
		ctx.translate(ox / baseScale, oy / baseScale);

		// Only draw masks client-side for images.
		// For video, we use Server-Side Rendering (SSR) via the frame URL.
		if (selected.media_type === 'image') {
			drawMasks(ctx);
		}

		drawPrompts(ctx);
	}

	function getEventStream() {
		const es = new EventSource(`${PUBLIC_API_BASE}/api/v1/projects/${project.id}/events`);
		es.onmessage = (evt) => {
			const msg = JSON.parse(evt.data);
			if (msg.event === 'annotations_updated') {
				queued.delete(msg.media_id);
				queued = new Set(queued);
				if (selected && selected.id === msg.media_id) {
					refreshPrompts();
					annotationVersion = Date.now();
				}
				refreshMedia();
			} else if (msg.event === 'video_progress') {
				// optional: could use toast to show background progress if needed
			}
		};
		return es;
	}

	onMount(() => {
		refreshMedia();
		refreshModels();
		refreshLabels();
		eventStream = getEventStream();
	});
	onDestroy(() => eventStream?.close());
</script>

<svelte:window onkeydown={handleKeydown} onresize={drawOverlay} />

<!-- Header -->
<div class="mb-6">
	<ProjectNav
		content={[
			{ name: 'Projects', href: '/' },
			{ name: project?.name, href: `/projects/${project?.id}` },
			[
				{ name: 'Gallery', href: `/projects/${project?.id}/gallery` },
				{ name: 'Studio', href: `/projects/${project?.id}/studio`, active: true },
				{ name: 'Labels', href: `/projects/${project?.id}/labels` }
			]
		]}
	/>
</div>

<!-- ───────────────────────────── WORKSPACE LAYOUT ───────────────────────────── -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="flex h-[calc(100vh-7rem)] w-full select-none gap-2">
	<!-- LEFT SIDEBAR -->
	<aside class="bg-background w-[270px] shrink-0 rounded-lg border p-2">
		<ScrollArea class="h-full pr-1">
			<Collapsible bind:open={showUnannotated}>
				<CollapsibleTrigger>
					<Button variant="ghost" class="mb-1 w-full justify-between">
						<span class="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
							Unannotated
						</span>
						<span class="text-muted-foreground ml-2">{unannotated.length}</span>
						<ChevronDown
							class="h-4 w-4 transition-transform duration-200 {showUnannotated
								? 'rotate-180'
								: ''}"
						/>
					</Button>
				</CollapsibleTrigger>

				<CollapsibleContent>
					<ul class="space-y-1">
						{#each unannotated as item (item.id)}
							<li>
								<Button
									variant={selected?.id === item.id ? 'secondary' : 'ghost'}
									class="w-full justify-start"
									onclick={() => selectMedia(item)}
								>
									{item.path.split('/').pop()}
									{#if queued.has(item.id)}<LoaderCircle class="ml-2 h-4 w-4 animate-spin" />{/if}
								</Button>
							</li>
						{/each}
					</ul>
				</CollapsibleContent>
			</Collapsible>

			<Collapsible bind:open={showAnnotated} class="mt-4">
				<CollapsibleTrigger>
					<Button variant="ghost" class="mb-1 w-full justify-between">
						<span class="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
							Annotated
						</span>
						<span class="text-muted-foreground ml-2">{annotated.length}</span>
						<ChevronDown
							class="h-4 w-4 transition-transform duration-200 {showAnnotated ? 'rotate-180' : ''}"
						/>
					</Button>
				</CollapsibleTrigger>

				<CollapsibleContent>
					<ul class="space-y-1">
						{#each annotated as item (item.id)}
							<li>
								<Button
									variant={selected?.id === item.id ? 'secondary' : 'ghost'}
									class="w-full justify-start"
									onclick={() => selectMedia(item)}
								>
									{item.path.split('/').pop()}
									{#if queued.has(item.id)}<LoaderCircle class="ml-2 h-4 w-4 animate-spin" />{/if}
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
			if (e.ctrlKey || e.metaKey) addPrompt(ix, iy, false);
			else if (e.button === 0) addPrompt(ix, iy, true);
		}}
		onauxclick={(e) => {
			if (e.button === 2 && selected) {
				const [ix, iy] = toImageCoords(e);
				deleteNearestPrompt(ix, iy);
			}
		}}
	>
		{#if selected}
			{#if fileName()}
				<div
					class="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-1 text-lg text-white"
				>
					{fileName()}
					{#if queued.has(selected.id)}
						<LoaderCircle class="ml-2 inline h-4 w-4 animate-spin" />
					{/if}
				</div>
			{/if}
			{#if selected.media_type === 'image'}
				<img
					bind:this={imgEl}
					onload={handleImgLoad}
					src={`${PUBLIC_API_BASE}/api/v1/projects/${project.id}/media/${selected.id}`}
					alt={selected.path}
					draggable="false"
					class="absolute inset-0 m-auto h-full w-auto object-contain"
				/>
			{:else if selected.media_type === 'video'}
				<VideoPlayer
					src={`${PUBLIC_API_BASE}/api/v1/projects/${project.id}/media/${selected.id}/frames`}
					urlSuffix={`/annotated?t=${annotationVersion}`}
					totalFrames={selected.frame_count ?? 100}
					bind:currentFrameIdx
					bind:isPlaying
					bind:imgElement={imgEl}
					on:change={updateVideoView}
					on:imgload={handleImgLoad}
				></VideoPlayer>
			{/if}
		{/if}

		<!-- overlay canvases -->
		<canvas bind:this={annCanvas} class="pointer-events-none absolute inset-0"></canvas>
	</main>

	<!-- RIGHT TOOLBAR -->
	<aside class="bg-background flex w-[270px] shrink-0 flex-col rounded-lg border p-2">
		<div class="mb-4 flex flex-col gap-2 border-b pb-4">
			<div class="flex items-center justify-between gap-1">
				<Button size="sm" variant="ghost" title="Previous (←)" onclick={prevImage}>(←) Prev</Button>
				<Button size="sm" variant="ghost" title="Next (→)" onclick={nextImage}>Next (→)</Button>
				<Button size="sm" variant="outline" title="Next unannotated (U)" onclick={nextUnannotated}>
					Next (U)
				</Button>
			</div>

			<div class="grid grid-cols-2 gap-2">
				<Button
					size="sm"
					variant="secondary"
					disabled={selected?.media_type !== 'video' || isLoadingVideo}
					onclick={loadVideo}
				>
					{isLoadingVideo ? 'Loading...' : 'Load Video'}
				</Button>

				<Button
					size="sm"
					variant={pendingPrompts.length > 0 || pendingDeletes.length > 0 ? 'default' : 'outline'}
					class={pendingPrompts.length > 0 || pendingDeletes.length > 0
						? 'animate-pulse bg-yellow-600 text-white'
						: ''}
					disabled={(pendingPrompts.length === 0 && pendingDeletes.length === 0) || isSubmitting}
					onclick={submitPrompts}
				>
					{isSubmitting
						? 'Submitting...'
						: `Submit (${pendingPrompts.length + pendingDeletes.length})`}
				</Button>
			</div>
		</div>

		<div class="mb-4">
			<span class="mb-1 block text-sm font-medium">Labels</span>
			<ScrollArea class="pr-1">
				<ul class="space-y-1">
					{#each labels as l, i}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<li
							class="hover:bg-muted/60 flex cursor-pointer items-center gap-2 rounded px-2 py-1"
							onclick={() => (selectedLabelId = l.id)}
							oncontextmenu={() => (selectedLabelId = l.id)}
						>
							<div class="h-4 w-4 rounded-full" style="background:{l.color}"></div>
							<span class={selectedLabelId === l.id ? 'font-semibold' : ''}>
								{i < 9 ? `(${i + 1}) ` : ''}{l.name}
							</span>
						</li>
					{/each}
				</ul>
			</ScrollArea>
		</div>

		<div>
			<span class="text-foreground mb-1 block text-sm font-medium">Model</span>

			<Select type="single" bind:value={selectedModelId}>
				<SelectTrigger class="w-full" placeholder="Select a model">
					{selectedModelId}
				</SelectTrigger>

				<SelectContent>
					{#each models as m}
						<SelectItem value={m}>{m}</SelectItem>
					{/each}
				</SelectContent>
			</Select>
		</div>

		<!-- prompt list + undo/redo -->
		<div class="flex min-h-0 flex-1 flex-col">
			<div class="mb-2 flex items-center justify-between">
				<h4 class="text-sm font-medium">Annotations ({prompts.length})</h4>
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
					{#each prompts as prompt}
						<li class="bg-muted/60 flex items-center justify-between rounded px-2 py-1">
							<div
								class="h-3 w-3 rounded-full"
								style="background:{labels.find((l) => l.id === prompt.label_id)?.color}"
							></div>
							<span class="truncate">
								{#if isImagePrompt(prompt)}
									{prompt.click_label === 1 ? '+' : '-'} • {prompt.x}, {prompt.y}
								{:else}
									{prompt.labels[0] === 1 ? '+' : '-'} • {prompt.points[0][0]}, {prompt
										.points[0][1]}
								{/if}
							</span>
							<Button
								variant="ghost"
								size="icon"
								class="text-muted-foreground hover:text-destructive ml-2"
								onclick={() => {
									if (isImagePrompt(prompt)) {
										deleteNearestPrompt(prompt.x, prompt.y);
									} else {
										deleteNearestPrompt(prompt.points[0][0], prompt.points[0][1]);
									}
								}}
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

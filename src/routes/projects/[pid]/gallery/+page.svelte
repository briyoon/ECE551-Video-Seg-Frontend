<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter
	} from '$lib/components/ui/dialog';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { PlusIcon, Trash2Icon, PlayIcon, XIcon } from '@lucide/svelte';

	import type { MediaRead, ProjectRead } from '$lib/api/openapi/types.gen';
	import {
		addMediaApiV1ProjectsPidMediaPost,
		deleteMediaApiV1ProjectsPidMediaMidDelete,
		getMediaApiV1ProjectsPidMediaMidGet
	} from '$lib/api/openapi/sdk.gen';
	import { client } from '$lib/api/client';
	import ProjectNav from '$lib/components/ProjectNav.svelte';
	import { PUBLIC_API_BASE } from '$env/static/public';
	import DialogClose from '$lib/components/ui/dialog/dialog-close.svelte';

	export let data: { media: MediaRead[] };
	const project = /** @type {ProjectRead} */ (/** @ts-ignore */ getContext<ProjectRead>('project'));

	/* ------------------------------ state ------------------------------ */
	let media: MediaRead[] = data.media;

	// progressive rendering
	let visible = 32;
	const increment = 32;
	let sentinel: HTMLDivElement;

	/* ------------------------- add‑media dialog ------------------------ */
	let addOpen = false;
	let fileInput: HTMLInputElement;

	// helper to validate extension based on project type
	function isValidFile(f: File) {
		if (project.media_type === 'image') return ['image/png', 'image/jpeg'].includes(f.type);
		return f.type === 'video/mp4';
	}

	async function handleFiles(files: FileList | File[]) {
		for (const f of files) {
			if (!isValidFile(f)) {
				toast.error(`Unsupported file type: ${f.name}`);
				continue;
			}
			const { data: created, response } = await addMediaApiV1ProjectsPidMediaPost({
				client,
				path: { pid: project.id },
				body: { file: f }
			});
			if (response.ok && created) {
				media = [created, ...media];
				toast.success(`Added ${f.name}`);
			} else toast.error(`Failed to add ${f.name}`);
		}
		addOpen = false;
		fileInput.value = '';
	}

	/* ----------------------- detail / delete modal --------------------- */
	let detail: MediaRead | null = null;
	async function del(item: MediaRead) {
		if (!confirm(`Delete “${item.path}”?`)) return;
		const res = await deleteMediaApiV1ProjectsPidMediaMidDelete({
			client,
			path: { pid: project.id, mid: item.id }
		});
		if (res.response.ok) {
			media = media.filter((m) => m.id !== item.id);
			toast.success('Deleted');
			detail = null;
		} else toast.error('Failed to delete');
	}

	onMount(() => {
		const io = new IntersectionObserver((entries) => {
			entries.forEach((e) => {
				if (e.isIntersecting) visible += increment;
			});
		});
		io.observe(sentinel);
		return () => io.disconnect();
	});
</script>

<div class="mb-6">
	<ProjectNav
		content={[
			{ name: 'Projects', href: '/' },
			{ name: project.name, href: `/projects/${project.id}` },
			[
				{ name: 'Gallery', href: `/projects/${project.id}/gallery`, active: true },
				{ name: 'Studio', href: `/projects/${project.id}/studio` },
				{ name: 'Models', href: `/projects/${project.id}/models` },
				{ name: 'Export', href: `/projects/${project.id}/export` }
			]
		]}
	/>
</div>

<div>
	<Button onclick={() => (addOpen = true)} class="mb-4 gap-2">
		<PlusIcon class="h-4 w-4" /> Add media
	</Button>
	Media Count: {media.length}
</div>

{#if media.length === 0}
	<p class="text-muted-foreground">No media yet - click “Add media” to upload.</p>
{:else}
	<div class="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
		{#each media.slice(0, visible) as m (m.id)}
			<Card
				class="group relative  h-64 w-64 cursor-pointer overflow-hidden rounded-2xl p-0"
				onclick={() => (detail = m)}
			>
				<CardContent class="relative h-full p-0">
					{#if m.media_type === 'image'}
						<img
							src={`${PUBLIC_API_BASE}/api/v1/projects/${project.id}/media/${m.id}`}
							alt={m.path}
							loading="lazy"
							class="aspect-square h-full w-full object-cover transition-transform group-hover:scale-105"
						/>
					{:else}
						<!-- Video thumbnail: show first frame by using the <video> element -->
						<video
							src={`${PUBLIC_API_BASE}/api/v1/projects/${project.id}/media/${m.id}`}
							muted
							playsinline
							preload="metadata"
							class="pointer-events-none h-full w-full object-cover"
							onloadedmetadata={(e) => {
								// ensure first frame is rendered
								const v = e.currentTarget as HTMLVideoElement;
								v.currentTime = 0;
							}}
						></video>
						<!-- Play icon overlay -->
						<div
							class="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100"
						>
							<PlayIcon class="h-10 w-10 text-white" />
						</div>
					{/if}
				</CardContent>
			</Card>
		{/each}
	</div>
	<!-- sentinel for infinite scroll -->
	<div bind:this={sentinel}></div>
{/if}

<Dialog open={addOpen} onOpenChange={(e) => (addOpen = e)}>
	<DialogContent class="max-w-lg">
		<DialogHeader>
			<DialogTitle>Add media</DialogTitle>
		</DialogHeader>

		<div
			role="region"
			aria-label="File drop area"
			class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-sm text-muted-foreground/70 transition-colors hover:border-primary hover:text-primary"
			ondrop={(e) => {
				if (e.dataTransfer) handleFiles(e.dataTransfer.files);
			}}
		>
			<p>Drag & drop files here</p>
			<p class="text-xs">Accepted: {project.media_type === 'image' ? 'PNG, JPEG' : 'MP4'}</p>
		</div>

		<div class="mt-4 flex items-center justify-end gap-2">
			<Button variant="secondary" onclick={() => (addOpen = false)}>Cancel</Button>
			<Button>
				<input
					class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
					bind:this={fileInput}
					type="file"
					accept={project.media_type === 'image' ? 'image/png, image/jpeg' : 'video/mp4'}
					multiple
					onchange={(e) => handleFiles((e.target as HTMLInputElement).files!)}
				/>
				Browse…
			</Button>
		</div>
	</DialogContent>
</Dialog>

{#if detail}
	<Dialog open onOpenChange={() => (detail = null)}>
		<DialogContent class="max-w-4xl">
			<DialogHeader class="flex flex-row items-start justify-between">
				<DialogTitle>{detail.path.split('/').splice(-1)}</DialogTitle>
			</DialogHeader>

			{#if detail.media_type === 'image'}
				<img
					src={`${PUBLIC_API_BASE}/api/v1/projects/${project.id}/media/${detail.id}`}
					alt={detail.path}
					class="w-full rounded-lg"
				/>
			{:else}
				<video
					src={`${PUBLIC_API_BASE}/api/v1/projects/${project.id}/media/${detail.id}`}
					controls
					autoplay
					class="w-full rounded-lg"
				>
					<track kind="captions" label="No captions" />
				</video>
			{/if}

			<DialogFooter class="mt-4 gap-2">
				<Button variant="destructive" onclick={() => del(detail as MediaRead)} class="gap-2">
					<Trash2Icon class="h-4 w-4" /> Delete
				</Button>
			</DialogFooter>
		</DialogContent>
		<DialogClose class="absolute top-2 right-2">
			<XIcon class="h-6 w-6 text-muted-foreground hover:cursor-pointer hover:text-primary" />
		</DialogClose>
	</Dialog>
{/if}

<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import ProjectNav from '$lib/components/ProjectNav.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter
	} from '$lib/components/ui/dialog';
	import DialogClose from '$lib/components/ui/dialog/dialog-close.svelte';
	import { Input } from '$lib/components/ui/input';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { PlusIcon, PencilIcon, Trash2Icon, XIcon, RefreshCwIcon, SaveIcon } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	import type { ProjectRead, LabelRead, LabelCreate } from '$lib/api/openapi/types.gen';
	import {
		listLabelsApiV1ProjectsPidLabelsGet as listLabels,
		createLabelApiV1ProjectsPidLabelsPost as addLabel,
		deleteLabelApiV1ProjectsPidLabelsLidDelete as deleteLabel,
		updateLabelApiV1ProjectsPidLabelsLidPatch as updateLabel
	} from '$lib/api/openapi/sdk.gen';
	import { client } from '$lib/api/client';

	const project = /** @type {ProjectRead} */ (/** @ts-ignore */ getContext<ProjectRead>('project'));

	let labels: LabelRead[] = [];

	let addOpen = false;
	let newName = '';

	let editingId: number | null = null;
	let renameValue = '';
	let renameColor = '';

	function randHex() {
		return (
			'#' +
			Math.floor(Math.random() * 0xffffff)
				.toString(16)
				.padStart(6, '0')
				.toUpperCase()
		);
	}

	async function refreshLabels() {
		const { data } = await listLabels({ client, path: { pid: project.id } });
		labels = data ?? [];
	}

	async function createLabel() {
		if (!newName.trim()) {
			toast.error('Name required');
			return;
		}
		const body: LabelCreate = { name: newName };
		const { response, data } = await addLabel({ client, path: { pid: project.id }, body });
		if (response.ok && data) {
			toast.success('Label created');
			refreshLabels();
			addOpen = false;
			newName = '';
		} else toast.error('Failed');
	}

	async function remove(l: LabelRead) {
		if (!confirm(`Delete label “${l.name}”?`)) return;
		const res = await deleteLabel({ client, path: { pid: project.id, lid: l.id } });
		if (res.response.ok) {
			labels = labels.filter((x) => x.id !== l.id);
			toast.success('Deleted');
		} else toast.error('Failed to delete');
	}

	async function saveRename(l: LabelRead) {
		const body: Record<string, unknown> = {};
		if (renameValue.trim() && renameValue !== l.name) body.name = renameValue;
		if (renameColor !== l.color) body.color = renameColor;

		if (Object.keys(body).length === 0) {
			editingId = null;
			return;
		}

		const { response, data } = await updateLabel({
			client,
			path: { pid: project.id, lid: l.id },
			body
		});

		if (response.ok && data) {
			labels = labels.map((x) => (x.id === l.id ? data : x));
			toast.success('Label updated');
		} else toast.error('Failed to update');

		editingId = null;
	}

	onMount(() => {
		refreshLabels();
	});
</script>

<div class="mb-6">
	<ProjectNav
		content={[
			{ name: 'Projects', href: '/' },
			{ name: project.name, href: `/projects/${project.id}` },
			[
				{ name: 'Gallery', href: `/projects/${project.id}/gallery` },
				{ name: 'Studio', href: `/projects/${project.id}/studio` },
				{ name: 'Labels', href: `/projects/${project.id}/labels`, active: true }
			]
		]}
	/>
</div>

<div class="mb-4 flex items-center gap-3">
	<Button class="gap-2" onclick={() => (addOpen = true)}>
		<PlusIcon class="h-4 w-4" /> Add label
	</Button>
	<span class="text-sm text-muted-foreground">Total: {labels.length}</span>
</div>

{#if labels.length === 0}
	<p class="text-muted-foreground">No labels yet.</p>
{:else}
	<ScrollArea class="h-[70vh] pr-1">
		<ul class="space-y-2">
			{#each labels as l (l.id)}
				<li class="flex items-center justify-between rounded-lg border px-3 py-2">
					{#if editingId === l.id}
						<span
							class="mr-2 h-4 w-4 shrink-0 rounded-full border"
							style={`background:${renameColor}`}
						></span>

						<Button
							size="icon"
							variant="ghost"
							class="mr-2"
							onclick={() => (renameColor = randHex())}
						>
							<RefreshCwIcon class="h-4 w-4" />
						</Button>

						<input
							bind:value={renameValue}
							class="mr-2 flex-1 rounded-md border px-2 py-1 text-sm"
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									saveRename(l);
								}
								if (e.key === 'Escape') {
									editingId = null;
								}
							}}
						/>
					{:else}
						<span class="mr-2 h-3 w-3 shrink-0 rounded-full" style={`background:${l.color}`}></span>
						<span class="mr-2">Id: {l.id} - </span>
						<span class="flex-1 truncate">{l.name}</span>
					{/if}

					<div class="ml-3 flex gap-1">
						{#if editingId === l.id}
							<Button size="icon" variant="ghost" onclick={() => saveRename(l)}>
								<SaveIcon class="h-4 w-4" />
							</Button>
							<Button size="icon" variant="ghost" onclick={() => (editingId = null)}>
								<XIcon class="h-4 w-4" />
							</Button>
						{:else}
							<Button
								size="icon"
								variant="ghost"
								onclick={() => {
									editingId = l.id;
									renameValue = l.name;
									renameColor = l.color;
								}}
							>
								<PencilIcon class="h-4 w-4" />
							</Button>
							<Button size="icon" variant="destructive" onclick={() => remove(l)}>
								<Trash2Icon class="h-4 w-4" />
							</Button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</ScrollArea>
{/if}

<Dialog open={addOpen} onOpenChange={(e) => (addOpen = e)}>
	<DialogContent class="max-w-md">
		<DialogHeader><DialogTitle>New label</DialogTitle></DialogHeader>

		<Input
			placeholder="Label name"
			bind:value={newName}
			onkeydown={(e) => {
				if (e.key === 'Enter') createLabel();
			}}
		/>

		<DialogFooter class="mt-4 gap-2">
			<Button variant="secondary" onclick={() => (addOpen = false)}>Cancel</Button>
			<Button onclick={createLabel}>Create</Button>
		</DialogFooter>
		<DialogClose class="absolute top-2 right-2">
			<XIcon class="h-5 w-5 cursor-pointer text-muted-foreground hover:text-primary" />
		</DialogClose>
	</DialogContent>
</Dialog>

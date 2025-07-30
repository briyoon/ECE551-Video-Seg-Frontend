<script lang="ts">
	import { goto } from '$app/navigation';

	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/ui/select';
	import { createProjectApiV1ProjectsPost } from '$lib/api/openapi/sdk.gen';
	import { client } from '$lib/api/client';

	import { toast } from 'svelte-sonner';
	import ProjectNav from '$lib/components/ProjectNav.svelte';

	let name = $state('');
	let media_type: 'image' | 'video' | undefined = $state();
	let submitting = $state(false);

	const labels = { image: 'Image', video: 'Video' };
	let mediaDisplay = $derived(media_type ? labels[media_type] : 'Select media type');

	async function createProject(e: { preventDefault: () => void }) {
		e.preventDefault();

		if (!name || !media_type) {
			toast.error('Please fill in all fields');
			return;
		}

		submitting = true;
		const res = await createProjectApiV1ProjectsPost({
			client: client,
			body: { name, media_type }
		});
		if (res.response.ok) {
			toast.success('Project created');
			goto(`/projects/${res.data?.id}`);
		} else {
			toast.error('Failed to create project');
		}
		submitting = false;
	}
</script>

<div class="mb-6">
	<ProjectNav
		content={[
			{ name: 'Projects', href: '/' },
			{ name: 'New', href: `/new` }
		]}
	/>
</div>

<div class="flex h-full w-full items-center justify-center">
	<div class="w-1/5 flex-col rounded-2xl border-1 p-6 shadow-sm hover:shadow-md">
		<h1 class="mb-6 text-3xl font-bold">New Project</h1>

		<form class="space-y-6" onsubmit={createProject}>
			<div class="space-y-2">
				<Label for="name">Project Name</Label>
				<Input id="name" bind:value={name} placeholder="e.g. Cat Segmentation" required />
			</div>

			<div class="space-y-2">
				<Label>Media Type</Label>
				<Select type="single" name="media_type" bind:value={media_type} required>
					<SelectTrigger id="media_type" class="w-full">
						{mediaDisplay || 'Select media type'}
					</SelectTrigger>

					<SelectContent>
						<SelectItem value="image">Image</SelectItem>
						<SelectItem value="video">Video</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<Button type="submit" disabled={submitting} class="w-full">
				{submitting ? 'Creating…' : 'Create Project'}
			</Button>
		</form>
	</div>
</div>

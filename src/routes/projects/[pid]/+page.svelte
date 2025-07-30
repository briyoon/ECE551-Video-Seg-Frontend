<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getContext } from 'svelte';
	import type { ProjectRead } from '$lib/api/openapi/types.gen';
	import { deleteProjectApiV1ProjectsPidDelete } from '$lib/api/openapi/sdk.gen';
	import { client } from '$lib/api/client';
	import { goto, invalidate } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import ProjectNav from '$lib/components/ProjectNav.svelte';

	const project = getContext<ProjectRead>('project');

	const deleteProject = async () => {
		if (
			confirm(
				`Are you sure you want to delete the project "${project.name}"? This action cannot be undone.`
			)
		) {
			const res = await deleteProjectApiV1ProjectsPidDelete({
				client,
				path: { pid: project.id }
			});
			if (res.response.ok) {
				toast.success('Project deleted successfully');
				goto('/');
			} else {
				toast.error('Failed to delete project. Please try again later.');
			}
		}
	};
</script>

<div class="mb-6">
	<ProjectNav
		content={[
			{ name: 'Projects', href: '/' },
			{ name: project.name, href: `/projects/${project.id}` }
		]}
	/>
</div>

<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
	<Card>
		<CardHeader><CardTitle>Gallery</CardTitle></CardHeader>
		<CardContent>
			<Button href={`${page.params.pid}/gallery`}>Open Gallery</Button>
		</CardContent>
	</Card>

	<Card>
		<CardHeader><CardTitle>Studio</CardTitle></CardHeader>
		<CardContent>
			<Button href={`${page.params.pid}/studio`}>Open Studio</Button>
		</CardContent>
	</Card>

	<Card>
		<CardHeader><CardTitle>Models</CardTitle></CardHeader>
		<CardContent>
			<Button href={`${page.params.pid}/models`}>Manage Models</Button>
		</CardContent>
	</Card>

	<Card>
		<CardHeader><CardTitle>Export Annotations</CardTitle></CardHeader>
		<CardContent>
			<Button href={`${page.params.pid}/export`} variant="secondary">Download JSON</Button>
		</CardContent>
	</Card>

	<Card>
		<CardHeader><CardTitle class="text-red-600">Delete Project</CardTitle></CardHeader>
		<CardContent>
			<Button variant="destructive" onclick={deleteProject}>Delete</Button>
		</CardContent>
	</Card>
</div>

<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getContext } from 'svelte';
	import type { ProjectRead } from '$lib/api/openapi/types.gen';
	import {
		deleteProjectApiV1ProjectsPidDelete as apiDeleteProject,
		exportProjectApiV1ProjectsPidExportGet as apiExportProject
	} from '$lib/api/openapi/sdk.gen';
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
			const res = await apiDeleteProject({
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

	const exportProject = async () => {
		try {
			const { data, response } = await apiExportProject({
				client,
				path: { pid: project.id }
			});

			if (!response.ok) throw new Error(`HTTP ${response.status}`);

			const blob: Blob = data as Blob;

			const filename =
				response.headers.get('content-disposition')?.match(/filename=\"?([^\";]+)/)?.[1] ??
				`project_${project.id}.zip`;

			const url = URL.createObjectURL(blob);
			const a = Object.assign(document.createElement('a'), {
				href: url,
				download: filename
			});
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error(err);
			toast.error('Failed to export annotations. Please try again later.');
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
		<CardHeader><CardTitle>Labels</CardTitle></CardHeader>
		<CardContent>
			<Button href={`${page.params.pid}/labels`}>Manage Labels</Button>
		</CardContent>
	</Card>

	<Card>
		<CardHeader><CardTitle>Studio</CardTitle></CardHeader>
		<CardContent>
			<Button href={`${page.params.pid}/studio`}>Open Studio</Button>
		</CardContent>
	</Card>

	<Card>
		<CardHeader><CardTitle>Export Annotations</CardTitle></CardHeader>
		<CardContent>
			<Button variant="secondary" onclick={exportProject}>Download JSON</Button>
		</CardContent>
	</Card>

	<Card>
		<CardHeader><CardTitle class="text-red-600">Delete Project</CardTitle></CardHeader>
		<CardContent>
			<Button variant="destructive" onclick={deleteProject}>Delete</Button>
		</CardContent>
	</Card>
</div>

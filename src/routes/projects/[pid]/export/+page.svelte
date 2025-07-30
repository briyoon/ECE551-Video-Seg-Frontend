<script lang="ts">
	import ProjectNav from '$lib/components/ProjectNav.svelte';
	import { getContext } from 'svelte';
	import type { ProjectRead } from '$lib/api/openapi/types.gen';

	const project = /** @type {ProjectRead} */ (/** @ts-ignore */ getContext<ProjectRead>('project'));
</script>

<div class="mb-6">
	<ProjectNav
		content={[
			{ name: 'Projects', href: '/' },
			{ name: project.name, href: `/projects/${project.id}` },
			[
				{ name: 'Gallery', href: `/projects/${project.id}/gallery` },
				{ name: 'Studio', href: `/projects/${project.id}/studio` },
				{ name: 'Models', href: `/projects/${project.id}/models` },
				{ name: 'Export', href: `/projects/${project.id}/export`, active: true }
			]
		]}
	/>
</div>

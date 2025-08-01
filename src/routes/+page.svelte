<script lang="ts">
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getContext } from 'svelte';
	import type { ProjectRead } from '$lib/api/openapi/types.gen';
	import ProjectNav from '$lib/components/ProjectNav.svelte';

	const projects = getContext<ProjectRead[]>('projectlist');
</script>

<div class="mb-6">
	<ProjectNav content={[{ name: 'Projects', href: '/' }]} />
</div>

<div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
	{#each projects as p}
		<a
			href={`/projects/${p.id}`}
			class="block h-full transition-transform duration-200 hover:scale-[1.02]"
		>
			<Card class="h-full rounded-2xl border border-gray-200 shadow-sm hover:shadow-md">
				<CardHeader>
					<CardTitle class="text-lg font-semibold text-gray-900 hover:underline">{p.name}</CardTitle
					>
					<CardDescription class="text-muted-foreground text-sm capitalize"
						>{p.media_type}</CardDescription
					>
				</CardHeader>
			</Card>
		</a>
	{/each}

	<Card
		class="flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 transition hover:border-gray-400 hover:bg-gray-50 hover:shadow-md"
	>
		<CardContent class="text-center">
			<a href="/projects/new">
				<Button size="lg" variant="secondary" class="text-base font-medium">+ New Project</Button>
			</a>
		</CardContent>
	</Card>
</div>

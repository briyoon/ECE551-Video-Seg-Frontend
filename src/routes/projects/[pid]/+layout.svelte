<script lang="ts">
	import ProjectNav from '$lib/components/ProjectNav.svelte';
	import { setContext } from 'svelte';

	let { data, children } = $props();
	setContext('project', data.project);
</script>

{@render children()}

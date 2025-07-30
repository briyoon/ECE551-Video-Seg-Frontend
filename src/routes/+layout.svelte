<script lang="ts">
	import '../app.css';
	import { Toaster } from 'svelte-sonner';
	import { setContext } from 'svelte';

	let { data, children } = $props();
	setContext('projectlist', data.projects);
</script>

<div class="h-screen w-screen p-6">
	{@render children()}

	<Toaster richColors />
</div>

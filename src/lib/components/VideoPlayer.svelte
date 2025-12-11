<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';

	const dispatch = createEventDispatcher();

	export let src: string; // Base URL to fetch frames
	export let totalFrames: number; // For scrubber range
	export let fps: number = 24;
	export let currentFrameIdx: number = 0;
	export let imgElement: HTMLImageElement | undefined = undefined; // Export for parent access

	let isPlaying = false;
	let intervalId: any;
	let hoverIdx = -1;

	$: dispatch('change', currentFrameIdx);

	function nextFrame() {
		if (currentFrameIdx < totalFrames - 1) {
			currentFrameIdx++;
		} else {
			pause(); // Stop at end
		}
	}

	function prevFrame() {
		if (currentFrameIdx > 0) {
			currentFrameIdx--;
		}
	}

	function togglePlay() {
		if (isPlaying) {
			pause();
		} else {
			play();
		}
	}

	function play() {
		isPlaying = true;
		intervalId = setInterval(nextFrame, 1000 / fps);
	}

	function pause() {
		isPlaying = false;
		if (intervalId) clearInterval(intervalId);
	}

	function handleKeydown(e: KeyboardEvent) {
		// if (e.repeat) return; // Allow repeat for rapid navigation
		if (e.code === 'Space') {
			e.preventDefault();
			togglePlay();
			togglePlay();
		} else if (e.code === 'ArrowDown') {
			e.preventDefault();
			pause();
			prevFrame();
		} else if (e.code === 'ArrowUp') {
			e.preventDefault();
			pause();
			nextFrame();
		}
	}

	onDestroy(() => {
		if (intervalId) clearInterval(intervalId);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative flex h-full w-full flex-col">
	<!-- Display Area -->
	<div class="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
		{#if src}
			<!-- svelte-ignore a11y-missing-attribute -->
			<img
				bind:this={imgElement}
				src={`${src}/${currentFrameIdx}`}
				class="pointer-events-none max-h-full max-w-full select-none object-contain"
				draggable="false"
				onload={() => dispatch('imgload')}
			/>
		{/if}
		<slot />
		<!-- For overlay canvas -->
	</div>

	<!-- Controls -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="bg-background flex h-12 shrink-0 items-center gap-2 border-t px-2"
		onmousedown={(e) => e.stopPropagation()}
		onclick={(e) => e.stopPropagation()}
		role="toolbar"
		tabindex="-1"
	>
		<Button variant="ghost" size="icon" onclick={togglePlay}>
			{#if isPlaying}
				<Pause class="h-4 w-4" />
			{:else}
				<Play class="h-4 w-4" />
			{/if}
		</Button>

		<div
			class="relative mx-2 flex-1"
			onpointerdown={(e) => e.stopPropagation()}
			onmousedown={(e) => e.stopPropagation()}
			onclick={(e) => e.stopPropagation()}
			role="button"
			tabindex="0"
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
			}}
		>
			<!-- Hover Preview -->
			{#if hoverIdx !== -1}
				<div
					class="pointer-events-none absolute bottom-full z-50 mb-4 -translate-x-1/2 rounded-lg border bg-black/90 p-1.5 shadow-xl"
					style="left: {(hoverIdx / (totalFrames - 1)) * 100}%"
				>
					<img
						src={`${src}/${hoverIdx}`}
						alt="Frame {hoverIdx}"
						class="h-80 w-auto max-w-[480px] rounded object-cover"
					/>
					<div class="mt-1 text-center font-mono text-base text-white">frame {hoverIdx}</div>
				</div>
			{/if}

			<input
				type="range"
				class="accent-primary w-full cursor-pointer"
				bind:value={currentFrameIdx}
				min={0}
				max={totalFrames - 1}
				step={1}
				oninput={() => pause()}
				onmousemove={(e) => {
					const rect = e.currentTarget.getBoundingClientRect();
					const percent = (e.clientX - rect.left) / rect.width;
					hoverIdx = Math.max(0, Math.min(totalFrames - 1, Math.floor(percent * totalFrames)));
				}}
				onmouseleave={() => (hoverIdx = -1)}
			/>
		</div>

		<span class="w-16 text-right font-mono text-xs">
			{currentFrameIdx} / {totalFrames - 1}
		</span>

		<Button
			variant="ghost"
			size="icon"
			onclick={() => {
				pause();
				prevFrame();
			}}
		>
			<ChevronLeft class="h-4 w-4" />
		</Button>
		<Button
			variant="ghost"
			size="icon"
			onclick={() => {
				pause();
				nextFrame();
			}}
		>
			<ChevronRight class="h-4 w-4" />
		</Button>
	</div>
</div>

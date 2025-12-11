<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';

	const dispatch = createEventDispatcher();

	export let src: string; // Base URL to fetch frames
	export let urlSuffix: string = ''; // e.g. "/annotated" or query params
	export let totalFrames: number; // For scrubber range
	export let fps: number = 24;
	export let currentFrameIdx: number = 0;
	export let imgElement: HTMLImageElement | undefined = undefined; // Export for parent access

	export let isPlaying = false;
	let intervalId: number | undefined; // Removed, using RAF
	let rafId: number | undefined;
	let lastTime = 0;
	let accumulator = 0;
	let hoverIdx = -1;

	// Keep references to prevent GC
	const preloadCache = new Map<number, HTMLImageElement>();

	$: dispatch('change', currentFrameIdx);
	$: if (src) preloadFrames(currentFrameIdx);
	$: if (urlSuffix) {
		// Invalidate cache when annotations update
		preloadCache.clear();
		preloadFrames(currentFrameIdx);
	}

	function preloadFrames(centerIdx: number) {
		const CACHE_ALL_THRESHOLD = 3000; // ~2 min at 24fps
		const BUFFER_AHEAD = 240; // 10 seconds
		const BUFFER_BEHIND = 24;

		// Strategy: Cache EVERYTHING if video is short enough
		if (totalFrames < CACHE_ALL_THRESHOLD) {
			// Simple loop to cache all
			// We can stagger this slightly or just rely on browser queue
			for (let i = 0; i < totalFrames; i++) {
				if (!preloadCache.has(i)) {
					const img = new Image();
					img.src = `${src}/${i}${urlSuffix}`;
					preloadCache.set(i, img);
				}
			}
			return;
		}

		// Sliding Window for long videos
		// Clean old cache if outside window (plus some margin)
		for (const [key] of preloadCache) {
			if (key < centerIdx - BUFFER_BEHIND - 100 || key > centerIdx + BUFFER_AHEAD + 100) {
				preloadCache.delete(key);
			}
		}

		for (let i = 1; i <= BUFFER_AHEAD; i++) {
			const idx = centerIdx + i;
			if (idx < totalFrames && !preloadCache.has(idx)) {
				const img = new Image();
				img.src = `${src}/${idx}${urlSuffix}`;
				preloadCache.set(idx, img);
			}
		}
		for (let i = 1; i <= BUFFER_BEHIND; i++) {
			const idx = centerIdx - i;
			if (idx >= 0 && !preloadCache.has(idx)) {
				const img = new Image();
				img.src = `${src}/${idx}${urlSuffix}`;
				preloadCache.set(idx, img);
			}
		}
	}

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

	function loop(timestamp: number) {
		if (!isPlaying) return;
		if (!lastTime) lastTime = timestamp;

		const deltaTime = timestamp - lastTime;
		lastTime = timestamp;

		accumulator += deltaTime;
		const frameDuration = 1000 / fps;

		if (accumulator >= frameDuration) {
			nextFrame();
			accumulator -= frameDuration;
			// Prevent spiral if tab was backgrounded
			if (accumulator > 1000) accumulator = 0;
		}

		rafId = requestAnimationFrame(loop);
	}

	function play() {
		if (isPlaying) return;
		isPlaying = true;
		lastTime = 0;
		accumulator = 0;
		rafId = requestAnimationFrame(loop);
	}

	function pause() {
		isPlaying = false;
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = undefined;
		}
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

	let hoverRafId: number | undefined;
	function handleTimelineHover(e: MouseEvent & { currentTarget: EventTarget & HTMLInputElement }) {
		if (hoverRafId) return;

		const rect = e.currentTarget.getBoundingClientRect();
		const clientX = e.clientX;

		hoverRafId = requestAnimationFrame(() => {
			const percent = (clientX - rect.left) / rect.width;
			const newHoverIdx = Math.max(0, Math.min(totalFrames - 1, Math.floor(percent * totalFrames)));

			// Only update if changed (avoids unnecessary re-renders)
			if (newHoverIdx !== hoverIdx) {
				hoverIdx = newHoverIdx;
				// Optional: aggressive preload of hover frame?
				// const img = new Image();
				// img.src = `${src}/${hoverIdx}${urlSuffix}`;
			}
			hoverRafId = undefined;
		});
	}

	onDestroy(() => {
		pause();
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
				src={`${src}/${currentFrameIdx}${urlSuffix}`}
				class="pointer-events-none h-full w-full select-none object-contain"
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
						src={`${src}/${hoverIdx}${urlSuffix}`}
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
				onmousemove={handleTimelineHover}
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

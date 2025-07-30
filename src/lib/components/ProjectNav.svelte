<script lang="ts">
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import SlashIcon from '@lucide/svelte/icons/slash';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { goto } from '$app/navigation';

	/**
	 * A single breadcrumb entry.
	 */
	interface NavItem {
		/** Visible label. */
		name: string;
		/** Target route. */
		href: string;
		active?: boolean; // Optional, used to indicate if this is the current page
	}

	/**
	 * A breadcrumb element can be either a single NavItem or a dropdown,
	 * represented by an array of NavItems. If it is the last element in
	 * the `content` array it is treated as the current page.
	 */
	type NavElement = NavItem | NavItem[];

	/**
	 * Ordered list of breadcrumb elements.
	 *   - The last element represents the current page.
	 *   - Any element that is an array will be rendered as a dropdown.
	 */
	let { content }: { content: NavElement[] } = $props();

	function getActive(items: NavItem[]): NavItem {
		return items.find((it) => it.active) ?? items[0];
	}
</script>

<Breadcrumb.Root>
	<Breadcrumb.List class="flex items-center gap-1 text-sm font-medium">
		{#each content as element, i}
			{#if i > 0}
				<Breadcrumb.Separator><SlashIcon class="h-7 w-7" /></Breadcrumb.Separator>
			{/if}

			{#if Array.isArray(element)}
				<!-- DROPDOWN -->
				{#key element}
					<DropdownMenu.Root>
						<!-- Active item within dropdown -->
						{@const activeItem = getActive(element as NavItem[])}

						<DropdownMenu.Trigger>
							{#if i === content.length - 1}
								<!-- Current page dropdown trigger -->
								<Breadcrumb.Page
									class="inline-flex items-center gap-1 text-3xl font-bold underline"
								>
									{activeItem.name}
									<ChevronDown class="h-7 w-7" />
								</Breadcrumb.Page>
							{:else}
								<!-- Navigable dropdown trigger -->
								<Breadcrumb.Link
									href={activeItem.href}
									class="inline-flex items-center gap-1 text-3xl hover:underline"
								>
									{activeItem.name}
									<ChevronDown class="h-7 w-7" />
								</Breadcrumb.Link>
							{/if}
						</DropdownMenu.Trigger>

						<DropdownMenu.Content align="start" class="w-48">
							{#each element as item}
								<DropdownMenu.Item class="cursor-pointer" onclick={() => goto(item.href)}>
									{item.name}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/key}
			{:else}
				<!-- SINGLE NAV ITEM -->
				{#if i === content.length - 1}
					<Breadcrumb.Page class="text-3xl font-bold">{element.name}</Breadcrumb.Page>
				{:else}
					<Breadcrumb.Link href={element.href} class="text-3xl hover:underline">
						{element.name}
					</Breadcrumb.Link>
				{/if}
			{/if}
		{/each}
	</Breadcrumb.List>
</Breadcrumb.Root>

<script>
  import { scale } from "svelte/transition";
  export let navItems = [];
  export let activeNav = 0;
  export let navEventHandler;
</script>
<nav>
  <ul>
    {#each navItems as item, ind}
      <li class={activeNav === ind ? 'active-item': ""} on:click={() => navEventHandler(ind)} transition:scale>
        <svelte:component this={item.icon} size="1.5x" strokeWidth={activeNav === ind ? "2px" : "1.3px"}></svelte:component>
      </li>
    {/each}
  </ul>
</nav>

<style>
  ul {
    padding: 0;
    display: grid;
    grid-auto-columns: 1fr;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 0px 0px;
    list-style: none;
    margin: 0;
    height: 3em;
    padding-bottom: 0.3em;
  }
  li {
    max-height: 3em;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    padding: 0.3em 0;
    transition: max-height 200ms;
    color: var(--text-color-light);
  }
  li.active-item {
    color: var(--text-color);
  }
  @keyframes scale-up {
    from {
      max-height: 0;
    }
    to {
      max-height: inherit;
    }
  }
</style>
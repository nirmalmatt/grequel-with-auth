<script>
  import { PlusCircleIcon } from "svelte-feather-icons";
  export let switches;
  export let clickHandler;

  function toggleHandler(ind) {
    clickHandler(ind);
  }
</script>
<ul class="board">
	{#each switches as swh, ind}
    <li class={swh.state ? "item is-active" : "item"} on:click={() => toggleHandler(ind)}>
      <p>{swh.label}</p>
    </li>
  {/each}
  <li class="item">
    <PlusCircleIcon size="1.5x"/>
  </li>
</ul>

<style>
  .board {
    background-color: var(--slight-off);
    padding: 0.3em;
    margin: 1em;
    border-radius: 0.3em;
    color: var(--text-color);
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    align-content: stretch;
    flex-wrap: wrap;
    box-shadow: 0 0 3px 3px rgba(0, 0, 0, 0.1);
    max-width: 800px;
  }
  .item {
    max-width: -webkit-fill-available;
    min-width: max-content;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-color);
    transition: background-color 200ms;
    padding: 0.75em;
    border-radius: 0.4em;
    cursor: pointer;
    margin: auto;
    margin: 0.3em;
  }
  .item:hover {
    color: var(--darkest);
    background-color: var(--plain-color);
  }
  .item.is-active {
    background-color: var(--active-color);
    color: #efefef;
  }
</style>

<script>
  import { CloudLightningIcon, CloudOffIcon } from "svelte-feather-icons";
  export let homeServerStatus = false;
  export let appName = "App";
</script>
<header>
	<figure>{appName}</figure>
	<div>
    <ul>
      <li class="nav-icon">
      {#if homeServerStatus}
        <CloudLightningIcon size="1.3x"></CloudLightningIcon>
        {:else}
        <CloudOffIcon size='1.3x'></CloudOffIcon>
      {/if}
    </li>
    </ul>
  </div>
</header>
<style>
  header {
    position: sticky;
    top: 0;
    left: 0;
    padding: 1em;
    right: 0;
    background-color: var(--slight-off);
    color: var(--text-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 2.8px 2.2px rgb(0 0 0 / 3%), 0 6.7px 5.3px rgb(0 0 0 / 5%),
      0 12.5px 10px rgb(0 0 0 / 6%), 0px 4px 17.9px rgb(0 0 0 / 7%),
      1px 6px 33.4px rgb(0 0 0 / 9%), 0 100px 80px rgb(0 0 0 / 12%);
  }
  li {
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
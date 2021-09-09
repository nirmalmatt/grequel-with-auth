<script>
  import { theme } from "../utils/store.js";
  function toggleTheme() {
    if ($theme === "light") {
      theme.update(them => "dark");
    } else {
      theme.update(them => "light");
    }
  }
</script>
<ul>
  <li>
    <button on:click={() => toggleTheme()} class="button">Toggle Theme: {$theme}</button>
  </li>
</ul>

<style>
  button {
    margin: 1em;
  }
</style>
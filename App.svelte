<script>
  import routes from "./utils/router.js";
  import Nav from "./components/Nav.svelte";
  import Router from "svelte-spa-router";
  import { push, location } from "svelte-spa-router";
  import { theme } from "./utils/store.js";
  import { onMount } from "svelte";
  import {
    HomeIcon,
    ActivityIcon,
    SettingsIcon,
    VideoIcon,
    GridIcon
  } from "svelte-feather-icons";
  const navItems = [
    {
      label: "Home",
      icon: HomeIcon,
      path: "/"
    },
    {
      label: "Activity",
      icon: GridIcon,
      path: "/activity"
    },
    {
      label: "Monitor",
      icon: VideoIcon,
      path: "/monitor"
    },
    {
      label: "Control",
      icon: SettingsIcon,
      path: "/controls"
    }
  ];
  let activeNav = 0;
  $: {
    for (let nav in navItems) {
      if (navItems[nav].path === $location) {
        activeNav = nav;
      }
    }
  }
  function navEventHandler(ind) {
    push(navItems[ind].path);
  }
</script>

<style>
  @import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@500;600;700&display=swap");
  @import url("https://fonts.googleapis.com/css2?family=Varela+Round&display=swap");
  main {
    font-family: "IBM Plex Sans Arabic", sans-serif;
    text-align: center;
    background-color: var(--background-color);
    min-height: 100vh;
    min-width: 100vw;
    overflow-y: scroll;
    transition: background-color 200ms;
  }
  main::-webkit-scrollbar {
    width: 0;
  }
  footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
  }
</style>

<svelte:head>
  {#if $theme === "dark"}
    <meta name="theme-color" content="#232323">
    {:else}
    <meta name="theme-color" content="#dcdcdc">
  {/if}
</svelte:head>
<main class={$theme + "-theme"}>
  <section>
    <Router {routes} />
  </section>
  <footer>
    <Nav {navItems} {activeNav} {navEventHandler}></Nav>
  </footer>
</main>
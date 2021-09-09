import Home from "../pages/Home.svelte";
import Activity from "../pages/Activity.svelte";
import Video from "../pages/Video.svelte";
import Controls from "../pages/Controls.svelte";

const routes = {
  "/": Home,
  "/activity": Activity,
  "/monitor": Video,
  "/controls": Controls
  // Catch-all
  // This is optional, but if present it must be the last
};

export default routes;

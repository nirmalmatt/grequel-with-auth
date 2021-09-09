import Home from "../pages/Home";
import Activity from "../pages/Activity";
import Video from "../pages/Video";
import Controls from "../pages/Controls";

const routes = {
  "/": Home,
  "/activity": Activity,
  "/monitor": Video,
  "/controls": Controls
  // Catch-all
  // This is optional, but if present it must be the last
};

export default routes;

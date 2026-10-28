import { mount } from "svelte";
import App from "./App.svelte";

/** Mounts the app into the page's `#app` element. */
export function start(page: Document): ReturnType<typeof mount> {
  const target = page.getElementById("app");
  if (target === null) {
    throw new Error("crewkit: the page has no #app element");
  }
  return mount(App, { target });
}

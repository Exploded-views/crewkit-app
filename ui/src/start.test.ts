import { afterEach, expect, test } from "vitest";
import { start } from "./start.ts";

afterEach(() => {
  document.body.replaceChildren();
});

test("the entry point mounts the app into the page's #app", async () => {
  const target = document.createElement("div");
  target.id = "app";
  document.body.append(target);
  await import("./main.ts");
  expect(target.textContent).toContain("No crew yet");
});

test("refuses a page without #app", () => {
  const page = document.implementation.createHTMLDocument("crewkit");
  expect(() => start(page)).toThrow("crewkit: the page has no #app element");
});

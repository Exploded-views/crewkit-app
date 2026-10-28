import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import App from "./App.svelte";

test("renders the empty crew map placeholder", () => {
  render(App);
  expect(screen.getByText("No crew yet")).toBeTruthy();
});

import { cleanup } from "@testing-library/svelte";
import { afterEach } from "vitest";

afterEach(cleanup);

// Warnings fail tests: any console.error or console.warn during a test throws.
for (const level of ["error", "warn"] as const) {
  console[level] = (...args: unknown[]): never => {
    throw new Error(`console.${level} during a test: ${args.map(String).join(" ")}`);
  };
}

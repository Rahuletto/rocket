// @ts-nocheck -- Vitest executes this Node-only source-boundary assertion.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("agent review preview boundary", () => {
  it("exposes safe keep and revert controls", () => {
    const source = readFileSync(new URL("./ReviewSurface.tsx", import.meta.url), "utf8");
    expect(source).toContain("Keep File");
    expect(source).toContain("Keep All");
    expect(source).toContain("Revert File");
    expect(source).toContain("Revert All");
    expect(source).toContain("window.confirm");
  });
});

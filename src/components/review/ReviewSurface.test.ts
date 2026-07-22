// @ts-nocheck -- Vitest executes this Node-only source-boundary assertion.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("agent review preview boundary", () => {
  it("exposes review acknowledgement without restore controls", () => {
    const source = readFileSync(new URL("./ReviewSurface.tsx", import.meta.url), "utf8");
    expect(source).toContain("Mark Reviewed");
    expect(source).toContain("Mark Owned Changes Reviewed");
    expect(source).not.toMatch(/Revert File|Revert All|Restore Before/);
  });
});

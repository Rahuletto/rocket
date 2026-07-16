import { describe, expect, it } from "vitest";
import { buildGitGraph } from "./gitGraph";

describe("buildGitGraph", () => {
  it("keeps a straight first-parent history in one lane", () => {
    const rows = buildGitGraph([
      { hash: "c", parents: ["b"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);

    expect(rows.map((row) => row.nodeLane)).toEqual([0, 0, 0]);
    expect(rows.map((row) => row.laneCount)).toEqual([1, 1, 1]);
  });

  it("creates and rejoins a secondary lane for a merge", () => {
    const rows = buildGitGraph([
      { hash: "merge", parents: ["main", "topic"] },
      { hash: "topic", parents: ["base"] },
      { hash: "main", parents: ["base"] },
      { hash: "base", parents: [] },
    ]);

    expect(rows[0].edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 0, to: 0 }),
        expect.objectContaining({ from: 0, to: 1 }),
      ]),
    );
    expect(rows[1].nodeLane).toBe(1);
    expect(rows.at(-1)?.nodeLane).toBe(0);
  });
});

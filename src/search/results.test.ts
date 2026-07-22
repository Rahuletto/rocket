// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { groupSearchResults, type WorkspaceSearchMatch } from "./results";
import { requestSearchNavigation, takeSearchNavigation } from "./navigation";

const match = (path: string, lineNumber: number): WorkspaceSearchMatch => ({
  id: "search", path, lineNumber, line: "matching line", start: 2, end: 7,
});

describe("workspace search results", () => {
  it("groups incrementally received matches by file in encounter order", () => {
    expect(groupSearchResults([match("a.ts", 2), match("b.ts", 3), match("a.ts", 8)])).toEqual([
      { path: "a.ts", matches: [match("a.ts", 2), match("a.ts", 8)] },
      { path: "b.ts", matches: [match("b.ts", 3)] },
    ]);
  });

  it("queues an exact editor range using an absolute normalized path", () => {
    const values = new Map([["project", "/work/project"]]);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => values.get(key) ?? null },
    });
    const location = match("src/main.ts", 12);
    expect(requestSearchNavigation(location)).toBe("/work/project/src/main.ts");
    expect(takeSearchNavigation("/work/project/src/main.ts")).toMatchObject({ lineNumber: 12, start: 2, end: 7 });
    expect(takeSearchNavigation("/work/project/src/main.ts")).toBeUndefined();
  });
});

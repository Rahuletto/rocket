import { describe, expect, it } from "vitest";
import {
  applyCompletion,
  buildCompletions,
  detectCompletionQuery,
  fuzzySearch,
} from "./completion";

const sources = {
  commands: [
    { description: "Show help", name: "help" },
    { description: "Clear chat", name: "clear" },
    { description: "Pick model", name: "model" },
  ],
  files: ["src/App.tsx", "src/agent/protocol.ts", "README.md"],
  sessions: [
    { id: "tab-abc12345", name: "Chat 1" },
    { id: "tab-def67890", name: "Fix auth" },
  ],
  skills: ["review", "deslop"],
};

describe("detectCompletionQuery", () => {
  it("detects slash at start", () => {
    expect(detectCompletionQuery("/he")).toEqual({
      baseIndex: 0,
      kind: "slash",
      query: "he",
    });
  });

  it("detects @ files", () => {
    expect(detectCompletionQuery("look at @src/A")).toMatchObject({
      kind: "at",
      query: "src/A",
    });
  });

  it("detects $ sessions", () => {
    expect(detectCompletionQuery("see $tab")).toMatchObject({
      kind: "session",
      query: "tab",
    });
  });

  it("detects # skills", () => {
    expect(detectCompletionQuery("use #rev")).toMatchObject({
      kind: "hash",
      query: "rev",
    });
  });

  it("uses cursor position instead of trailing text", () => {
    expect(detectCompletionQuery("open @src/App then edit", 13)).toMatchObject({
      kind: "at",
      query: "src/App",
    });
  });
});

describe("buildCompletions", () => {
  it("returns slash commands", () => {
    const items = buildCompletions("/cl", sources);
    expect(items.some((item) => item.label === "/clear")).toBe(true);
  });

  it("returns files for @", () => {
    const items = buildCompletions("@App", sources);
    expect(items[0]?.insert).toContain("App.tsx");
  });

  it("returns skills for #", () => {
    const items = buildCompletions("#des", sources);
    expect(items.map((item) => item.label)).toContain("#deslop");
  });
});

describe("applyCompletion", () => {
  it("replaces the trigger token", () => {
    const result = applyCompletion("/he", {
      insert: "/help ",
      kind: "slash",
      label: "/help",
    });
    expect(result.text).toBe("/help ");
  });

  it("preserves text after cursor", () => {
    const result = applyCompletion(
      "open @src/A later",
      {
        insert: "@src/App.tsx ",
        kind: "at",
        label: "@src/App.tsx",
      },
      11,
    );
    expect(result.text).toBe("open @src/App.tsx  later");
  });
});

describe("fuzzySearch", () => {
  it("ranks exact substring higher", () => {
    const result = fuzzySearch("app", ["src/App.tsx", "append.ts", "foo"]);
    expect(result[0]).toBe("src/App.tsx");
  });
});

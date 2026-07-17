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

  it("returns empty query for bare triggers", () => {
    expect(detectCompletionQuery("/")).toEqual({
      baseIndex: 0,
      kind: "slash",
      query: "",
    });
    expect(detectCompletionQuery("see $")).toMatchObject({
      kind: "session",
      query: "",
    });
    expect(detectCompletionQuery("@")).toMatchObject({ kind: "at", query: "" });
    expect(detectCompletionQuery(" #")).toMatchObject({
      kind: "hash",
      query: "",
    });
  });

  it("does not treat path slashes as slash commands", () => {
    expect(detectCompletionQuery("src/agent/foo")).toBeNull();
    expect(detectCompletionQuery("look in src/App")).toBeNull();
  });

  it("does not start slash completion after a non-space character", () => {
    expect(detectCompletionQuery("foo/help")).toBeNull();
  });

  it("does not treat mid-word # as a skill trigger", () => {
    expect(detectCompletionQuery("issue#123")).toBeNull();
  });

  it("detects slash after newline", () => {
    expect(detectCompletionQuery("hello\n/cl")).toMatchObject({
      kind: "slash",
      query: "cl",
    });
  });

  it("detects slash after tab or other whitespace", () => {
    expect(detectCompletionQuery("hello\t/he")).toMatchObject({
      kind: "slash",
      query: "he",
    });
  });

  it("detects ${session} style query", () => {
    expect(detectCompletionQuery("see ${tab")).toMatchObject({
      kind: "session",
      query: "tab",
    });
  });
});

describe("buildCompletions", () => {
  it("returns slash commands", () => {
    const items = buildCompletions("/cl", sources);
    expect(items.some((item) => item.label === "/clear")).toBe(true);
  });

  it("lists all commands for empty slash query", () => {
    const items = buildCompletions("/", sources);
    expect(items.map((item) => item.label)).toEqual(
      expect.arrayContaining(["/help", "/clear", "/model"]),
    );
    expect(items).toHaveLength(3);
  });

  it("returns files for @", () => {
    const items = buildCompletions("@App", sources);
    expect(items[0]?.insert).toContain("App.tsx");
  });

  it("returns skills for #", () => {
    const items = buildCompletions("#des", sources);
    expect(items.map((item) => item.label)).toContain("#deslop");
  });

  it("returns sessions for $", () => {
    const items = buildCompletions("$auth", sources);
    expect(items.some((item) => item.insert.includes("tab-def67890"))).toBe(
      true,
    );
  });

  it("returns empty when no trigger is active", () => {
    expect(buildCompletions("plain prompt", sources)).toEqual([]);
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

  it("returns prefix of items for empty query", () => {
    expect(fuzzySearch("", ["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });

  it("matches multi-char subsequence across path segments", () => {
    const result = fuzzySearch("apt", [
      "src/agent/protocol.ts",
      "append.ts",
      "foo",
    ]);
    expect(result).toContain("src/agent/protocol.ts");
    expect(result).not.toContain("foo");
  });

  it("drops items that do not match the query", () => {
    expect(fuzzySearch("zzz", ["src/App.tsx", "README.md"])).toEqual([]);
  });
});

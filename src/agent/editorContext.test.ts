import { describe, expect, it } from "vitest";
import {
  buildAgentPrompt,
  flushEditorContext,
  getEditorContext,
  matchesChangedPath,
  setEditorContext,
  setEditorFlush,
  subscribeEditorContext,
  toWorkspaceRelativePath,
  type EditorContextSnapshot,
} from "./editorContext";

const context: EditorContextSnapshot = {
  cursor: { column: 7, line: 12 },
  diagnostics: [
    {
      column: 3,
      line: 12,
      message: "Type 'string' is not assignable to type 'number'.",
      severity: "error",
    },
    {
      column: 1,
      line: 2,
      message: "Unused import.",
      severity: "warning",
    },
  ],
  language: "typescript",
  path: "/workspace/src/example.ts",
  selection: {
    endColumn: 14,
    endLine: 13,
    startColumn: 3,
    startLine: 12,
    text: "const answer = value;\nreturn answer;",
  },
  visibleText: "const answer = value;\nreturn answer;",
  visibleStartLine: 12,
};

describe("buildAgentPrompt", () => {
  it("sends structured editor selection and LSP diagnostics with the request", () => {
    const prompt = buildAgentPrompt("Fix this without changing behavior", context);

    expect(prompt).toContain("<rocket_editor_context>");
    expect(prompt).toContain("file: /workspace/src/example.ts");
    expect(prompt).toContain("selection: 12:3-13:14");
    expect(prompt).toContain("12 | const answer = value;");
    expect(prompt).toContain("error 12:3 Type 'string' is not assignable");
    expect(prompt).toContain("<user_request>\nFix this without changing behavior\n</user_request>");
  });

  it("leaves prompts unchanged when no editor context exists", () => {
    expect(buildAgentPrompt("Inspect the repository", null)).toBe(
      "Inspect the repository",
    );
  });

  it("bounds editor text sent to the agent", () => {
    const huge = {
      ...context,
      selection: undefined,
      visibleText: "x".repeat(30_000),
    };

    expect(buildAgentPrompt("Review", huge).length).toBeLessThan(18_000);
  });

  it("attaches referenced thread transcript to the request", () => {
    const prompt = buildAgentPrompt("Continue from $thread-1", null, {
      threads: [
        {
          id: "thread-1",
          messages: [
            { role: "user", text: "Inspect auth flow" },
            { role: "assistant", text: "Token refresh race found." },
          ],
          title: "Auth investigation",
        },
      ],
    });

    expect(prompt).toContain("<rocket_thread_context>");
    expect(prompt).toContain('thread id="thread-1" title="Auth investigation"');
    expect(prompt).toContain("user: Inspect auth flow");
    expect(prompt).toContain("assistant: Token refresh race found.");
    expect(prompt).toContain("<user_request>\nContinue from $thread-1\n</user_request>");
  });
});

describe("matchesChangedPath", () => {
  it("matches absolute and workspace-relative agent paths", () => {
    expect(
      matchesChangedPath(
        "/workspace/src/example.ts",
        "src/example.ts",
        "/workspace",
      ),
    ).toBe(true);
    expect(
      matchesChangedPath(
        "/workspace/src/example.ts",
        "/workspace/src/example.ts",
        "/workspace",
      ),
    ).toBe(true);
  });

  it("does not match another file with the same basename", () => {
    expect(
      matchesChangedPath(
        "/workspace/src/example.ts",
        "fixtures/example.ts",
        "/workspace",
      ),
    ).toBe(false);
  });

  it("converts agent paths to Git-compatible workspace paths", () => {
    expect(
      toWorkspaceRelativePath("/workspace/src/example.ts", "/workspace"),
    ).toBe("src/example.ts");
    expect(toWorkspaceRelativePath("src/example.ts", "/workspace")).toBe(
      "src/example.ts",
    );
  });
});

describe("editor context store", () => {
  it("publishes active editor context changes", () => {
    const updates: Array<EditorContextSnapshot | null> = [];
    const unsubscribe = subscribeEditorContext(() => {
      updates.push(getEditorContext());
    });

    setEditorContext(context);
    setEditorContext(null);
    unsubscribe();

    expect(updates).toEqual([context, null]);
  });

  it("flushes the active Monaco buffer before an agent turn", async () => {
    let flushes = 0;
    setEditorFlush("example", async () => {
      flushes += 1;
    });

    await flushEditorContext();
    setEditorFlush("example", null);
    await flushEditorContext();

    expect(flushes).toBe(1);
  });
});

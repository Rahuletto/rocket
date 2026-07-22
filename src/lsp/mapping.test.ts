import { describe, expect, it, vi } from "vitest";
import { applyMarkers, navigationDetail, toMonacoRange } from "./mapping";
import type { DiagnosticSnapshot } from "./types";

const snapshot: DiagnosticSnapshot = { uri: "file:///tmp/example.ts", diagnostics: [{ severity: 2, message: "unused value", range: { start: { line: 2, character: 4 }, end: { line: 2, character: 9 } } }] };

describe("LSP Monaco mapping", () => {
  it("converts zero-based LSP ranges to one-based Monaco ranges", () => expect(toMonacoRange(snapshot.diagnostics[0].range)).toEqual({ startLineNumber: 3, startColumn: 5, endLineNumber: 3, endColumn: 10 }));
  it("maps diagnostics to the matching model", () => { const setModelMarkers = vi.fn(); const monaco = { MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 }, editor: { getModels: () => [{ uri: { toString: () => snapshot.uri } }], setModelMarkers } }; expect(applyMarkers(monaco, snapshot)).toBe(true); expect(setModelMarkers.mock.calls[0][2][0]).toMatchObject({ message: "unused value", severity: 4, startLineNumber: 3 }); });
  it("builds exact navigation details", () => expect(navigationDetail(snapshot, 0)).toEqual({ path: "/tmp/example.ts", lineNumber: 3, start: 4, end: 9 }));
});

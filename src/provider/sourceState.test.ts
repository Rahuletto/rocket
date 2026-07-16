import { describe, expect, it } from "vitest";
import {
  closeSourceFile,
  openSourceFile,
  replaceSourceFiles,
  type SourceState,
} from "./sourceState";

const emptyState: SourceState = {
  opened: [],
  selected: "",
};

describe("sourceState", () => {
  it("opens a file once and selects it", () => {
    const opened = openSourceFile(emptyState, "file-a");
    const reopened = openSourceFile(opened, "file-a");

    expect(reopened).toEqual({
      opened: ["file-a"],
      selected: "file-a",
    });
  });

  it("selects the adjacent file when the active file closes", () => {
    const state: SourceState = {
      opened: ["file-a", "file-b", "file-c"],
      selected: "file-b",
    };

    expect(closeSourceFile(state, "file-b")).toEqual({
      opened: ["file-a", "file-c"],
      selected: "file-c",
    });
  });

  it("keeps selection when a background file closes", () => {
    const state: SourceState = {
      opened: ["file-a", "file-b"],
      selected: "file-b",
    };

    expect(closeSourceFile(state, "file-a")).toEqual({
      opened: ["file-b"],
      selected: "file-b",
    });
  });

  it("normalizes restored panel ids and clears stale selection", () => {
    expect(
      replaceSourceFiles(
        { opened: ["old"], selected: "old" },
        ["file-a", "file-a", "file-b"],
      ),
    ).toEqual({
      opened: ["file-a", "file-b"],
      selected: "file-a",
    });
  });
});

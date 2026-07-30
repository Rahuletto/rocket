import { describe, expect, it } from "vitest";
import {
  allModels,
  availableModels,
  findAvailableModel,
  findModel,
} from "./catalog";
import * as catalog from "./catalog";

describe("Codex model catalog", () => {
  it("only exposes models backed by an available runtime", () => {
    expect(availableModels().length).toBeGreaterThan(0);
    expect(availableModels().every((model) => model.engine === "codex")).toBe(true);
    expect(availableModels().some((model) => model.providerId !== "codex")).toBe(false);
    expect(findAvailableModel("anthropic/claude-sonnet-4-20250514")).toBeUndefined();
  });

  it("does not advertise fixed models rejected by ChatGPT Codex accounts", () => {
    expect(
      allModels()
        .filter((model) => model.engine === "codex")
        .map((model) => model.id),
    ).toEqual(["codex/default"]);
    expect(findModel("codex/gpt-5")).toBeUndefined();
  });

  it("does not reconnect when selecting active model again", () => {
    const isModelSelectionChange = (catalog as Record<string, unknown>)[
      "isModelSelectionChange"
    ];
    expect(isModelSelectionChange).toBeTypeOf("function");
    expect(
      (isModelSelectionChange as (current: string, next: string) => boolean)(
        "codex/default",
        "codex/default",
      ),
    ).toBe(false);
  });
});

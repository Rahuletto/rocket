import { describe, expect, it } from "vitest";
import {
  findSlashCommand,
  parseSlashInput,
  SLASH_COMMANDS,
} from "./commands";

describe("slash command registry", () => {
  it("parses a command and arguments", () => {
    expect(parseSlashInput("  /model codex/o3  ")).toEqual({
      args: "codex/o3",
      name: "model",
    });
  });

  it("ignores ordinary prompts", () => {
    expect(parseSlashInput("explain /model routing")).toBeNull();
  });

  it("keeps registered commands host-only", () => {
    expect(SLASH_COMMANDS.every((command) => command.host)).toBe(true);
    expect(findSlashCommand("clear")?.name).toBe("clear");
  });
});

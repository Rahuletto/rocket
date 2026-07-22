import { describe, expect, it } from "vitest";
import {
  findSlashCommand,
  HELP_TEXT,
  parseSlashInput,
  SLASH_COMMANDS,
  TOOLS_HELP,
  validateSlashInput,
} from "./commands";

describe("slash command registry", () => {
  it("parses a command and arguments", () => {
    expect(parseSlashInput("  /model codex/o3  ")).toEqual({
      args: "codex/o3",
      name: "model",
    });
  });

  it("parses bare commands without args", () => {
    expect(parseSlashInput("/clear")).toEqual({ args: "", name: "clear" });
    expect(parseSlashInput("/HELP")).toEqual({ args: "", name: "help" });
  });

  it("ignores ordinary prompts", () => {
    expect(parseSlashInput("explain /model routing")).toBeNull();
  });

  it("keeps registered commands host-only", () => {
    expect(SLASH_COMMANDS.every((command) => command.host)).toBe(true);
    expect(findSlashCommand("clear")?.name).toBe("clear");
    expect(findSlashCommand("help")?.name).toBe("help");
    expect(findSlashCommand("model")?.name).toBe("model");
  });

  it("includes required host commands in the registry and help text", () => {
    const names = SLASH_COMMANDS.map((command) => command.name);
    for (const required of ["help", "clear", "model"]) {
      expect(names).toContain(required);
      expect(HELP_TEXT).toContain(`/${required}`);
    }
  });

  it("does not advertise commands with no working native runtime behavior", () => {
    const names = SLASH_COMMANDS.map((command) => command.name);
    expect(names).not.toContain("subagents");
    expect(names).not.toContain("plan");
    expect(names).not.toContain("connect");
    expect(TOOLS_HELP).not.toContain("coming online");
  });

  it("rejects arguments for commands that take none", () => {
    expect(validateSlashInput("/clear later")).toEqual({
      error: "Usage: /clear",
      ok: false,
    });
    expect(validateSlashInput("/sessions extra")).toEqual({
      error: "Usage: /sessions",
      ok: false,
    });
  });

  it("accepts one optional model identifier", () => {
    const valid = validateSlashInput("/model codex/default");
    expect(valid?.ok).toBe(true);
    expect(validateSlashInput("/model one two")).toEqual({
      error: "Usage: /model [model-id]",
      ok: false,
    });
  });

  it("returns a precise unknown-command error", () => {
    expect(validateSlashInput("/missing")).toEqual({
      error: "Unknown command `/missing`.",
      ok: false,
    });
  });
});

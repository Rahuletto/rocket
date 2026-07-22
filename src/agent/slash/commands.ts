export interface SlashCommand {
  arguments: "none" | "optional-single";
  description: string;
  /** Host-handled (not sent to the model). */
  host: boolean;
  name: string;
}

/** GUI-relevant subset of lavalamp slash commands. */
export const SLASH_COMMANDS: SlashCommand[] = [
  { arguments: "none", description: "Show available commands", host: true, name: "help" },
  { arguments: "none", description: "Clear this chat transcript", host: true, name: "clear" },
  { arguments: "none", description: "Open a new agent chat tab", host: true, name: "new" },
  { arguments: "optional-single", description: "Show or change the model", host: true, name: "model" },
  { arguments: "none", description: "List agent chat tabs", host: true, name: "sessions" },
  { arguments: "none", description: "Show workspace path", host: true, name: "workspace" },
  { arguments: "none", description: "List available tools", host: true, name: "tools" },
];

export function parseSlashInput(raw: string): {
  args: string;
  name: string;
} | null {
  const text = raw.trim();
  if (!text.startsWith("/")) return null;
  const body = text.slice(1);
  const space = body.search(/\s/);
  if (space === -1) return { args: "", name: body.toLowerCase() };
  return {
    args: body.slice(space + 1).trim(),
    name: body.slice(0, space).toLowerCase(),
  };
}

export function findSlashCommand(name: string): SlashCommand | undefined {
  return SLASH_COMMANDS.find((command) => command.name === name);
}

export type SlashValidation =
  | { args: string; command: SlashCommand; ok: true }
  | { error: string; ok: false };

export function validateSlashInput(raw: string): SlashValidation | null {
  const parsed = parseSlashInput(raw);
  if (!parsed) return null;
  const command = findSlashCommand(parsed.name);
  if (!command) {
    return {
      error: `Unknown command \`/${parsed.name}\`.`,
      ok: false,
    };
  }
  if (command.arguments === "none" && parsed.args) {
    return { error: `Usage: /${command.name}`, ok: false };
  }
  if (
    command.arguments === "optional-single" &&
    parsed.args.split(/\s+/).filter(Boolean).length > 1
  ) {
    return { error: `Usage: /${command.name} [model-id]`, ok: false };
  }
  return { args: parsed.args, command, ok: true };
}

export const HELP_TEXT = SLASH_COMMANDS.map(
  (command) => `/${command.name} — ${command.description}`,
).join("\n");

export const TOOLS_HELP =
  "Codex provides repository search, file reads and edits, patches, and shell commands.\n" +
  "Rocket adds active editor selection, visible code, diagnostics, changed-file refresh, and Git review context.";

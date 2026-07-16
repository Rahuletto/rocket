export interface SlashCommand {
  description: string;
  /** Host-handled (not sent to the model). */
  host: boolean;
  name: string;
}

/** GUI-relevant subset of lavalamp slash commands. */
export const SLASH_COMMANDS: SlashCommand[] = [
  { description: "Show available commands", host: true, name: "help" },
  { description: "Clear this chat transcript", host: true, name: "clear" },
  { description: "Open a new agent chat tab", host: true, name: "new" },
  { description: "Show or change the model", host: true, name: "model" },
  { description: "Connect providers", host: true, name: "connect" },
  { description: "List agent chat tabs", host: true, name: "sessions" },
  { description: "Show workspace path", host: true, name: "workspace" },
  { description: "List available tools", host: true, name: "tools" },
  { description: "List subagents / experts", host: true, name: "subagents" },
  { description: "Toggle plan mode (Flue runtime)", host: true, name: "plan" },
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

export const HELP_TEXT = SLASH_COMMANDS.map(
  (command) => `/${command.name} — ${command.description}`,
).join("\n");

export const TOOLS_HELP =
  "Codex runtime: tools are provided by Codex (shell, file edits, search).\n" +
  "Lava (Flue) runtime: lavalamp-class tools — read/write/edit, ripgrep, codebase_search, " +
  "semantic search, graph, skills, experts, parallel subagents (coming online as the Lava sidecar ships).";

export const SUBAGENTS_HELP =
  "Experts (Lava runtime): ui, refactor, logic, database, oracle, research, critique, spectacle.\n" +
  "Parallel subagents: deploy_parallel_subs for multi-agent research (Lava).";

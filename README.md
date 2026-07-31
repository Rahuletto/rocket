<p align="center">
  <img src="public/rocket.png" alt="Rocket" width="720">
</p>

<h1 align="center">Rocket</h1>

<p align="center">
  A fast, lightweight agentic code editor built with Tauri, React, and Monaco.
</p>

Rocket keeps coding fast and focused while bringing agents directly into the editor. Agent changes are designed to be visible, reviewable, and recoverable instead of happening inside a disconnected chat window. Today, Rocket's supported agent runtime is the local [OpenAI Codex CLI](https://github.com/openai/codex). The longer-term direction is a runtime-neutral editor that can support multiple coding agents through the [Agent Client Protocol (ACP)](https://agentclientprotocol.com/).

> [!IMPORTANT]
> Rocket is under active development. Native Codex is the only agent runtime that currently executes end to end. ACP profiles, additional agents, and several daily-driver editor features remain roadmap work.

## What works today

### Agent workflow

- Multiple independent agent chat tabs with streaming messages, reasoning, tool activity, approvals, interruption, and queued follow-up prompts.
- Automatic context from the active file, cursor or selection, and TypeScript/JavaScript diagnostics.
- Composer completion for host commands (`/`), workspace files (`@`), other agent tabs (`$`), and workspace skills (`#`).
- Persistent transcripts and tool state backed by SQLite. Restored transcripts are clearly marked when the original agent runtime is no longer connected.
- Codex model selection and executable probing from the agent picker.

### Review and recovery

- Per-session change tracking that keeps agent edits separate from changes already present in the workspace.
- Unified diffs with **Keep File**, **Revert File**, **Keep All**, and **Revert All** actions.
- Conflict warnings when a tracked file changes outside the agent session.
- Automatic pre-turn checkpoints and manual checkpoint commands for listing, restoring, and deleting safe points.

### Editor and workbench

- Monaco-based editor with syntax highlighting, tabs, file creation, folder navigation, image previews, and configurable panel placement.
- Integrated PTY terminal with tabs and splits.
- Workspace-wide text search powered by `ripgrep`, including cancellation, hidden-file control, grouped results, and exact-range navigation.
- TypeScript/JavaScript language intelligence with diagnostics, completion, hover, definitions, references, rename, code actions, formatting, and a Problems panel.
- Git status, staging, unstaging, commits, history graph, and diff review.

### Local security boundary

- Native filesystem, terminal, Git, search, LSP, and agent operations are confined to the active workspace.
- Workspace paths are canonicalized and checked to prevent traversal and unsafe symlink escapes.
- The TypeScript language server starts with a cleared environment and a small system-variable allowlist, so provider credentials are not inherited.
- Rocket state is stored locally under `~/.rocket`; sensitive JSON files use user-only permissions on Unix.

## Install on macOS

Rocket's published builds currently target macOS on Apple Silicon and Intel.

1. Install and authenticate the [Codex CLI](https://github.com/openai/codex#installation).
2. Confirm that Rocket will be able to find it:

   ```sh
   codex --version
   ```

3. Download the latest macOS build from [GitHub Releases](https://github.com/Rahuletto/rocket/releases).
4. Open the DMG, drag Rocket into **Applications**, and launch it.
5. Open a project folder, open the Agent panel, and use **Check agent setup** to verify the runtime.

<details>
  <summary><strong>macOS says Rocket cannot be opened or the developer cannot be verified</strong></summary>

Rocket's current builds are not notarized with an Apple Developer ID. After attempting to open Rocket:

1. Open **System Settings → Privacy & Security**.
2. Scroll to the security notice for Rocket.
3. Click **Open Anyway**, then confirm **Open**.

Only bypass Gatekeeper for a build you downloaded from this repository's release page.

</details>

## Build from source

### Prerequisites

- macOS with the Xcode Command Line Tools
- [Bun](https://bun.sh/) 1.3.14 or newer
- [Rust](https://rustup.rs/) 1.77.2 or newer
- Git and `ripgrep` available on `PATH`
- The [Codex CLI](https://github.com/openai/codex) available on `PATH` for agent features

```sh
git clone https://github.com/Rahuletto/rocket.git
cd rocket
bun install --frozen-lockfile
bun run app
```

`bun run app` starts the full Tauri desktop application. `bun run dev` starts only the Vite frontend; native filesystem, terminal, Git, LSP, search, and agent commands require the Tauri host.

### Development commands

| Command | Purpose |
| --- | --- |
| `bun run app` | Run Rocket in Tauri development mode |
| `bun run dev` | Run the Vite frontend only |
| `bun run test` | Run the Vitest suite once |
| `bun run build` | Type-check and build the frontend |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Run the Rust test suite |
| `bun run bundle` | Build an Apple Silicon macOS bundle |

## Agent composer

Rocket starts `codex app-server --stdio` inside the open workspace. Tool requests that require confirmation appear directly in the transcript, and file activity is reconciled into the session review after each turn.

| Prefix | Purpose | Example |
| --- | --- | --- |
| `/` | Run a Rocket host command | `/help`, `/checkpoint`, `/checkpoints` |
| `@` | Reference a workspace file | `Explain @src/App.tsx` |
| `$` | Include context from another Rocket agent tab | `Continue from $session` |
| `#` | Reference a skill discovered under `.agents/skills` | `Use #refactor` |

Use `/help` in the composer for the current command list. File, tab, and skill references are converted into bounded prompt context where supported; they are not a general-purpose extension system.

## Local data and credentials

Rocket keeps application state on your machine:

| Path | Contents |
| --- | --- |
| `~/.rocket/state.sqlite3` | Agent sessions and transcript state |
| `~/.rocket/checkpoints/` | Deduplicated checkpoint blobs |
| `~/.rocket/config.json` | Agent and provider preferences |
| `~/.rocket/credentials.json` | Credentials entered through provider connection forms |

Credential files are permission-restricted on Unix but are **not currently stored in the macOS Keychain**. The additional provider forms are configuration groundwork; those providers do not execute agent turns in the current build. Codex authentication remains owned by the Codex CLI.

## Current limitations

- Native Codex is the only supported agent runtime; ACP and other provider entries are not yet executable.
- Release artifacts are currently produced for macOS only.
- Language-server integration currently targets TypeScript and JavaScript.
- Git support covers local status, review, staging, history, and commits, but not the full branch/fetch/pull/push/stash workflow.
- There is no extension marketplace, integrated debugger, remote workspace support, or built-in browser yet.
- Rocket is not yet positioned as a stable replacement for a mature daily-driver IDE.

## Project direction

Rocket is evolving into a **lightweight, open-protocol, local-first agent editor** with:

1. trustworthy change ownership, review, and checkpoints;
2. durable sessions behind a runtime-neutral agent model;
3. ACP-based support for multiple coding agents;
4. worktree isolation for parallel write-capable sessions;
5. structured context attachments and common Rocket-owned workspace tools; and
6. stronger search, language intelligence, Git workflows, and settings.

The detailed architecture, milestone gates, acceptance criteria, and immediate backlog live in [`PLAN.md`](PLAN.md). That document is the source of truth for planned work; this README describes shipped behavior.

## Architecture at a glance

```text
┌─────────────────────────────────────────────────────────────┐
│ React workbench                                             │
│ Explorer │ Monaco │ Agent │ Review │ Terminal │ Git │ LSP │
└────────────────────────────┬────────────────────────────────┘
                             │ Tauri commands and events
┌────────────────────────────▼────────────────────────────────┐
│ Rust host services                                          │
│ Workspace guard │ Sessions │ Checkpoints │ Search │ PTY     │
│ Git             │ LSP      │ Change tracking               │
└────────────────────────────┬────────────────────────────────┘
                             │ JSON-RPC over stdio
                    ┌────────▼─────────┐
                    │ Codex app-server │
                    └──────────────────┘
```

The frontend consumes session-aware Rocket events rather than talking to the Codex process directly. Native services enforce the workspace boundary and own durable state, review baselines, and checkpoints.

## Contributing

Issues, design feedback, and pull requests are welcome.

1. Fork the repository and create a focused branch.
2. Keep changes small and consistent with the existing Tauri/React boundaries.
3. Add or update focused tests for behavioral changes.
4. Run the relevant frontend and Rust checks.
5. Open a pull request that explains the user-visible outcome and any known limitations.

For roadmap-sized changes, please open a [GitHub Discussion](https://github.com/Rahuletto/rocket/discussions) before implementation so the approach can be aligned with the current plan.

## Community and support

- [GitHub Discussions](https://github.com/Rahuletto/rocket/discussions)
- [Discord](https://discord.gg/3JzDV9T5Fn)
- [Issue tracker](https://github.com/Rahuletto/rocket/issues)

## License

Rocket is source-available under the [Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International license](LICENSE). Review the license before redistributing or reusing the project.

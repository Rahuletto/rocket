# Rocket Product and Engineering Plan

**Status:** Working roadmap  
**Updated:** 2026-07-18  
**Scope:** Move Rocket from a capable local Codex workbench to a credible, lightweight, local-first agentic code editor.

## Product direction

Rocket should not attempt to become a smaller copy of every feature in Cursor, VS Code, Zed, Windsurf/Devin Desktop, and JetBrains.

The focused product position is:

> **A lightweight, open, local-first agent editor with excellent review, safe parallel worktrees, and support for multiple coding agents through ACP.**

Rocket owns the editor experience, session history, permissions, review, checkpoints, context attachments, worktrees, Git integration, and a common workspace tool service. Coding agents own their model loops and may retain agent-specific tools, but Rocket-owned tools provide consistent read, search, hash-verified edit, command, diagnostics, and audit semantics across compatible agents.

ACP is the primary interoperability path. The existing native Codex app-server integration remains supported until an ACP adapter reaches equivalent fidelity and reliability. Rocket should not build or bundle a separate Flue/Lavalamp runtime unless a concrete workflow remains impossible through ACP, MCP, or an existing agent.

---

## What the old plan already delivered

The previous “Lavalamp GUI” plan is no longer an accurate current-state document. The following work is complete or substantially complete:

- Multi-tab agent UI with independent Codex processes.
- Streaming messages, reasoning, commands, file changes, MCP activity, approvals, and interruption.
- `/`, `@`, `$`, and `#` composer completion.
- Host slash-command registry.
- Workspace file and skill discovery.
- Model picker and provider connection forms.
- Tauri-side configuration and credential files with restricted Unix permissions.
- Selected Codex model forwarding into `thread/start`.
- Integrated local PTY terminals with tabs and splits.
- Local Git status, history, staging, commits, and diff rendering.
- Per-workspace editor layout persistence.

The following old-plan items are only presentation scaffolding and must not be counted as shipped capabilities:

- Non-Codex provider execution.
- Plan mode.
- Subagents and experts.
- Hard file, session, skill, or image attachments.
- Durable agent sessions.
- Agent change review.
- Checkpoints and rollback.

### Superseded old decisions

| Old decision | New decision |
|---|---|
| Build a Flue/Lavalamp Node sidecar | Implement a generic ACP v1 client and connect maintained agents/adapters. |
| Route providers to either Codex or Flue | Select an agent profile first; discover its models and modes through ACP config options. |
| Copy the full Lavalamp runtime, tools, and experts | Implement a focused Rocket workspace tool service, expose it through MCP, and keep agent-native tools as non-portable capabilities. |
| Build Rocket-specific subagent orchestration first | Render agent-reported subagents as tool activity; add Rocket orchestration only after worktree isolation exists. |
| Expose future `/tools`, `/subagents`, and `/plan` commands | Make commands capability-driven or hide them when the active runtime cannot execute them. |
| Treat textual mentions as context integration | Introduce structured Rocket attachments and map them to ACP content blocks or native adapter input. |

---

## Non-negotiable product principles

1. **Truthful UI:** controls and models are visible as available only when they execute end to end.
2. **Review before breadth:** no new runtime is considered usable until its changes can be reviewed and reverted.
3. **Capability-driven UX:** ACP features are shown from negotiated capabilities, not hard-coded assumptions about an agent.
4. **Native Codex stability:** ACP work must not regress the existing Codex path.
5. **Workspace confinement:** every Rocket-owned file, Git, and terminal operation enforces allowed roots.
6. **Isolation for parallel writes:** parallel editing agents use separate Git worktrees.
7. **Open protocols over copied runtimes:** prefer ACP for agents, MCP for external tools, LSP for language intelligence, and DAP for debugging.
8. **Local-first by default:** cloud execution is optional future work, not a prerequisite for a useful product.
9. **Unknown protocol data is preserved:** agent-specific metadata, raw tool data, and unknown ACP extensions must not be discarded.
10. **One complete workflow at a time:** each milestone ends with an end-to-end user outcome and a release gate.
11. **Common semantics, honest guarantees:** every compatible agent receives the same Rocket tools, but Rocket claims enforced tool use only when native mutation paths are removed by adapter configuration and OS-level isolation.

---

## Target architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│ React workbench                                                 │
│                                                                 │
│ Editor │ Agent sessions │ Review │ Terminal │ Git │ Settings   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ version-independent commands/events
┌──────────────────────────────▼──────────────────────────────────┐
│ Tauri/Rust product services                                    │
│                                                                 │
│ Session store │ Change tracker │ Checkpoints │ Permission policy│
│ Worktrees │ Context │ Workspace tools/MCP │ Workspace guard    │
└───────────────┬───────────────────────────────┬─────────────────┘
                │                               │
      ┌─────────▼──────────┐          ┌─────────▼──────────┐
      │ Native adapters   │          │ ACP v1 client      │
      │                   │          │                    │
      │ Codex app-server  │          │ initialize/auth    │
      │ future exceptions │          │ sessions/prompts   │
      └────────────────────┘          │ tools/permissions  │
                                      │ config/MCP/cancel  │
                                      └─────────┬──────────┘
                                                │ NDJSON stdio
                       ┌────────────────────────┼────────────────────────┐
                       │                        │                        │
             ┌─────────▼────────┐     ┌─────────▼────────┐     ┌─────────▼────────┐
             │ codex-acp        │     │ claude-agent-acp │     │ Native ACP modes │
             │ adapter          │     │ adapter          │     │ Gemini/OpenCode  │
             └──────────────────┘     └──────────────────┘     └──────────────────┘
```

### Internal boundary

React must consume a version-independent Rocket domain model, not Codex app-server or ACP wire types directly.

The normalized model must represent at least:

- backend and agent profile identity;
- opaque connection, session, turn, message, tool, and permission IDs;
- user, assistant, and thought content blocks;
- tool creation, status updates, content, locations, diffs, terminals, and raw data;
- complete plan replacements;
- permission options and decisions;
- runtime config options such as model, mode, and reasoning level;
- usage information;
- turn completion and stop reason;
- capability snapshots;
- raw protocol payload and namespaced metadata for diagnostics.

ACP v1 and the native Codex adapter map into this model separately. ACP v2, when stable, must be implemented as another codec rather than leaking a breaking wire model into the UI.

---

## Delivery model

Work proceeds across three tracks, but release gates preserve the dependency order.

```text
TRACK A — TRUST
A0 Product truth/security
        │
        ▼
A1 Change ownership and review
        │
        ▼
A2 Checkpoints and durable sessions
        │
        └──────────────────────┐
                               │
TRACK B — AGENTS               │
B0 Runtime-neutral domain model│
        │                      │
        ▼                      │
B1 ACP v1 transport/core ◀─────┘
        │
        ▼
B2 Agent profiles and compatibility
        │
        ▼
B3 Worktree-isolated parallel agents
        │
        ▼
B4 Attachments, MCP, permissions

TRACK C — EDITOR
C0 Workspace search
        │
        ▼
C1 LSP and diagnostics
        │
        ▼
C2 Git workflow and settings
        │
        ▼
C3 Debugging, browser, remote work
```

Track B may prototype while Track A is underway, but no additional write-capable agent is promoted as stable before A1 and basic checkpoint restore are complete.

---

# Milestones

## A0 — Product truth and workspace safety

**Outcome:** Rocket stops advertising unfinished behavior and consistently confines native operations to the selected workspace.

### Work

- Wire the native Save command to the active editor, including dirty/error behavior, or remove it until implemented.
- Remove or hide disabled workspace Search until C0 ships.
- Hide unavailable non-Codex model rows from the default model list; optionally place them in a clearly labeled experimental section.
- Remove placeholder `/subagents`, `/tools`, and `/plan` behavior unless the active backend advertises an executable equivalent.
- Replace the blank agent state with workspace, runtime, model, setup, permission, and example-prompt guidance.
- Add actionable missing-Codex and connection error states.
- Introduce one canonical workspace-path guard in Rust:
  - canonicalize workspace and requested path;
  - reject traversal outside allowed roots;
  - define and test symlink behavior;
  - apply it to filesystem, watchers, terminal CWD, Git repository paths, and reveal operations.
- Do not modify or reset unrelated existing user changes during this milestone.

### Acceptance criteria

- Every visible primary control performs its labeled action.
- No unavailable runtime/model appears selectable.
- Native commands reject paths outside the selected workspace unless the user explicitly grants an additional root.
- Missing or moved workspaces produce a recoverable UI rather than silent failure.
- Existing Codex send, interrupt, approvals, file editing, terminal, and Git tests remain green.

---

## A1 — Agent change ownership and review

**Outcome:** Users can identify exactly what one agent session changed and inspect it before keeping or reverting it.

### Design

Git status alone cannot determine ownership when the workspace already contains user changes. At session start, Rocket records a baseline manifest for files the session later touches. On first touch, Rocket stores the pre-agent content and metadata. The resulting session change set is independent of the repository's pre-existing dirty state.

### Work

- Add a Rust-owned session change tracker keyed by Rocket session ID.
- Capture the pre-agent version of each file before or at the first observed agent edit.
- Track create, modify, delete, and rename where detectable.
- Preserve existing user changes as the session baseline; never call global `git reset`, `git checkout`, or `git clean` for review operations.
- Connect the existing changed-files control to a real review surface.
- Add:
  - changed-file list and diff stats;
  - multi-file and focused single-file diff views;
  - jump to file;
  - Keep File;
  - Revert File to session baseline;
  - Keep All;
  - Revert All Session Changes.
- Warn when a file changed outside Rocket after the agent baseline was captured.
- Keep Git review and agent-session review as related but distinct concepts.

### Acceptance criteria

- Start from a repository with pre-existing uncommitted changes, run an agent edit, and revert only the agent's changes without losing the initial user changes.
- Created and deleted files review and restore correctly.
- Review remains usable when the repository is not a Git repository.
- The current dead “Review changes” control is functional.
- Change tracking has unit tests for modify/create/delete, dirty baseline, and external-conflict cases.

---

## A2 — Checkpoints and durable sessions

**Outcome:** Agent history survives restart, and users can return to safe points without depending on Git commits.

### Storage

Use SQLite for structured Rocket product state. Do not put transcript payloads or checkpoint contents in renderer localStorage.

Persist:

- Rocket session ID and title;
- backend kind and agent profile ID;
- opaque agent session ID;
- workspace and additional allowed roots;
- protocol and adapter versions;
- negotiated capabilities;
- messages and content blocks;
- tool activity and raw metadata;
- plans, permissions, config options, and usage;
- turn lifecycle and queue;
- session change set;
- checkpoint metadata;
- MCP descriptors without plaintext secrets.

### Checkpoint policy

- Create a checkpoint before every write-capable turn.
- Allow explicit user-created checkpoints.
- Store only files that differ from the prior checkpoint, using content-addressed blobs or another deduplicated representation.
- Preserve the workspace's initial dirty state.
- Restore only files owned by that checkpoint after conflict confirmation.
- Add retention limits and garbage collection.

### Resume behavior

- Native Codex: resume only when the existing API and stored opaque ID support it reliably; otherwise restore the transcript and start a clearly labeled new runtime context.
- ACP: prefer `session/resume` when the editor already has history; use `session/load` when replay is desired and supported; otherwise start a new agent session.
- Never imply that a transcript restored in the UI means the agent retained its internal context.

### Acceptance criteria

- Restart Rocket and reopen complete session history, change review, and checkpoint metadata.
- Restore a pre-turn checkpoint without losing unrelated workspace edits.
- A crash during database or checkpoint writing leaves the previous consistent state readable.
- Session deletion removes unreferenced checkpoint blobs.
- Resume/new-context status is explicit in the UI.

---

## B0 — Runtime-neutral agent domain and adapter boundary

**Outcome:** The existing Codex integration operates behind a stable Rocket backend contract, ready for ACP without behavior regression.

### Work

- Define `AgentBackend` operations for:
  - launch and initialize;
  - authenticate/status;
  - new/load/resume/close session;
  - prompt and cancel;
  - permission response;
  - config-option changes;
  - graceful shutdown.
- Define backend capabilities independently of ACP wire structs.
- Move current Codex behavior into `CodexAppServerBackend` with minimal semantic changes.
- Keep the existing session-keyed process manager; do not introduce trait objects or layers solely for architectural purity.
- Preserve raw native Codex events where normalization would lose useful information.
- Route all backend events through one session-aware host dispatcher.
- Add adapter contract tests using recorded Codex fixtures.

### Acceptance criteria

- No user-visible regression in native Codex behavior.
- The frontend imports no Codex-specific or ACP-specific wire types.
- A fake backend can execute a complete prompt/tool/approval/cancel lifecycle in tests.
- Backend crashes fail pending operations and leave the session recoverable.

---

## B1 — Generic ACP v1 client

**Outcome:** Rocket can launch and converse with one conforming ACP v1 agent through a capability-driven UI.

### Protocol scope

Implement stable ACP **protocol version 1** first. ACP v2 remains behind an architectural seam until it is stable.

Required client behavior:

- supervised child-process launch;
- UTF-8 NDJSON JSON-RPC over stdio;
- stderr log capture separate from protocol stdout;
- concurrent request correlation;
- bidirectional Agent-to-Client method handling;
- bounded queues/backpressure;
- graceful shutdown, EOF, crash, and timeout handling;
- redacted protocol tracing for diagnostics.

Required ACP methods:

- `initialize` with protocol and capability negotiation;
- `authenticate` when advertised/required;
- `session/new`;
- `session/prompt`;
- `session/cancel`;
- `session/update` handling;
- `session/request_permission` handling.

Map at least:

- user, agent, and thought chunks;
- tool calls and tool updates;
- content blocks, locations, raw input/output, diffs, and terminal references;
- complete plan replacements;
- available commands;
- config option updates;
- usage updates;
- stop reasons.

Preserve unknown `_meta`, extension fields, and raw payloads rather than failing the session.

### Initial client capabilities

Begin conservatively:

- text and resource-link prompts;
- permission requests;
- stdio MCP descriptors during session setup;
- no client filesystem or terminal capability until the workspace guard and policy layer are complete.

Add image, audio, embedded context, HTTP MCP, session lifecycle, filesystem, and terminal support only when negotiated and tested.

### Acceptance criteria

- Rocket passes an automated fixture-based initialize/new-session/prompt/update/cancel flow.
- One reference or minimal ACP agent works end to end without paid model access.
- Unknown optional events do not crash or disconnect the session.
- Cancellation resolves outstanding permission requests and cleans up client-owned resources.
- Protocol logs redact credentials and environment secrets.

---

## B2 — Agent profiles and compatibility matrix

**Outcome:** Users can install/configure several agents and Rocket presents only the capabilities each one actually supports.

### Agent profile model

Persist:

- stable Rocket profile ID;
- display name and icon;
- backend kind (`codex-app-server` or `acp-v1`);
- command and arguments;
- environment-variable allowlist;
- adapter/executable version probe;
- installation source and update strategy;
- known compatibility notes;
- last capability snapshot.

Do not store provider API keys in the profile. Let agents own their native authentication where possible; Rocket stores only credentials for flows it explicitly manages.

### Initial profiles

1. **Codex — native app-server**: existing default and fidelity baseline.
2. **Codex — ACP**: through the maintained `codex-acp` adapter, initially experimental.
3. **Claude Agent — ACP**: through `claude-agent-acp`.
4. **Gemini CLI — ACP**: native/reference ACP mode where available.
5. **OpenCode — ACP**: native `opencode acp` mode.
6. **Custom ACP command**: expert users provide a command, args, and safe env allowlist.

### Capability-driven UI

- Discover models, modes, reasoning levels, and other selectors from ACP session config options.
- Preserve opaque IDs; do not force models into Rocket's current static provider catalog.
- Show session load/resume/list/close only when advertised.
- Show image, embedded-resource, MCP transport, plan, and other controls only when supported.
- Explain that ACP sessions and capabilities are agent-specific and not portable between agents.

### Compatibility tests

For every supported profile, record and test:

- launch and initialization;
- authentication flow;
- content capabilities;
- model/mode/config options;
- tool and permission behavior;
- diffs and terminal output;
- plans and usage;
- MCP transport support;
- session lifecycle support;
- cancellation;
- process failure and restart.

### Acceptance criteria

- At least two independently implemented agents complete read/edit/command/permission flows in Rocket.
- Native Codex remains the default until Codex ACP reaches feature parity on Rocket's tested matrix.
- Unsupported controls are absent or explicitly unavailable, never silently ignored.
- A broken custom profile fails with command, stderr, protocol, and recovery guidance.

---

## B3 — Worktree-isolated parallel agents

**Outcome:** Multiple write-capable sessions can run concurrently without editing the same checkout.

### Modes

- **Current workspace:** interactive foreground agent; edits the user's checkout and uses session checkpoints.
- **Isolated worktree:** background/local parallel agent; gets a dedicated Git worktree and branch.
- **Read-only:** may share the current workspace when the backend can enforce read-only behavior.

### Work

- Add native Git worktree create/list/remove operations.
- Associate each isolated session with repository, base revision, branch, path, and cleanup state.
- Run the agent process and client terminals inside the worktree.
- Surface commits, diff stats, test result artifacts, and current status in the session tab.
- Support:
  - review worktree diff;
  - apply selected files or commits;
  - merge/cherry-pick where safe;
  - open worktree as workspace;
  - discard after explicit confirmation.
- Detect overlapping changes when applying results to the current branch.
- Never automatically delete a worktree containing unreviewed or unmerged work.

### Acceptance criteria

- Two agents can edit the same base repository in parallel without sharing filesystem writes.
- Both results remain independently reviewable after Rocket restarts.
- Applying one result detects conflicts with changes made after the worktree forked.
- Cleanup is explicit, recoverable, and covered by tests.

---

## B4 — Structured context, common tools, MCP, and permission policy

**Outcome:** Composer mentions become real context, every compatible agent receives a common Rocket toolset, and Rocket provides one transparent place to manage external tools and approval policy.

### Attachment model

Introduce structured attachments independent of backend:

- file;
- folder;
- selected code/range;
- symbol;
- current Git diff;
- diagnostics;
- terminal output;
- image;
- URL;
- previous Rocket session summary;
- skill/instruction file.

Each attachment shows its source, size/token estimate where possible, stale state, and whether the active backend accepted it.

### Backend mapping

- ACP: map to text, image, embedded resource, or resource-link content blocks based on negotiated prompt capabilities.
- Native Codex: use native structured input if available; otherwise inject a bounded, explicit textual envelope.
- Never silently claim that an `@file` token attached file contents when it remained plain prompt text.

### Skills and instructions

- Continue discovering `AGENTS.md` and `.agents/skills/*/SKILL.md` conventions supported by the active agent.
- Distinguish agent-native skills from Rocket-injected attachments.
- Avoid inventing one cross-agent skill semantics that ACP does not define.

### Rocket workspace tool service

ACP reports agent tool activity but does not define or standardize model-facing tools. Rocket therefore exposes one editor-owned MCP server with a versioned, canonical core toolset:

- `workspace_read` — read bounded text and return canonical path, content tag, source version, encoding, and line metadata;
- `workspace_list` — list files/directories within granted roots;
- `workspace_search` — exact/regex search with bounded, cancellable results;
- `workspace_edit` — apply a hashline-style patch against one or more required content tags;
- `workspace_write` — create or replace content with an explicit absent-file or preimage-hash condition;
- `workspace_move` and `workspace_delete` — guarded filesystem mutations;
- `workspace_diagnostics` — retrieve current structured LSP diagnostics;
- `workspace_exec` — execute an argv-based command under explicit cwd, environment, timeout, network, and output policy;
- `workspace_diff` — inspect the current session transaction diff;
- `workspace_undo` — restore the previous Rocket-owned mutation transaction.

The first implementation should reuse the useful Lavalamp/hashline behavior, not copy its entire runtime:

- every read mints a content tag tied to exact bytes or the active editor-buffer generation;
- every edit supplies the tag and fails closed when content changed;
- successful mutation returns new content hashes/tags;
- mutation is serialized per workspace or transaction;
- pre-edit state is recorded by the session change tracker/checkpoint service;
- relevant LSP diagnostics are returned after edits and writes;
- paths always pass through the workspace guard.

The tool service is the canonical executor regardless of the agent-visible MCP namespace. Each operation emits an audit receipt containing:

- Rocket session and transaction IDs;
- agent profile and adapter identity/version;
- canonical operation and schema version;
- normalized request digest;
- preimage and postimage hashes;
- resulting diff digest;
- permission decision and policy revision;
- result status and timestamp.

Keep adapter-reported tool identity separate from canonical executor identity. The UI may say “Executed by Rocket Workspace Tools via `<agent-reported-name>`”; it must not relabel an arbitrary native `edit` event as a Rocket tool call.

### Tool enforcement modes

ACP cannot require an agent to use client-provided MCP tools or disable its native tools. Rocket supports two explicit modes:

1. **Portable/review mode — default**
   - pass Rocket Workspace Tools to the agent;
   - allow agent-native tools only inside the current checkpointed workspace for one foreground session, or inside a disposable worktree for parallel/background sessions;
   - independently scan actual filesystem changes instead of trusting ACP tool reports;
   - treat worktree changes as proposals and apply accepted results through Rocket's transaction/checkpoint layer.

2. **Enforced transaction mode — adapter/version specific**
   - mount or expose the authoritative workspace read-only to the agent process;
   - disable native mutation/command tools using tested adapter configuration;
   - grant write authority only to Rocket Workspace Tools;
   - run startup conformance probes after adapter upgrades;
   - fail closed or fall back visibly to portable/review mode if an unmediated mutation path exists.

Do not describe enforced transaction mode as an ACP guarantee. Support is certified for a pinned agent adapter/version through Rocket's compatibility matrix.

### MCP registry

- Manage user and workspace MCP server descriptors.
- Support enable/disable, status, logs, trust confirmation, and secret references.
- Pass compatible stdio/HTTP servers during ACP session setup according to negotiated capabilities.
- Keep server credentials in the Tauri security boundary.
- Explain that the selected agent connects to passed MCP servers; ordinary MCP calls do not travel over ACP.
- Register Rocket Workspace Tools automatically for compatible ACP sessions; users may inspect but not impersonate its reserved server identity.

### Permission policy

- Global defaults: confirm, allow, deny.
- Per-agent and per-workspace overrides.
- Per-tool and command-pattern rules where enough information is available.
- Decisions: allow once, allow always, reject once, reject always.
- “Always” rules are Rocket policy entries; do not assume they transfer to another agent.
- Keep an audit trail of automatic and manual decisions.

### Acceptance criteria

- Attaching a file or image produces a visibly structured prompt and capability-aware fallback.
- One stdio MCP server can be configured, trusted, passed to two compatible ACP agents, disabled, and debugged.
- Two ACP agents can call the same versioned Rocket read/search/hash-edit schemas and produce equivalent canonical audit receipts.
- A stale content tag rejects an edit without modifying the file.
- Portable mode detects native edits that bypass Rocket Workspace Tools and still attributes/reviews the resulting filesystem diff.
- Enforced mode proves through conformance tests that the pinned adapter cannot mutate the authoritative workspace outside Rocket Workspace Tools.
- Automatic permission decisions are inspectable and revocable.
- Paths and environment variables remain confined and redacted.

---

## C0 — Workspace search

**Outcome:** Rocket supports fast project-wide text search and replace without relying on an agent.

### Work

- Use bundled or system `ripgrep` through a constrained Tauri command.
- Respect `.gitignore`, hidden-file settings, binary detection, and result limits.
- Stream results incrementally and support cancellation.
- Group matches by file with line previews.
- Open results at the exact range.
- Add replace preview before writing.
- Reuse search as a Rocket-owned context source for agents where useful.

### Acceptance criteria

- Search remains responsive on a large repository.
- Cancel stops the native process.
- Replace preview distinguishes changed, conflicted, skipped, and failed files.
- All search paths pass through the workspace guard.

---

## C1 — LSP, diagnostics, formatting, and editor intelligence

**Outcome:** Rocket becomes usable for routine coding and gives agents structured compiler/editor feedback.

### Initial languages

Prioritize TypeScript/JavaScript, Rust, Python, and Go based on actual users. Do not claim broad LSP support until each language has an install, launch, and compatibility story.

### Work

- Build a Tauri-side language-server supervisor.
- Add Monaco language-client integration behind a language-neutral boundary.
- Implement:
  - diagnostics;
  - completion;
  - hover;
  - go to definition;
  - references;
  - workspace symbols;
  - rename;
  - code actions;
  - document formatting.
- Add a Problems panel and editor markers.
- Publish diagnostics as structured attachments and agent-verification evidence.
- Add format-on-save and configurable formatter selection.
- Handle crashed servers, restart, logs, and missing executable guidance.

### Acceptance criteria

- Each supported language passes a fixture workspace test for diagnostics, completion, definition, references, rename, and formatting.
- Agent-introduced diagnostics appear in session review.
- Language servers cannot access paths outside granted roots through Rocket-owned file operations.

---

## C2 — Complete Git workflow and central settings

**Outcome:** Users can finish the agent workflow without leaving Rocket for routine repository operations or scattered configuration.

### Git

- Correct ahead/behind calculation.
- Branch create/switch/delete.
- Fetch, pull, and push with explicit remote/auth errors.
- Stash create/list/apply/drop.
- Merge/rebase state visibility.
- Conflict editor or clear external-tool handoff.
- Worktree management integrated with B3.
- Commit generation may use the selected agent but remains an explicit user action.

### Settings

Add one searchable Settings surface for:

- editor and autosave;
- fonts, density, and accessibility;
- terminal profiles;
- Git behavior;
- agent profiles;
- models/config options;
- permissions;
- MCP;
- language servers and formatters;
- privacy, logs, and data retention;
- keybindings.

Keep settings scopes explicit: global, workspace, agent profile, and session.

### Acceptance criteria

- A user can branch, run an isolated agent, review, merge/apply, commit, and push without leaving Rocket.
- Settings reveal where each value came from and which scope it affects.
- Secrets are never rendered back in plaintext after saving.

---

## C3 — Later parity features

These features begin only after the preceding milestones are stable and usage data justifies them:

1. DAP debugger and debug console.
2. Integrated browser or Playwright-based UI verification with screenshots and logs as session artifacts.
3. Remote SSH workspaces.
4. Dev containers.
5. OS notifications for completion, approval, failure, and ready-for-review states.
6. Local background host that keeps agent processes alive after the main window closes.
7. Optional cloud-agent handoff.
8. Human collaboration.
9. Organization policy and managed agent/MCP catalogs.
10. Extension/plugin API.

Each requires a separate design and threat-model review. They are not part of the current definition of done.

---

# Cross-cutting quality requirements

## Testing pyramid

### Unit

- domain-model reducers and event upserts;
- path confinement and symlink cases;
- change ownership and checkpoint restore planning;
- ACP frame parsing, request correlation, and capability gating;
- attachment conversion;
- permission matching;
- Git graph/worktree state.

### Fixture/integration

- recorded native Codex event streams;
- recorded ACP streams from each supported agent;
- malformed JSON, unknown events, duplicate updates, out-of-order tool updates, EOF, and crash;
- session resume/load fallbacks;
- SQLite migration and crash recovery;
- worktree conflict/apply/cleanup;
- LSP server launch and restart.

### End to end

- native Codex: prompt → edit → approval → review → checkpoint restore;
- ACP agent: initialize → auth/config → prompt → tool → permission → review;
- two isolated agents in parallel → review → apply one result;
- restart Rocket → restore sessions and reviews;
- search/LSP/Git daily-driver smoke workflow.

No paid-model E2E test should be the only verification of a protocol feature. Use deterministic fake agents and recorded fixtures in CI.

## Observability

- Structured local logs with component, session, turn, backend, and request IDs.
- User-exportable diagnostics bundle.
- Protocol trace opt-in, redacted by default.
- Process stderr capture with size bounds.
- Metrics for startup time, memory, search latency, agent turn duration, tool duration, approval wait, and failure reason.
- No telemetry upload without explicit opt-in and a documented schema.

## Performance budgets

Establish measured budgets before repeating “lightweight” as a comparative claim:

- cold and warm startup;
- idle RAM with one workspace;
- RAM per agent process;
- time to interactive;
- large-workspace tree and search latency;
- editor input latency during streaming agent activity;
- build chunk sizes and lazy-loading targets.

Large syntax/theme assets and rarely used panels should be loaded on demand.

## Accessibility

- Keyboard-operable resize separators.
- Proper tab, dialog, listbox, menu, and alert semantics.
- Visible editor and terminal pane focus.
- Accessible names for file/folder creation and all icon buttons.
- Announced approval, error, completion, and review states.
- Configurable UI/editor/terminal scale.
- Narrow-window behavior that collapses or overlays side panels instead of crushing the editor.

---

# Release gates

## Gate 1 — Trustworthy Codex editor

Required milestones: A0, A1, checkpoint subset of A2, C0.

Users can safely ask Codex to edit, review exactly what it changed, revert it, search the workspace, and recover from errors.

## Gate 2 — Durable agent workbench

Required milestones: complete A2 and B0.

Sessions, tools, plans, review state, and checkpoints survive restart, and the native Codex path runs behind the common backend boundary.

## Gate 3 — ACP beta

Required milestones: B1 and one profile from B2.

One non-native ACP agent works end to end with capability negotiation, permissions, cancellation, review, persistence, and diagnostics.

## Gate 4 — Multi-agent beta

Required milestones: full B2, B3, and core B4 attachments and Rocket Workspace Tools.

At least two distinct agents can work in isolated worktrees, and their results can be reviewed and applied safely.

## Gate 5 — Daily-driver beta

Required milestones: C1 and core C2.

Rocket has credible language intelligence, diagnostics, formatting, Git workflow, settings, and the agent lifecycle expected of a primary editor.

---

# Immediate execution backlog

Work should begin in this order. Each item should be a reviewable PR or a small sequence of tightly related PRs.

1. **Product-truth patch**
   - wire/remove dead Save;
   - connect or temporarily remove dead agent Review control;
   - hide unavailable models and placeholder commands;
   - add useful agent empty/setup state.

2. **Workspace guard**
   - one Rust path-policy module;
   - apply to filesystem first;
   - then terminal, Git, watcher, and reveal;
   - comprehensive traversal/symlink tests.

3. **Session change tracker**
   - baseline-on-first-touch;
   - create/modify/delete support;
   - independent of Git;
   - deterministic unit tests.

4. **Agent review MVP**
   - wire changed-file control;
   - multi-file diff;
   - revert file/all to session baseline;
   - external-conflict warning.

5. **Checkpoint MVP**
   - pre-turn snapshots;
   - explicit restore;
   - no SQLite dependency required for the first in-session version;
   - persist in the following item.

6. **SQLite session store**
   - schema and migrations;
   - transcript/tool/change/checkpoint persistence;
   - startup restore;
   - retention and crash tests.

7. **Backend contract extraction**
   - introduce runtime-neutral domain types;
   - adapt native Codex without behavior changes;
   - fixture contract tests.

8. **ACP v1 core spike, then production implementation**
   - fake/reference agent first;
   - initialize/new/prompt/update/permission/cancel;
   - protocol trace and crash handling;
   - write a short spike result before selecting SDK versus explicit JSON-RPC implementation.

9. **First ACP profile**
   - choose OpenCode or Gemini CLI for the first native ACP integration based on installation reliability;
   - add Codex ACP and Claude Agent ACP after the generic path is proven.

10. **Workspace search**
    - may proceed in parallel with items 7–9 after the workspace guard lands.

The next planning checkpoint occurs after items 1–6. At that point, validate the data model and review UX before freezing the ACP-facing domain contracts.

---

# Decisions explicitly deferred

- Replacing native Codex app-server with `codex-acp` by default.
- Supporting ACP v2 before it is stable.
- Building a Flue/Lavalamp sidecar.
- Building a proprietary semantic index before LSP and search prove insufficient.
- Rocket-owned provider/model API calls.
- Rocket-owned expert personas or subagent scheduler.
- Cloud agents and accounts.
- Extension marketplace.
- Collaboration and enterprise governance.
- OS keychain migration; revisit before a signed stable release or when platform requirements demand it.

---

# Success measures

Rocket has reached the intended product position when:

1. A user can install Rocket, open a repository, configure a supported agent, and understand its permissions without reading the README.
2. Native Codex plus at least two ACP agents complete real edit/test/review workflows.
3. Every agent change is attributable to a session, reviewable, checkpointed, and safely revertible.
4. Parallel write-capable agents run in separate worktrees.
5. Sessions and review state survive crashes and restarts.
6. Context attachments truthfully show what was sent to the selected agent.
7. Workspace search, LSP diagnostics, formatting, terminal, and Git make Rocket viable for daily editing.
8. Unsupported agent capabilities are hidden or clearly explained.
9. Native filesystem, terminal, and Git operations cannot escape granted roots.
10. Published startup and memory measurements support Rocket's lightweight claim.

The measure of parity is not the number of controls or provider logos. It is whether users can safely delegate work, understand what happened, review the result, recover from mistakes, and continue coding without leaving Rocket.

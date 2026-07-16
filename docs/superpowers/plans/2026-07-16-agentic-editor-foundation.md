# Agentic Editor Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Rocket into a stable desktop code editor with an integrated agent panel, Codex harness support, model-agnostic runtime boundaries, live tool activity, and follow-agent navigation.

**Architecture:** Rocket owns workspace, buffers, review UI, and navigation. A Tauri backend owns process lifecycle and filesystem safety. Harness adapters normalize Codex app-server, ACP agents, and native OpenAI-compatible providers into one event protocol consumed by React.

**Tech Stack:** Tauri 2, React 18, TypeScript, Monaco, Vitest, Rust, Codex app-server JSON-RPC.

## Global Constraints

- Keep editor usable when no agent runtime is installed or configured.
- Do not store API keys in browser local storage.
- Treat project root as filesystem boundary for native tools.
- External harnesses retain their own authentication and model configuration.
- Agent events must be provider-neutral before entering React state.
- Follow-agent navigation must never steal focus while user is typing in editor.
- Every file mutation must produce a reviewable file-change event.

---

### Task 1: Provider-Neutral Agent Protocol

**Files:**
- Create: `src/agent/protocol.ts`
- Create: `src/agent/reducer.ts`
- Test: `src/agent/reducer.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `AgentEvent`, `AgentSessionState`, `agentSessionReducer(state, event)`.

- [ ] Write failing reducer tests for streamed assistant text, tool lifecycle, file touches, approvals, and turn completion.
- [ ] Run `bun test src/agent/reducer.test.ts` and confirm missing-module failure.
- [ ] Implement protocol types and reducer.
- [ ] Run focused tests and confirm pass.

### Task 2: Codex App-Server Adapter

**Files:**
- Create: `src-tauri/src/agent/mod.rs`
- Create: `src-tauri/src/agent/codex.rs`
- Create: `src-tauri/src/agent/protocol.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/Cargo.toml`
- Test: `src-tauri/src/agent/codex.rs`

**Interfaces:**
- Consumes: Codex app-server JSON-RPC over stdio.
- Produces: Tauri `agent-event` events and commands `agent_start_session`, `agent_send`, `agent_interrupt`, `agent_respond_approval`.

- [ ] Write Rust tests for JSON-RPC request construction and Codex notification normalization.
- [ ] Run focused Cargo tests and confirm failure.
- [ ] Implement one long-lived Codex child per workspace with pending request routing.
- [ ] Normalize text, reasoning, command, file-change, approval, error, and completion events.
- [ ] Run focused tests and Cargo check.

### Task 3: Integrated Agent Panel

**Files:**
- Create: `src/components/agent/AgentPanel.tsx`
- Create: `src/components/agent/AgentMessage.tsx`
- Create: `src/components/agent/ToolActivity.tsx`
- Create: `src/components/agent/ApprovalPrompt.tsx`
- Create: `src/provider/AgentContext.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/App.css`
- Test: `src/provider/AgentContext.test.tsx`

**Interfaces:**
- Consumes: normalized `AgentEvent` stream.
- Produces: resizable right panel with chat, provider selector, follow toggle, stop action, approvals, and tool timeline.

- [ ] Write failing state tests for send, queue, interrupt, approval, and reconnect behavior.
- [ ] Implement AgentContext Tauri bridge.
- [ ] Build dense agent panel with stable dimensions and accessible icon controls.
- [ ] Run tests and frontend build.

### Task 4: Follow Agent And Review Navigation

**Files:**
- Create: `src/provider/EditorContext.tsx`
- Create: `src/components/review/ChangeReview.tsx`
- Modify: `src/components/CodeArea.tsx`
- Modify: `src/components/CodeEditor.tsx`
- Modify: `src/provider/SourceContext.tsx`
- Test: `src/agent/follow.test.ts`

**Interfaces:**
- Consumes: `file_touched` and `file_changed` events.
- Produces: editor navigation, inline reveal, changed-file summary, and per-file review entry.

- [ ] Write failing tests for follow enabled, follow disabled, and typing-focus protection.
- [ ] Replace ID-only selection with path-addressable editor actions.
- [ ] Navigate to touched files without moving keyboard focus from active editor input.
- [ ] Add changed-file review surface and event-to-file linking.
- [ ] Run tests and build.

### Task 5: Editor Stability Foundation

**Files:**
- Modify: `src-tauri/src/fs.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/helpers/filesys.ts`
- Modify: `src/components/CodeEditor.tsx`
- Modify: `src/components/Sidebar.tsx`
- Test: `src/helpers/filesys.test.ts`

**Interfaces:**
- Produces: typed filesystem errors, cancellable workspace watcher, conflict-aware buffers, and reliable saves.

- [ ] Write regression tests for path joining, binary errors, stale autosave, and watcher replacement.
- [ ] Replace sentinel strings and Rust panics with typed command results.
- [ ] Remove `static mut`, shell interpolation, and duplicate watcher threads.
- [ ] Make editor models authoritative and expose dirty/save/error state.
- [ ] Run frontend and Rust verification.

### Task 6: Native OpenAI-Compatible Runtime

**Files:**
- Create: `src-tauri/src/agent/openai_compatible.rs`
- Create: `src/components/agent/ProviderSettings.tsx`
- Modify: `src-tauri/src/agent/mod.rs`
- Modify: `src/provider/AgentContext.tsx`
- Test: `src-tauri/src/agent/openai_compatible.rs`

**Interfaces:**
- Consumes: OpenAI-compatible chat/tool endpoints for Ollama, LM Studio, and custom providers.
- Produces: same normalized `AgentEvent` stream as Codex.

- [ ] Write tests for endpoint normalization, streaming event parsing, tool-call assembly, and capability errors.
- [ ] Implement provider discovery for Ollama and LM Studio.
- [ ] Implement native read/search/edit/write/shell tool loop with workspace guards and approvals.
- [ ] Store credentials in OS keychain and non-secret provider metadata in app config.
- [ ] Run focused tests, full tests, builds, and desktop smoke test.

### Task 7: macOS Quick Look Extension

**Files:**
- Create: `src-quicklook/` Xcode extension target
- Create: `src-quicklook/PreviewViewController.swift`
- Create: `src-quicklook/Info.plist`
- Modify: `src-tauri/tauri.conf.json`
- Modify: release/signing workflow files
- Test: Quick Look extension render fixtures for JavaScript, TypeScript, JSX, TSX, JSON, CSS, HTML, and Markdown

**Interfaces:**
- Consumes: Finder-selected source and Markdown files through Quick Look.
- Produces: syntax-highlighted, read-only previews bundled and signed with Rocket on macOS.

- [ ] Define supported UTTypes and extension activation rules.
- [ ] Build a native Quick Look preview controller with bounded file reads and encoding detection.
- [ ] Render code with Rocket-compatible syntax colors and Markdown with safe local HTML.
- [ ] Bundle the extension inside Rocket, configure signing/entitlements, and validate with `qlmanage`.
- [ ] Verify install, refresh, preview, uninstall, and app-update behavior on a signed macOS build.

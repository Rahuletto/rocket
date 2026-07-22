# Agent Composer References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver reliable slash commands, native file mentions, thread transcript mentions, and native skill invocation in Rocket.

**Architecture:** Keep composer tokens visible, resolve file and skill references at the Rust trust boundary, and serialize resolved references as Codex app-server `mention` and `skill` inputs. Keep thread transcript expansion in renderer state and slash commands in the host.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, Codex app-server JSON-RPC.

## Global Constraints

- Preserve the existing Rust-side `codex app-server --stdio` runtime.
- Preserve unrelated dirty-worktree changes.
- Reject file paths escaping the active workspace.
- Advertise only implemented slash commands.
- Verify all four composer syntaxes in the native application.

---

### Task 1: Native agent input contract

**Files:**
- Modify: `src-tauri/src/agent/protocol.rs`
- Test: `src-tauri/src/agent/protocol.rs`

**Interfaces:**
- Produces: `AgentInputReference::{Mention, Skill}` and `turn_start_request(id, thread_id, prompt, references)`.
- Consumes: resolved display names and absolute paths from Task 2.

- [ ] **Step 1: Write failing serialization tests**

Add tests asserting a turn contains text plus exact native objects:

```rust
json!({ "type": "mention", "name": "src/App.tsx", "path": "/workspace/src/App.tsx" })
json!({ "type": "skill", "name": "review", "path": "/workspace/.agents/skills/review/SKILL.md" })
```

- [ ] **Step 2: Run test and verify RED**

Run: `cargo test agent::protocol::tests::turn_start_serializes_native_references`

Expected: compile failure or assertion failure since reference input does not exist.

- [ ] **Step 3: Implement minimal protocol types and serialization**

Define:

```rust
pub enum AgentInputReference {
    Mention { name: String, path: String },
    Skill { name: String, path: String },
}
```

Append one JSON object per reference after the text input.

- [ ] **Step 4: Run protocol tests and verify GREEN**

Run: `cargo test agent::protocol::tests`

Expected: all protocol tests pass.

### Task 2: Safe reference resolution

**Files:**
- Create: `src-tauri/src/agent/references.rs`
- Modify: `src-tauri/src/agent/mod.rs`
- Test: `src-tauri/src/agent/references.rs`

**Interfaces:**
- Produces: `resolve_prompt_references(workspace: &Path, prompt: &str) -> Result<Vec<AgentInputReference>, String>`.
- Produces: `SkillEntry { name: String, path: String }` for completion.
- Consumes: protocol reference types from Task 1.

- [ ] **Step 1: Write failing resolver tests**

Cover valid `@src/App.tsx`, duplicate mentions, `../` escape rejection, valid `#review`, missing skill rejection, and punctuation-free ordinary prose.

- [ ] **Step 2: Run test and verify RED**

Run: `cargo test agent::references::tests`

Expected: compile failure since resolver module does not exist.

- [ ] **Step 3: Implement parser and canonical resolver**

Tokenize on whitespace, trim safe trailing punctuation, canonicalize files, verify `path.starts_with(workspace)`, resolve skills from the two documented roots, and deduplicate while preserving first occurrence.

- [ ] **Step 4: Return structured skill discovery entries**

Change `agent_list_skills` to return:

```rust
pub struct SkillEntry {
    pub name: String,
    pub path: String,
}
```

- [ ] **Step 5: Run resolver tests and verify GREEN**

Run: `cargo test agent::references::tests`

Expected: all reference tests pass.

### Task 3: Send resolved inputs to Codex

**Files:**
- Modify: `src-tauri/src/agent/codex.rs`
- Modify: `src-tauri/src/agent/mod.rs`
- Test: `src-tauri/src/agent/protocol.rs`

**Interfaces:**
- Consumes: `resolve_prompt_references` and `turn_start_request(..., references)`.
- Preserves: renderer `agent_send({ sessionId, prompt })` command signature.

- [ ] **Step 1: Write failing integration-shaped unit test**

Assert `CodexProcess` request construction passes resolved references into `turn/start` without altering prompt text.

- [ ] **Step 2: Run test and verify RED**

Run: `cargo test agent::`

Expected: assertion failure until send pipeline accepts references.

- [ ] **Step 3: Implement send boundary**

Store canonical workspace in `CodexProcess`, resolve prompt references before sending, and return resolver errors through existing renderer error routing.

- [ ] **Step 4: Run Rust suite and verify GREEN**

Run: `cargo test`

Expected: all Rust tests pass.

### Task 4: Structured skill completion

**Files:**
- Modify: `src/agent/discover.ts`
- Modify: `src/agent/composer/completion.ts`
- Modify: `src/components/agent/AgentPanel.tsx`
- Test: `src/agent/composer/completion.test.ts`

**Interfaces:**
- Consumes: `SkillEntry { name: string; path: string }` from `agent_list_skills`.
- Produces: `#name` completion labels and inserts.

- [ ] **Step 1: Write failing completion test**

Pass structured skill entries and assert fuzzy lookup searches `name`, displays `#name`, and inserts `#name `.

- [ ] **Step 2: Run test and verify RED**

Run: `bun test src/agent/composer/completion.test.ts`

Expected: type or assertion failure while skills remain `string[]`.

- [ ] **Step 3: Implement structured completion data**

Add the shared `SkillEntry` type, update discovery invoke typing, and map skill names in completion without exposing absolute paths in UI.

- [ ] **Step 4: Run completion tests and verify GREEN**

Run: `bun test src/agent/composer/completion.test.ts`

Expected: all completion tests pass.

### Task 5: Slash-command correctness

**Files:**
- Modify: `src/agent/slash/commands.ts`
- Modify: `src/provider/AgentContext.tsx`
- Test: `src/agent/slash/commands.test.ts`

**Interfaces:**
- Produces: registry metadata describing argument policy.
- Consumes: existing host handlers.

- [ ] **Step 1: Write failing command-contract tests**

Assert no-argument commands reject arguments, `/model` accepts at most one model identifier, unknown commands show help, and every advertised command has a handler.

- [ ] **Step 2: Run test and verify RED**

Run: `bun test src/agent/slash/commands.test.ts`

Expected: failure while registry lacks argument policy.

- [ ] **Step 3: Implement command validation**

Add `argument: "none" | "optional"` metadata plus a pure validator used before handler dispatch. Return precise host notes for invalid usage.

- [ ] **Step 4: Run slash tests and verify GREEN**

Run: `bun test src/agent/slash/commands.test.ts`

Expected: all slash tests pass.

### Task 6: Full verification and native smoke

**Files:**
- Modify only if a verified regression requires a test-first fix.

**Interfaces:**
- Verifies all prior tasks as one end-to-end experience.

- [ ] **Step 1: Run focused and full automated checks**

Run:

```bash
bun test
bun run build
cd src-tauri && cargo test
git diff --check
```

Expected: all pass with no new warnings attributable to this change.

- [ ] **Step 2: Run native Computer Use smoke**

Verify completion keyboard selection and agent understanding for:

```text
/help
@src/App.tsx summarize exported component responsibilities
$<thread-id> report the prior thread conclusion
#<workspace-skill> follow this skill and report its name
```

- [ ] **Step 3: Verify real edit refresh**

Ask agent to edit a disposable workspace file through `@file`, confirm disk and Monaco update, then remove disposable file.

- [ ] **Step 4: Audit exact objective**

Record direct evidence for slash commands, file mentions, thread mentions, skills, and agent understanding. Do not claim completion if any native smoke remains unproven.

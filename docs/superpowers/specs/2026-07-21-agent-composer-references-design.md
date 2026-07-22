# Agent Composer References Design

## Goal

Make Rocket composer syntax reliable end-to-end:

- `/command` invokes implemented Rocket host behavior.
- `@path` reaches Codex as a native file mention.
- `$thread-id` contributes bounded transcript context.
- `#skill` reaches Codex as a native skill reference to its `SKILL.md`.

## Architecture

The visible composer text remains readable and editable. Rocket resolves explicit `@` and `#` tokens in the Rust agent boundary, where workspace and skill paths can be canonicalized safely. The Codex protocol then sends one text input plus native `mention` and `skill` input items. Thread references remain renderer-owned since renderer state owns agent tabs and transcripts.

Slash commands remain host-owned. Completion advertises only commands with working handlers. Commands reject unsupported arguments with useful feedback instead of silently ignoring them.

## Resolution Rules

- Only explicit whitespace-delimited `@path` and `#name` tokens resolve.
- File mentions resolve relative to active workspace and must canonicalize inside workspace.
- Skill names resolve only to directories containing `SKILL.md` in supported workspace skill roots.
- Duplicate references produce one native input item.
- Missing or escaping references return a visible send error. They never silently degrade to raw text.
- The original prompt text remains unchanged, so the user and agent can refer to the visible token.
- Thread attachments stay bounded to five threads, forty messages per thread, and 12,000 characters per transcript.

## Supported Skill Roots

Rocket discovers workspace-local skills from:

1. `<workspace>/.agents/skills`
2. `<workspace>/../.agents/skills`

The discovery command returns both display name and canonical `SKILL.md` path. The same resolver owns send-time validation, preventing completion and execution from drifting.

## Verification

Automated tests cover token parsing, deduplication, path confinement, missing references, native Codex serialization, thread transcript injection, slash parsing, and command argument behavior. Native Computer Use smoke covers completion selection plus real agent understanding for `/`, `@`, `$`, and `#`.

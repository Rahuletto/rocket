use serde::Serialize;
use serde_json::{json, Value};

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum AgentEvent {
    SessionReady {
        runtime: &'static str,
    },
    TurnStarted {
        turn_id: String,
    },
    MessageDelta {
        message_id: String,
        text: String,
    },
    ReasoningDelta {
        text: String,
    },
    ToolStarted {
        tool: AgentTool,
    },
    ToolOutput {
        tool_id: String,
        output: String,
    },
    ToolCompleted {
        tool_id: String,
        status: &'static str,
    },
    FileChanged {
        path: String,
        additions: usize,
        deletions: usize,
        tool_id: Option<String>,
    },
    ApprovalRequested {
        approval: AgentApproval,
    },
    ApprovalResolved {
        approval_id: String,
    },
    TurnCompleted {
        turn_id: String,
    },
    Error {
        message: String,
    },
}

#[derive(Clone, Debug, Serialize)]
pub struct AgentTool {
    pub id: String,
    pub kind: &'static str,
    pub label: String,
    pub path: Option<String>,
    pub status: &'static str,
}

#[derive(Clone, Debug, Serialize)]
pub struct AgentApproval {
    pub id: String,
    pub kind: &'static str,
    pub description: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AgentInputReference {
    Mention { name: String, path: String },
    Skill { name: String, path: String },
}

fn request_id(value: &Value) -> String {
    value
        .get("id")
        .map(Value::to_string)
        .unwrap_or_else(|| "null".to_string())
}

fn diff_counts(diff: &str) -> (usize, usize) {
    diff.lines().fold((0, 0), |(additions, deletions), line| {
        if line.starts_with('+') && !line.starts_with("+++") {
            (additions + 1, deletions)
        } else if line.starts_with('-') && !line.starts_with("---") {
            (additions, deletions + 1)
        } else {
            (additions, deletions)
        }
    })
}

fn file_change_events(item: &Value, tool_id: &str) -> Vec<AgentEvent> {
    item.get("changes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|change| {
            let path = change.get("path").and_then(Value::as_str)?;
            let (additions, deletions) =
                diff_counts(change.get("diff").and_then(Value::as_str).unwrap_or(""));
            Some(AgentEvent::FileChanged {
                additions,
                deletions,
                path: path.to_string(),
                tool_id: Some(tool_id.to_string()),
            })
        })
        .collect()
}

fn item_started(params: &Value) -> Vec<AgentEvent> {
    let Some(item) = params.get("item") else {
        return Vec::new();
    };
    let Some(item_type) = item.get("type").and_then(Value::as_str) else {
        return Vec::new();
    };
    let id = item
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("tool")
        .to_string();

    match item_type {
        "commandExecution" => vec![AgentEvent::ToolStarted {
            tool: AgentTool {
                id,
                kind: "command",
                label: item
                    .get("command")
                    .and_then(Value::as_str)
                    .unwrap_or("Command")
                    .to_string(),
                path: item.get("cwd").and_then(Value::as_str).map(str::to_string),
                status: "running",
            },
        }],
        "fileChange" => {
            let mut events = vec![AgentEvent::ToolStarted {
                tool: AgentTool {
                    id: id.clone(),
                    kind: "file",
                    label: "Edit files".to_string(),
                    path: None,
                    status: "running",
                },
            }];
            events.extend(file_change_events(item, &id));
            events
        }
        "mcpToolCall" | "dynamicToolCall" => vec![AgentEvent::ToolStarted {
            tool: AgentTool {
                id,
                kind: "tool",
                label: item
                    .get("tool")
                    .and_then(Value::as_str)
                    .unwrap_or("Tool")
                    .to_string(),
                path: None,
                status: "running",
            },
        }],
        "webSearch" => vec![AgentEvent::ToolStarted {
            tool: AgentTool {
                id,
                kind: "search",
                label: "Web search".to_string(),
                path: None,
                status: "running",
            },
        }],
        _ => Vec::new(),
    }
}

fn item_completed(params: &Value) -> Vec<AgentEvent> {
    let Some(item) = params.get("item") else {
        return Vec::new();
    };
    let Some(item_type) = item.get("type").and_then(Value::as_str) else {
        return Vec::new();
    };
    let Some(id) = item.get("id").and_then(Value::as_str) else {
        return Vec::new();
    };

    match item_type {
        "commandExecution" | "mcpToolCall" | "dynamicToolCall" => {
            let failed = matches!(
                item.get("status").and_then(Value::as_str),
                Some("failed" | "declined")
            );
            vec![AgentEvent::ToolCompleted {
                status: if failed { "failed" } else { "completed" },
                tool_id: id.to_string(),
            }]
        }
        "fileChange" => {
            let failed = matches!(
                item.get("status").and_then(Value::as_str),
                Some("failed" | "declined")
            );
            let mut events = if failed {
                Vec::new()
            } else {
                file_change_events(item, id)
            };
            events.push(AgentEvent::ToolCompleted {
                status: if failed { "failed" } else { "completed" },
                tool_id: id.to_string(),
            });
            events
        }
        _ => Vec::new(),
    }
}

pub fn normalize_codex_message(value: &Value) -> Vec<AgentEvent> {
    let Some(method) = value.get("method").and_then(Value::as_str) else {
        return Vec::new();
    };
    let params = value.get("params").unwrap_or(&Value::Null);

    match method {
        "thread/started" => params
            .pointer("/thread/id")
            .and_then(Value::as_str)
            .map(|_| vec![AgentEvent::SessionReady { runtime: "codex" }])
            .unwrap_or_default(),
        "turn/started" => params
            .pointer("/turn/id")
            .and_then(Value::as_str)
            .map(|id| {
                vec![AgentEvent::TurnStarted {
                    turn_id: id.to_string(),
                }]
            })
            .unwrap_or_default(),
        "item/agentMessage/delta" => vec![AgentEvent::MessageDelta {
            message_id: params
                .get("itemId")
                .and_then(Value::as_str)
                .unwrap_or("assistant")
                .to_string(),
            text: params
                .get("delta")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        }],
        "item/reasoning/summaryTextDelta" => vec![AgentEvent::ReasoningDelta {
            text: params
                .get("delta")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        }],
        "item/started" => item_started(params),
        "item/completed" => item_completed(params),
        "item/commandExecution/outputDelta" => vec![AgentEvent::ToolOutput {
            tool_id: params
                .get("itemId")
                .and_then(Value::as_str)
                .unwrap_or("command")
                .to_string(),
            output: params
                .get("delta")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        }],
        "item/fileChange/patchUpdated" => {
            let tool_id = params
                .get("itemId")
                .and_then(Value::as_str)
                .map(str::to_string);
            params
                .get("changes")
                .and_then(Value::as_array)
                .map(|changes| {
                    changes
                        .iter()
                        .filter_map(|change| {
                            let path = change.get("path")?.as_str()?;
                            let (additions, deletions) = diff_counts(
                                change.get("diff").and_then(Value::as_str).unwrap_or(""),
                            );
                            Some(AgentEvent::FileChanged {
                                additions,
                                deletions,
                                path: path.to_string(),
                                tool_id: tool_id.clone(),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default()
        }
        "item/commandExecution/requestApproval" => {
            let description = params
                .get("command")
                .and_then(Value::as_str)
                .or_else(|| params.get("reason").and_then(Value::as_str))
                .unwrap_or("Allow command");
            vec![AgentEvent::ApprovalRequested {
                approval: AgentApproval {
                    description: description.to_string(),
                    id: request_id(value),
                    kind: "command",
                },
            }]
        }
        "item/fileChange/requestApproval" => vec![AgentEvent::ApprovalRequested {
            approval: AgentApproval {
                description: params
                    .get("reason")
                    .and_then(Value::as_str)
                    .unwrap_or("Allow file changes")
                    .to_string(),
                id: request_id(value),
                kind: "file",
            },
        }],
        "serverRequest/resolved" => vec![AgentEvent::ApprovalResolved {
            approval_id: params
                .get("requestId")
                .map(Value::to_string)
                .unwrap_or_else(|| "null".to_string()),
        }],
        "turn/completed" => params
            .pointer("/turn/id")
            .and_then(Value::as_str)
            .map(|id| {
                vec![AgentEvent::TurnCompleted {
                    turn_id: id.to_string(),
                }]
            })
            .unwrap_or_default(),
        "error" => vec![AgentEvent::Error {
            message: params
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| params.pointer("/error/message").and_then(Value::as_str))
                .unwrap_or("Codex app-server error")
                .to_string(),
        }],
        _ => Vec::new(),
    }
}

pub fn initialize_request(id: u64) -> Value {
    json!({
        "id": id,
        "method": "initialize",
        "params": {
            "clientInfo": {
                "name": "rocket",
                "title": "Rocket",
                "version": env!("CARGO_PKG_VERSION")
            },
            "capabilities": {
                "experimentalApi": true
            }
        }
    })
}

pub fn thread_start_request(id: u64, workspace: &str, model: Option<&str>) -> Value {
    let mut params = json!({
        "approvalPolicy": "on-request",
        "cwd": workspace,
        "sandbox": "workspace-write"
    });
    if let Some(model) = model {
        params["model"] = Value::String(model.to_string());
    }
    json!({ "id": id, "method": "thread/start", "params": params })
}

pub fn skills_list_request(id: u64, workspace: &str, force_reload: bool) -> Value {
    json!({
        "id": id,
        "method": "skills/list",
        "params": {
            "cwds": [workspace],
            "forceReload": force_reload
        }
    })
}

pub fn turn_start_request(
    id: u64,
    thread_id: &str,
    prompt: &str,
    references: &[AgentInputReference],
) -> Value {
    let mut input = vec![json!({
        "type": "text",
        "text": prompt,
        "text_elements": []
    })];
    input.extend(
        references
            .iter()
            .map(|reference| serde_json::to_value(reference).expect("agent input serializes")),
    );
    json!({
        "id": id,
        "method": "turn/start",
        "params": {
            "threadId": thread_id,
            "input": input
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_renderer_fields_as_camel_case() {
        let turn = serde_json::to_value(AgentEvent::TurnStarted {
            turn_id: "turn-1".to_string(),
        })
        .unwrap();
        let message = serde_json::to_value(AgentEvent::MessageDelta {
            message_id: "message-1".to_string(),
            text: "hello".to_string(),
        })
        .unwrap();

        assert_eq!(turn["turnId"], "turn-1");
        assert!(turn.get("turn_id").is_none());
        assert_eq!(message["messageId"], "message-1");
        assert!(message.get("message_id").is_none());
    }

    #[test]
    fn builds_workspace_scoped_thread_request() {
        let request = thread_start_request(2, "/tmp/project", Some("gpt-5"));

        assert_eq!(request["method"], "thread/start");
        assert_eq!(request["params"]["cwd"], "/tmp/project");
        assert_eq!(request["params"]["sandbox"], "workspace-write");
        assert_eq!(request["params"]["model"], "gpt-5");
    }

    #[test]
    fn turn_start_serializes_native_references() {
        let request = turn_start_request(
            3,
            "thread-1",
            "Review @src/App.tsx with #review",
            &[
                AgentInputReference::Mention {
                    name: "src/App.tsx".to_string(),
                    path: "/workspace/src/App.tsx".to_string(),
                },
                AgentInputReference::Skill {
                    name: "review".to_string(),
                    path: "/workspace/.agents/skills/review/SKILL.md".to_string(),
                },
            ],
        );

        assert_eq!(request["params"]["input"][0]["type"], "text");
        assert_eq!(
            request["params"]["input"][0]["text"],
            "Review @src/App.tsx with #review"
        );
        assert_eq!(
            request["params"]["input"][1],
            json!({
                "type": "mention",
                "name": "src/App.tsx",
                "path": "/workspace/src/App.tsx"
            })
        );
        assert_eq!(
            request["params"]["input"][2],
            json!({
                "type": "skill",
                "name": "review",
                "path": "/workspace/.agents/skills/review/SKILL.md"
            })
        );
    }

    #[test]
    fn builds_workspace_scoped_skills_list_request() {
        let request = skills_list_request(4, "/workspace", true);

        assert_eq!(request["method"], "skills/list");
        assert_eq!(request["params"]["cwds"], json!(["/workspace"]));
        assert_eq!(request["params"]["forceReload"], true);
    }

    #[test]
    fn normalizes_streaming_message_delta() {
        let events = normalize_codex_message(&json!({
            "method": "item/agentMessage/delta",
            "params": {
                "itemId": "message-1",
                "delta": "Hello"
            }
        }));

        assert!(matches!(
            events.as_slice(),
            [AgentEvent::MessageDelta { message_id, text }]
                if message_id == "message-1" && text == "Hello"
        ));
    }

    #[test]
    fn normalizes_file_change_counts() {
        let events = normalize_codex_message(&json!({
            "method": "item/started",
            "params": {
                "item": {
                    "type": "fileChange",
                    "id": "edit-1",
                    "changes": [{
                        "path": "/tmp/project/src/main.ts",
                        "diff": "--- a/src/main.ts\n+++ b/src/main.ts\n-old\n+new\n+next"
                    }]
                }
            }
        }));

        assert!(matches!(
            events.get(1),
            Some(AgentEvent::FileChanged {
                path,
                additions: 2,
                deletions: 1,
                ..
            }) if path == "/tmp/project/src/main.ts"
        ));
    }

    #[test]
    fn re_emits_file_change_after_edit_completes() {
        let events = normalize_codex_message(&json!({
            "method": "item/completed",
            "params": {
                "item": {
                    "type": "fileChange",
                    "id": "edit-1",
                    "status": "completed",
                    "changes": [{
                        "path": "agent-smoke.txt",
                        "diff": "--- a/agent-smoke.txt\n+++ b/agent-smoke.txt\n-status=before\n+status=after"
                    }]
                }
            }
        }));

        assert!(matches!(
            events.first(),
            Some(AgentEvent::FileChanged { path, .. }) if path == "agent-smoke.txt"
        ));
        assert!(matches!(
            events.last(),
            Some(AgentEvent::ToolCompleted { status, tool_id })
                if *status == "completed" && tool_id == "edit-1"
        ));
    }

    #[test]
    fn normalizes_current_nested_error_notification() {
        let events = normalize_codex_message(&json!({
            "method": "error",
            "params": {
                "error": {
                    "message": "Model gpt-5 is not available"
                },
                "threadId": "thread-1",
                "turnId": "turn-1",
                "willRetry": false
            }
        }));

        assert!(matches!(
            events.as_slice(),
            [AgentEvent::Error { message }] if message == "Model gpt-5 is not available"
        ));
    }
}

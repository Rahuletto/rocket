use super::protocol::AgentInputReference;
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEntry {
    pub description: String,
    pub name: String,
    pub path: String,
}

fn clean_token(value: &str) -> &str {
    value.trim_end_matches([',', '.', ';', '!', '?', ')', ']', '}'])
}

fn reference_tokens(prompt: &str) -> Vec<(char, String)> {
    let mut tokens = Vec::new();
    let mut index = 0;
    let mut boundary = true;

    while index < prompt.len() {
        let tail = &prompt[index..];
        let character = tail.chars().next().expect("index is a char boundary");
        if boundary && matches!(character, '@' | '#') {
            if character == '@' && tail.starts_with("@{") {
                if let Some(end) = tail[2..].find('}') {
                    let value = &tail[2..2 + end];
                    if !value.is_empty() {
                        tokens.push(('@', value.to_string()));
                    }
                    index += 2 + end + 1;
                    boundary = false;
                    continue;
                }
            }

            let value_start = index + character.len_utf8();
            let value_tail = &prompt[value_start..];
            let value_end = value_tail
                .find(char::is_whitespace)
                .unwrap_or(value_tail.len());
            let value = clean_token(&value_tail[..value_end]);
            if !value.is_empty() {
                tokens.push((character, value.to_string()));
            }
            index = value_start + value_end;
            boundary = false;
            continue;
        }

        boundary = character.is_whitespace();
        index += character.len_utf8();
    }

    tokens
}

pub fn resolve_prompt_references(
    workspace: &Path,
    prompt: &str,
    skills: &[SkillEntry],
) -> Result<Vec<AgentInputReference>, String> {
    let workspace = workspace
        .canonicalize()
        .map_err(|error| format!("Cannot resolve workspace: {error}"))?;
    let mut references = Vec::new();
    let mut seen = HashSet::new();

    for (kind, token) in reference_tokens(prompt) {
        if kind == '@' {
            let raw_path = token.as_str();
            let candidate = workspace.join(raw_path);
            let path = candidate
                .canonicalize()
                .map_err(|_| format!("File mention not found: @{raw_path}"))?;
            if !path.starts_with(&workspace) {
                return Err(format!(
                    "File mention points outside the workspace: @{raw_path}"
                ));
            }
            if !path.is_file() {
                return Err(format!("File mention is not a file: @{raw_path}"));
            }
            let path = path.to_string_lossy().into_owned();
            if seen.insert(format!("mention:{path}")) {
                references.push(AgentInputReference::Mention {
                    name: raw_path.to_string(),
                    path,
                });
            }
        } else {
            let name = token.as_str();
            let skill = skills
                .iter()
                .find(|skill| skill.name == name)
                .ok_or_else(|| format!("Skill not found: #{name}"))?;
            let path = Path::new(&skill.path)
                .canonicalize()
                .map_err(|_| format!("Skill file not found: #{name}"))?;
            if !path.is_file()
                || path.file_name().and_then(|value| value.to_str()) != Some("SKILL.md")
            {
                return Err(format!("Invalid skill entry: #{name}"));
            }
            let path = path.to_string_lossy().into_owned();
            if seen.insert(format!("skill:{path}")) {
                references.push(AgentInputReference::Skill {
                    name: name.to_string(),
                    path,
                });
            }
        }
    }

    Ok(references)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_workspace() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "rocket-agent-references-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(
            root.join("src/App.tsx"),
            "export default function App() {}\n",
        )
        .unwrap();
        root
    }

    #[test]
    fn resolves_file_and_skill_tokens_in_first_occurrence_order() {
        let workspace = temp_workspace();
        let skill_path = workspace.join("review/SKILL.md");
        fs::create_dir_all(skill_path.parent().unwrap()).unwrap();
        fs::write(&skill_path, "# Review\n").unwrap();
        let skills = vec![SkillEntry {
            description: "Review code".to_string(),
            name: "review".to_string(),
            path: skill_path.to_string_lossy().into_owned(),
        }];

        let references = resolve_prompt_references(
            &workspace,
            "Review @src/App.tsx with #review and @src/App.tsx.",
            &skills,
        )
        .unwrap();

        assert_eq!(references.len(), 2);
        assert!(matches!(
            &references[0],
            AgentInputReference::Mention { name, path }
                if name == "src/App.tsx" && path.ends_with("/src/App.tsx")
        ));
        assert!(matches!(
            &references[1],
            AgentInputReference::Skill { name, path }
                if name == "review" && path.ends_with("/review/SKILL.md")
        ));

        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn rejects_file_mentions_outside_workspace() {
        let workspace = temp_workspace();
        let outside = workspace
            .parent()
            .unwrap()
            .join(format!("rocket-outside-reference-{}", std::process::id()));
        fs::write(&outside, "outside\n").unwrap();

        let error = resolve_prompt_references(
            &workspace,
            &format!(
                "Inspect @../{}",
                outside.file_name().unwrap().to_string_lossy()
            ),
            &[],
        )
        .unwrap_err();

        assert!(error.contains("outside the workspace"));
        fs::remove_file(outside).unwrap();
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn resolves_braced_file_mentions_containing_spaces() {
        let workspace = temp_workspace();
        fs::create_dir_all(workspace.join("docs")).unwrap();
        fs::write(workspace.join("docs/My Guide.md"), "# Guide\n").unwrap();

        let references =
            resolve_prompt_references(&workspace, "Summarize @{docs/My Guide.md}", &[]).unwrap();

        assert!(matches!(
            references.as_slice(),
            [AgentInputReference::Mention { name, path }]
                if name == "docs/My Guide.md" && path.ends_with("/docs/My Guide.md")
        ));
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn reports_missing_explicit_references() {
        let workspace = temp_workspace();

        let file_error =
            resolve_prompt_references(&workspace, "Read @src/missing.ts", &[]).unwrap_err();
        let skill_error = resolve_prompt_references(&workspace, "Use #missing", &[]).unwrap_err();

        assert!(file_error.contains("File mention not found"));
        assert!(skill_error.contains("Skill not found"));
        fs::remove_dir_all(workspace).unwrap();
    }

    #[test]
    fn ignores_email_addresses_and_markdown_headings() {
        let workspace = temp_workspace();

        let references = resolve_prompt_references(
            &workspace,
            "Email dev@example.com.\n# Heading\nordinary prose",
            &[],
        )
        .unwrap();

        assert!(references.is_empty());
        fs::remove_dir_all(workspace).unwrap();
    }
}

use serde::Serialize;
use std::process::Command;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfile {
    id: String,
    display_name: String,
    icon: String,
    backend_kind: String,
    command: String,
    args: Vec<String>,
    env_allowlist: Vec<String>,
    version_arg: Option<String>,
    installation_source: String,
    update_strategy: String,
    known_notes: Vec<String>,
    experimental: bool,
}

fn built_in_profiles() -> Vec<AgentProfile> {
    vec![AgentProfile {
        id: "codex-native".to_string(),
        display_name: "Codex".to_string(),
        icon: "bot".to_string(),
        backend_kind: "codex-app-server".to_string(),
        command: "codex".to_string(),
        args: vec!["app-server".to_string(), "--stdio".to_string()],
        env_allowlist: vec!["PATH".to_string(), "HOME".to_string(), "TMPDIR".to_string()],
        version_arg: Some("--version".to_string()),
        installation_source: "Codex CLI".to_string(),
        update_strategy: "managed externally".to_string(),
        known_notes: vec![
            "Native Rocket integration with full streaming and approvals.".to_string(),
        ],
        experimental: false,
    }]
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileProbe {
    found: bool,
    executable: Option<String>,
    version: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub fn agent_profiles() -> Vec<AgentProfile> {
    built_in_profiles()
}

#[tauri::command]
pub fn agent_probe_profile(profile_id: String) -> Result<ProfileProbe, String> {
    if profile_id != "codex-native" {
        return Err(format!(
            "Unknown or unavailable agent profile: {profile_id}"
        ));
    }
    match Command::new("codex").arg("--version").output() {
        Ok(output) if output.status.success() => Ok(ProfileProbe {
            found: true,
            executable: Some("codex".to_string()),
            version: Some(String::from_utf8_lossy(&output.stdout).trim().to_string()),
            error: None,
        }),
        Ok(output) => Ok(ProfileProbe {
            found: false,
            executable: Some("codex".to_string()),
            version: None,
            error: Some(String::from_utf8_lossy(&output.stderr).trim().to_string()),
        }),
        Err(error) => Ok(ProfileProbe {
            found: false,
            executable: None,
            version: None,
            error: Some(format!("Codex CLI not found: {error}")),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_only_the_supported_native_codex_profile() {
        let profiles = built_in_profiles();

        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].id, "codex-native");
        assert_eq!(profiles[0].backend_kind, "codex-app-server");
        assert!(!profiles[0].experimental);
    }
}

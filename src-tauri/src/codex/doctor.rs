use serde_json::{json, Value};
use std::io::ErrorKind;
use std::time::Duration;
use tokio::time::timeout;

use crate::backend::app_server::{
    build_codex_path_env, check_cli_binary, check_codex_installation, get_cli_debug_info,
    probe_codex_app_server, resolve_codex_launch_context,
};
use crate::types::AppSettings;

async fn probe_node_runtime(path_env: Option<&String>) -> (bool, Option<String>, Option<String>) {
    let mut node_command = crate::utils::async_command("node");
    if let Some(path_env) = path_env {
        node_command.env("PATH", path_env);
    }
    node_command.arg("--version");
    node_command.stdout(std::process::Stdio::piped());
    node_command.stderr(std::process::Stdio::piped());
    match timeout(Duration::from_secs(5), node_command.output()).await {
        Ok(result) => match result {
            Ok(output) => {
                if output.status.success() {
                    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    (
                        !version.is_empty(),
                        if version.is_empty() {
                            None
                        } else {
                            Some(version)
                        },
                        None,
                    )
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let detail = if stderr.trim().is_empty() {
                        stdout.trim()
                    } else {
                        stderr.trim()
                    };
                    (
                        false,
                        None,
                        Some(if detail.is_empty() {
                            "Node failed to start.".to_string()
                        } else {
                            detail.to_string()
                        }),
                    )
                }
            }
            Err(err) => {
                if err.kind() == ErrorKind::NotFound {
                    (false, None, Some("Node not found on PATH.".to_string()))
                } else {
                    (false, None, Some(err.to_string()))
                }
            }
        },
        Err(_) => (
            false,
            None,
            Some("Timed out while checking Node.".to_string()),
        ),
    }
}

pub(crate) async fn run_codex_doctor_with_settings(
    codex_bin: Option<String>,
    codex_args: Option<String>,
    settings: &AppSettings,
) -> Result<Value, String> {
    let default_bin = settings.codex_bin.clone();
    let default_args = settings.codex_args.clone();
    let resolved = codex_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_bin);
    let resolved_args = codex_args
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_args);
    let path_env = build_codex_path_env(resolved.as_deref());

    let debug_info = get_cli_debug_info(resolved.as_deref());
    let version_result = check_codex_installation(resolved.clone()).await;
    let (version, cli_error) = match version_result {
        Ok(v) => (v, None),
        Err(e) => (None, Some(e)),
    };

    let launch_context = resolve_codex_launch_context(resolved.as_deref());
    let probe_status = if version.is_some() {
        Some(probe_codex_app_server(resolved.clone(), resolved_args.as_deref()).await?)
    } else {
        None
    };
    let app_server_ok = probe_status
        .as_ref()
        .map(|status| status.ok)
        .unwrap_or(false);

    let (node_ok, node_version, node_details) = probe_node_runtime(path_env.as_ref()).await;

    let details = if let Some(ref err) = cli_error {
        Some(err.clone())
    } else if let Some(status) = probe_status.as_ref() {
        if status.ok {
            None
        } else {
            status
                .details
                .clone()
                .or_else(|| Some("Failed to run `codex app-server --help`.".to_string()))
        }
    } else {
        None
    };

    Ok(json!({
        "ok": version.is_some() && app_server_ok,
        "codexBin": resolved,
        "version": version,
        "appServerOk": app_server_ok,
        "details": details,
        "path": path_env,
        "nodeOk": node_ok,
        "nodeVersion": node_version,
        "nodeDetails": node_details,
        "resolvedBinaryPath": launch_context.resolved_bin,
        "wrapperKind": launch_context.wrapper_kind,
        "pathEnvUsed": launch_context.path_env,
        "proxyEnvSnapshot": debug_info.get("proxyEnvSnapshot").cloned().unwrap_or(Value::Null),
        "appServerProbeStatus": probe_status.as_ref().map(|status| status.status.clone()),
        "fallbackRetried": probe_status.as_ref().map(|status| status.fallback_retried).unwrap_or(false),
        "debug": debug_info,
    }))
}

pub(crate) async fn run_claude_doctor_with_settings(
    claude_bin: Option<String>,
    settings: &AppSettings,
) -> Result<Value, String> {
    let default_bin = settings.claude_bin.clone();
    let resolved = claude_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_bin);
    let requested_bin = resolved
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "claude".to_string());
    let path_env = build_codex_path_env(Some(requested_bin.as_str()));
    let debug_info = get_cli_debug_info(Some(requested_bin.as_str()));
    let version_result = check_cli_binary(&requested_bin, path_env.clone()).await;
    let (version, cli_error, fallback_retried) = match version_result {
        Ok(Some(version)) => (Some(version), None, false),
        Ok(None) => (Some("unknown".to_string()), None, true),
        Err(error) => (None, Some(error), false),
    };
    let launch_context = resolve_codex_launch_context(Some(requested_bin.as_str()));

    let (node_ok, node_version, node_details) = probe_node_runtime(path_env.as_ref()).await;

    Ok(json!({
        "ok": version.is_some(),
        "codexBin": resolved,
        "version": version,
        "appServerOk": false,
        "details": cli_error,
        "path": path_env,
        "nodeOk": node_ok,
        "nodeVersion": node_version,
        "nodeDetails": node_details,
        "resolvedBinaryPath": launch_context.resolved_bin,
        "wrapperKind": launch_context.wrapper_kind,
        "pathEnvUsed": launch_context.path_env,
        "proxyEnvSnapshot": debug_info.get("proxyEnvSnapshot").cloned().unwrap_or(Value::Null),
        "appServerProbeStatus": Value::Null,
        "fallbackRetried": fallback_retried,
        "debug": debug_info,
    }))
}

#[cfg(test)]
mod tests {
    use super::run_claude_doctor_with_settings;
    use crate::types::AppSettings;

    #[tokio::test]
    async fn claude_doctor_failure_keeps_structured_diagnostics_fields() {
        let diagnostics = run_claude_doctor_with_settings(
            Some("/definitely/missing/claude".to_string()),
            &AppSettings::default(),
        )
        .await
        .expect("doctor should return structured diagnostics even on failure");

        for key in [
            "ok",
            "codexBin",
            "version",
            "appServerOk",
            "details",
            "path",
            "nodeOk",
            "nodeVersion",
            "nodeDetails",
            "resolvedBinaryPath",
            "wrapperKind",
            "pathEnvUsed",
            "proxyEnvSnapshot",
            "appServerProbeStatus",
            "fallbackRetried",
            "debug",
        ] {
            assert!(
                diagnostics.get(key).is_some(),
                "missing structured diagnostics field: {key}"
            );
        }

        assert_eq!(diagnostics["codexBin"], "/definitely/missing/claude");
        assert_eq!(diagnostics["ok"], false);
        assert!(diagnostics["details"].is_string() || diagnostics["details"].is_null());
        assert!(diagnostics["debug"].is_object());
    }
}

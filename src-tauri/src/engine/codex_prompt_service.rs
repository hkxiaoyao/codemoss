use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio::time::timeout;

use crate::backend::app_server::WorkspaceSession;
use crate::backend::events::AppServerEvent;
use crate::engine::error_mapper::extract_error_message;
use crate::state::AppState;

pub(crate) fn normalize_custom_spec_root(custom_spec_root: Option<&str>) -> Option<String> {
    let trimmed = custom_spec_root?.trim();
    if trimmed.is_empty() {
        return None;
    }
    if !Path::new(trimmed).is_absolute() {
        return None;
    }
    Some(trimmed.to_string())
}

struct BackgroundCallbackGuard {
    session: std::sync::Arc<WorkspaceSession>,
    thread_id: String,
    active: bool,
}

impl BackgroundCallbackGuard {
    fn new(session: std::sync::Arc<WorkspaceSession>, thread_id: String) -> Self {
        Self {
            session,
            thread_id,
            active: true,
        }
    }

    async fn cleanup(&mut self) {
        if !self.active {
            return;
        }
        self.active = false;
        let mut callbacks = self.session.background_thread_callbacks.lock().await;
        callbacks.remove(&self.thread_id);
    }
}

pub(crate) async fn run_codex_prompt_sync(
    workspace_id: &str,
    text: &str,
    model: Option<String>,
    effort: Option<String>,
    access_mode: Option<String>,
    custom_spec_root: Option<String>,
    app: &AppHandle,
    state: &AppState,
) -> Result<String, String> {
    crate::codex::ensure_codex_session(workspace_id, state, app).await?;

    let session = {
        let sessions = state.sessions.lock().await;
        sessions
            .get(workspace_id)
            .ok_or("workspace not connected")?
            .clone()
    };

    let thread_result = session
        .send_request(
            "thread/start",
            json!({
                "cwd": session.entry.path,
                "approvalPolicy": "never"
            }),
        )
        .await?;

    if thread_result.get("error").is_some() {
        return Err(extract_error_message(
            thread_result.get("error"),
            "Unknown error starting Codex thread",
        ));
    }

    let helper_thread_id = thread_result
        .get("result")
        .and_then(|r| r.get("threadId"))
        .or_else(|| {
            thread_result
                .get("result")
                .and_then(|r| r.get("thread"))
                .and_then(|t| t.get("id"))
        })
        .or_else(|| thread_result.get("threadId"))
        .or_else(|| thread_result.get("thread").and_then(|t| t.get("id")))
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Failed to get thread id for Codex prompt".to_string())?
        .to_string();

    let _ = app.emit(
        "app-server-event",
        AppServerEvent {
            workspace_id: workspace_id.to_string(),
            message: json!({
                "method": "codex/backgroundThread",
                "params": {
                    "threadId": helper_thread_id,
                    "action": "hide"
                }
            }),
        },
    );

    let (tx, mut rx) = mpsc::unbounded_channel::<Value>();
    {
        let mut callbacks = session.background_thread_callbacks.lock().await;
        callbacks.insert(helper_thread_id.clone(), tx);
    }
    let mut callback_guard =
        BackgroundCallbackGuard::new(session.clone(), helper_thread_id.clone());

    let access_mode = access_mode.unwrap_or_else(|| "read-only".to_string());
    let mut writable_roots = vec![session.entry.path.clone()];
    if let Some(spec_root) = custom_spec_root {
        if !spec_root.is_empty()
            && spec_root != session.entry.path
            && !writable_roots.iter().any(|root| root == &spec_root)
        {
            writable_roots.push(spec_root);
        }
    }
    let sandbox_policy = match access_mode.as_str() {
        "full-access" => json!({ "type": "dangerFullAccess" }),
        "current" => json!({
            "type": "workspaceWrite",
            "writableRoots": writable_roots,
            "networkAccess": true
        }),
        _ => json!({ "type": "readOnly" }),
    };
    let turn_result = session
        .send_request(
            "turn/start",
            json!({
                "threadId": helper_thread_id,
                "input": [{ "type": "text", "text": text }],
                "cwd": session.entry.path,
                "approvalPolicy": "never",
                "sandboxPolicy": sandbox_policy,
                "model": model,
                "effort": effort,
            }),
        )
        .await;

    let turn_result = match turn_result {
        Ok(result) => result,
        Err(error) => {
            callback_guard.cleanup().await;
            let _ = session
                .send_request(
                    "thread/archive",
                    json!({ "threadId": helper_thread_id.as_str() }),
                )
                .await;
            return Err(error);
        }
    };

    if turn_result.get("error").is_some() {
        callback_guard.cleanup().await;
        let _ = session
            .send_request(
                "thread/archive",
                json!({ "threadId": helper_thread_id.as_str() }),
            )
            .await;
        return Err(extract_error_message(
            turn_result.get("error"),
            "Unknown error starting Codex turn",
        ));
    }

    let mut response_text = String::new();
    let collect_result = timeout(Duration::from_secs(600), async {
        while let Some(event) = rx.recv().await {
            let method = event.get("method").and_then(|m| m.as_str()).unwrap_or("");
            match method {
                "item/agentMessage/delta" => {
                    if let Some(delta) = event
                        .get("params")
                        .and_then(|p| p.get("delta"))
                        .and_then(|d| d.as_str())
                    {
                        response_text.push_str(delta);
                    }
                }
                "turn/completed" => break,
                "turn/error" => {
                    return Err(extract_error_message(
                        event.get("params").and_then(|params| params.get("error")),
                        "Unknown Codex turn error",
                    ));
                }
                _ => {}
            }
        }
        Ok(())
    })
    .await;

    callback_guard.cleanup().await;

    let _ = session
        .send_request("thread/archive", json!({ "threadId": helper_thread_id }))
        .await;

    match collect_result {
        Ok(Ok(())) => {}
        Ok(Err(error)) => return Err(error),
        Err(_) => return Err("Timeout waiting for Codex response".to_string()),
    }

    let trimmed = response_text.trim().to_string();
    if trimmed.is_empty() {
        return Err("Codex returned empty response".to_string());
    }
    Ok(trimmed)
}

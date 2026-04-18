use super::*;
use crate::runtime::RuntimeAcquireGate;
use tauri::AppHandle;

/// Ensure a Codex session exists for the workspace. If not, spawn one.
/// This is called before sending messages to handle the case where user
/// switches from Claude to Codex engine without reconnecting the workspace.
pub(crate) async fn ensure_codex_session(
    workspace_id: &str,
    state: &AppState,
    app: &AppHandle,
) -> Result<(), String> {
    loop {
        {
            let sessions = state.sessions.lock().await;
            if sessions.contains_key(workspace_id) {
                state
                    .runtime_manager
                    .touch("codex", workspace_id, "ensure-runtime-ready")
                    .await;
                return Ok(());
            }
        }

        match state
            .runtime_manager
            .begin_runtime_acquire("codex", workspace_id)
            .await
        {
            RuntimeAcquireGate::Leader => break,
            RuntimeAcquireGate::Waiter(notify) => notify.notified().await,
        }
    }

    log::info!(
        "[ensure_codex_session] No session for workspace {}, spawning new Codex session",
        workspace_id
    );

    let (entry, parent_entry) = {
        let workspaces = state.workspaces.lock().await;
        let entry = workspaces
            .get(workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;
        let parent_entry = entry
            .parent_id
            .as_ref()
            .and_then(|pid| workspaces.get(pid).cloned());
        (entry, parent_entry)
    };

    let (default_bin, codex_args) = {
        let settings = state.app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, parent_entry.as_ref(), Some(&settings)),
        )
    };

    let codex_home = resolve_workspace_codex_home(&entry, parent_entry.as_ref());
    let mode_enforcement_enabled = {
        let settings = state.app_settings.lock().await;
        settings.codex_mode_enforcement_enabled
    };

    state
        .runtime_manager
        .record_starting(&entry, "codex", "ensure-runtime-ready")
        .await;

    let spawn_result = spawn_workspace_session(
        entry.clone(),
        default_bin,
        codex_args,
        app.clone(),
        codex_home,
    )
    .await;
    let session = match spawn_result {
        Ok(session) => session,
        Err(error) => {
            state
                .runtime_manager
                .record_failure(&entry, "codex", "ensure-runtime-ready", error.clone())
                .await;
            state
                .runtime_manager
                .finish_runtime_acquire("codex", workspace_id)
                .await;
            return Err(error);
        }
    };
    session.set_mode_enforcement_enabled(mode_enforcement_enabled);
    session.attach_runtime_manager(state.runtime_manager.clone());
    let replace_result = crate::runtime::replace_workspace_session(
        &state.sessions,
        Some(&state.runtime_manager),
        entry.id,
        session,
        "ensure-runtime-ready",
    )
    .await;
    state
        .runtime_manager
        .finish_runtime_acquire("codex", workspace_id)
        .await;
    replace_result
}

use super::*;
use crate::runtime::RuntimeManager;
use std::sync::Mutex as StdMutex;

/// Claude session manager for all workspaces
pub struct ClaudeSessionManager {
    sessions: Mutex<HashMap<String, Arc<ClaudeSession>>>,
    default_config: RwLock<EngineConfig>,
    runtime_manager: StdMutex<Option<Arc<RuntimeManager>>>,
}

impl ClaudeSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            default_config: RwLock::new(EngineConfig::default()),
            runtime_manager: StdMutex::new(None),
        }
    }

    pub fn set_runtime_manager(&self, runtime_manager: Arc<RuntimeManager>) {
        *self
            .runtime_manager
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(runtime_manager);
    }

    /// Set default configuration
    pub async fn set_config(&self, config: EngineConfig) {
        *self.default_config.write().await = config;
    }

    /// Get or create a session for a workspace
    pub async fn get_or_create_session(
        &self,
        workspace_id: &str,
        workspace_path: &Path,
    ) -> Arc<ClaudeSession> {
        let mut sessions = self.sessions.lock().await;

        if let Some(session) = sessions.get(workspace_id) {
            return session.clone();
        }

        let config = self.default_config.read().await.clone();
        let runtime_manager = self
            .runtime_manager
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();
        let session = Arc::new(ClaudeSession::new_with_runtime(
            workspace_id.to_string(),
            workspace_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(workspace_id)
                .to_string(),
            workspace_path.to_path_buf(),
            Some(config),
            runtime_manager,
        ));

        sessions.insert(workspace_id.to_string(), session.clone());
        session
    }

    /// Remove a session
    pub async fn remove_session(&self, workspace_id: &str) -> Option<Arc<ClaudeSession>> {
        let mut sessions = self.sessions.lock().await;
        sessions.remove(workspace_id)
    }

    /// Get a session if it exists
    pub async fn get_session(&self, workspace_id: &str) -> Option<Arc<ClaudeSession>> {
        let sessions = self.sessions.lock().await;
        sessions.get(workspace_id).cloned()
    }

    /// Snapshot all tracked sessions.
    pub async fn list_sessions(&self) -> Vec<(String, Arc<ClaudeSession>)> {
        let sessions = self.sessions.lock().await;
        sessions
            .iter()
            .map(|(workspace_id, session)| (workspace_id.clone(), session.clone()))
            .collect()
    }

    /// Interrupt all active sessions (used during app shutdown)
    pub async fn interrupt_all(&self) {
        let sessions = self.sessions.lock().await;
        for session in sessions.values() {
            let _ = session.interrupt().await;
        }
    }
}

impl Default for ClaudeSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

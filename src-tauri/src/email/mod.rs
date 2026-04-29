use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Mutex;

use crate::state::AppState;
use crate::storage::{read_json_file, write_json_file, write_settings};
use crate::types::{AppSettings, EmailSenderProvider, EmailSenderSecurity, EmailSenderSettings};

const EMAIL_SECRET_FILE_NAME: &str = "email-sender-secret.json";
const TEST_EMAIL_SUBJECT: &str = "Moss email test";
const SEND_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EmailSenderSettingsView {
    pub(crate) settings: EmailSenderSettings,
    pub(crate) secret_configured: bool,
    pub(crate) secret: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateEmailSenderSettingsRequest {
    pub(crate) settings: EmailSenderSettings,
    #[serde(default)]
    pub(crate) secret: Option<String>,
    #[serde(default)]
    pub(crate) clear_secret: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SendTestEmailRequest {
    #[serde(default)]
    pub(crate) recipient: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SendConversationCompletionEmailRequest {
    pub(crate) workspace_id: String,
    pub(crate) thread_id: String,
    pub(crate) turn_id: String,
    pub(crate) subject: String,
    pub(crate) text_body: String,
    #[serde(default)]
    pub(crate) recipient: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EmailSendResult {
    pub(crate) provider: EmailSenderProvider,
    pub(crate) accepted_recipients: Vec<String>,
    pub(crate) duration_ms: u128,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum EmailSendErrorCode {
    Disabled,
    NotConfigured,
    MissingSecret,
    InvalidSender,
    InvalidRecipient,
    ConnectFailed,
    TlsFailed,
    AuthenticationFailed,
    SendRejected,
    Timeout,
    SecretStoreUnavailable,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EmailSendError {
    pub(crate) code: EmailSendErrorCode,
    pub(crate) retryable: bool,
    pub(crate) user_message: String,
    #[serde(default)]
    pub(crate) detail: BTreeMap<String, String>,
}

trait EmailSecretStore {
    fn get(&self) -> Result<Option<String>, EmailSendError>;
    fn set(&self, secret: &str) -> Result<(), EmailSendError>;
    fn clear(&self) -> Result<(), EmailSendError>;
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct EmailSecretFile {
    #[serde(default)]
    secret: Option<String>,
}

struct FileEmailSecretStore {
    path: PathBuf,
}

impl FileEmailSecretStore {
    fn from_settings_path(settings_path: &Path) -> Self {
        let root = settings_path.parent().unwrap_or_else(|| Path::new("."));
        Self {
            path: root.join(EMAIL_SECRET_FILE_NAME),
        }
    }

    fn write_secret_file(&self, value: EmailSecretFile) -> Result<(), EmailSendError> {
        write_json_file(&self.path, &value).map_err(|_| secret_store_unavailable())?;
        set_owner_only_file_permissions(&self.path);
        Ok(())
    }
}

impl EmailSecretStore for FileEmailSecretStore {
    fn get(&self) -> Result<Option<String>, EmailSendError> {
        let file = read_json_file::<EmailSecretFile>(&self.path)
            .map_err(|_| secret_store_unavailable())?
            .unwrap_or_default();
        Ok(file
            .secret
            .map(|secret| secret.trim().to_string())
            .filter(|secret| !secret.is_empty()))
    }

    fn set(&self, secret: &str) -> Result<(), EmailSendError> {
        self.write_secret_file(EmailSecretFile {
            secret: Some(secret.trim().to_string()),
        })
    }

    fn clear(&self) -> Result<(), EmailSendError> {
        self.write_secret_file(EmailSecretFile { secret: None })
    }
}

#[cfg(unix)]
fn set_owner_only_file_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;

    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn set_owner_only_file_permissions(_path: &Path) {}

#[tauri::command]
pub(crate) async fn get_email_sender_settings(
    state: State<'_, AppState>,
) -> Result<EmailSenderSettingsView, String> {
    let secret_store = FileEmailSecretStore::from_settings_path(&state.settings_path);
    get_email_sender_settings_core(&state.app_settings, &secret_store)
        .await
        .map_err(encode_email_error)
}

#[tauri::command]
pub(crate) async fn update_email_sender_settings(
    request: UpdateEmailSenderSettingsRequest,
    state: State<'_, AppState>,
) -> Result<EmailSenderSettingsView, String> {
    let secret_store = FileEmailSecretStore::from_settings_path(&state.settings_path);
    update_email_sender_settings_core(
        request,
        &state.app_settings,
        &state.settings_path,
        &secret_store,
    )
    .await
    .map_err(encode_email_error)
}

#[tauri::command]
pub(crate) async fn send_test_email(
    request: SendTestEmailRequest,
    state: State<'_, AppState>,
) -> Result<EmailSendResult, String> {
    let settings = state.app_settings.lock().await.email_sender.clone();
    let secret_store = FileEmailSecretStore::from_settings_path(&state.settings_path);
    send_test_email_core(settings, request, &secret_store)
        .await
        .map_err(encode_email_error)
}

#[tauri::command]
pub(crate) async fn send_conversation_completion_email(
    request: SendConversationCompletionEmailRequest,
    state: State<'_, AppState>,
) -> Result<EmailSendResult, String> {
    let settings = state.app_settings.lock().await.email_sender.clone();
    let secret_store = FileEmailSecretStore::from_settings_path(&state.settings_path);
    send_conversation_completion_email_core(settings, request, &secret_store)
        .await
        .map_err(encode_email_error)
}

async fn get_email_sender_settings_core(
    app_settings: &Mutex<AppSettings>,
    secret_store: &impl EmailSecretStore,
) -> Result<EmailSenderSettingsView, EmailSendError> {
    let settings = app_settings.lock().await.email_sender.clone();
    let secret = secret_store.get()?;
    let secret_configured = secret.is_some();
    Ok(EmailSenderSettingsView {
        settings,
        secret_configured,
        secret,
    })
}

async fn update_email_sender_settings_core(
    request: UpdateEmailSenderSettingsRequest,
    app_settings: &Mutex<AppSettings>,
    settings_path: &std::path::PathBuf,
    secret_store: &impl EmailSecretStore,
) -> Result<EmailSenderSettingsView, EmailSendError> {
    let normalized_settings = normalize_settings_for_save(request.settings);
    let next_secret = request
        .secret
        .as_deref()
        .map(str::trim)
        .filter(|secret| !secret.is_empty())
        .map(str::to_string);
    let mut next = app_settings.lock().await.clone();
    next.email_sender = normalized_settings.clone();
    write_settings(settings_path, &next).map_err(|error| {
        email_error(
            EmailSendErrorCode::Unknown,
            false,
            format!("failed to write email sender settings: {error}"),
        )
    })?;
    *app_settings.lock().await = next;

    if request.clear_secret {
        secret_store.clear()?;
    }

    if let Some(secret) = next_secret.as_deref() {
        secret_store.set(secret)?;
    }

    let persisted_secret = match (request.clear_secret, next_secret) {
        (_, Some(secret)) => Some(secret),
        (true, None) => None,
        (false, None) => secret_store.get()?,
    };
    let secret_configured = persisted_secret.is_some();
    Ok(EmailSenderSettingsView {
        settings: normalized_settings,
        secret_configured,
        secret: persisted_secret,
    })
}

async fn send_test_email_core(
    settings: EmailSenderSettings,
    request: SendTestEmailRequest,
    secret_store: &impl EmailSecretStore,
) -> Result<EmailSendResult, EmailSendError> {
    if !settings.enabled {
        return Err(email_error(
            EmailSendErrorCode::Disabled,
            false,
            "Email sender is disabled.",
        ));
    }

    let recipient = resolve_requested_recipient(
        request.recipient.as_deref(),
        settings.recipient_email.as_str(),
    );
    validate_recipient(recipient)?;

    let secret = secret_store.get()?.ok_or_else(missing_secret)?;
    let send_request = EmailSendRequest {
        to: recipient.to_string(),
        subject: TEST_EMAIL_SUBJECT.to_string(),
        text_body: "This is a Moss test email. If you received it, your SMTP settings work."
            .to_string(),
    };
    send_email(settings, &secret, send_request).await
}

async fn send_conversation_completion_email_core(
    settings: EmailSenderSettings,
    request: SendConversationCompletionEmailRequest,
    secret_store: &impl EmailSecretStore,
) -> Result<EmailSendResult, EmailSendError> {
    let (settings, secret, send_request) =
        prepare_conversation_completion_email(settings, request, secret_store)?;
    send_email(settings, &secret, send_request).await
}

fn prepare_conversation_completion_email(
    settings: EmailSenderSettings,
    request: SendConversationCompletionEmailRequest,
    secret_store: &impl EmailSecretStore,
) -> Result<(EmailSenderSettings, String, EmailSendRequest), EmailSendError> {
    if !settings.enabled {
        return Err(email_error(
            EmailSendErrorCode::Disabled,
            false,
            "Email sender is disabled.",
        ));
    }

    validate_conversation_completion_metadata(&request)?;
    let recipient = resolve_requested_recipient(
        request.recipient.as_deref(),
        settings.recipient_email.as_str(),
    );
    validate_recipient(recipient)?;

    let subject = validate_email_subject(request.subject.as_str())?;
    let text_body = validate_email_text_body(request.text_body.as_str())?;

    let secret = secret_store.get()?.ok_or_else(missing_secret)?;
    let send_request = EmailSendRequest {
        to: recipient.to_string(),
        subject,
        text_body,
    };
    Ok((settings, secret, send_request))
}

#[derive(Debug)]
struct EmailSendRequest {
    to: String,
    subject: String,
    text_body: String,
}

async fn send_email(
    settings: EmailSenderSettings,
    secret: &str,
    request: EmailSendRequest,
) -> Result<EmailSendResult, EmailSendError> {
    if !settings.enabled {
        return Err(email_error(
            EmailSendErrorCode::Disabled,
            false,
            "Email sender is disabled.",
        ));
    }

    let effective = resolve_effective_settings(&settings)?;
    validate_ready_settings(&effective)?;
    if secret.trim().is_empty() {
        return Err(missing_secret());
    }

    let from_address = effective
        .sender_email
        .parse()
        .map_err(|_| invalid_sender())?;
    let to_address = request.to.parse().map_err(|_| invalid_recipient())?;
    let from = Mailbox::new(non_empty(effective.sender_name.clone()), from_address);
    let to = Mailbox::new(None, to_address);
    let message = Message::builder()
        .from(from)
        .to(to)
        .subject(request.subject)
        .body(request.text_body)
        .map_err(|_| email_error(EmailSendErrorCode::Unknown, false, "Failed to build email."))?;

    let credentials = Credentials::new(effective.username.clone(), secret.to_string());
    let mailer = build_mailer(&effective, credentials)?;
    let started_at = Instant::now();
    let send_result = tokio::time::timeout(SEND_TIMEOUT, mailer.send(message)).await;
    match send_result {
        Err(_) => Err(email_error(
            EmailSendErrorCode::Timeout,
            true,
            "Email sending timed out.",
        )),
        Ok(Ok(_)) => Ok(EmailSendResult {
            provider: effective.provider,
            accepted_recipients: vec![request.to],
            duration_ms: started_at.elapsed().as_millis(),
        }),
        Ok(Err(error)) => Err(classify_smtp_error(&error.to_string())),
    }
}

fn build_mailer(
    settings: &EmailSenderSettings,
    credentials: Credentials,
) -> Result<AsyncSmtpTransport<Tokio1Executor>, EmailSendError> {
    let mut builder = match settings.security {
        EmailSenderSecurity::SslTls => AsyncSmtpTransport::<Tokio1Executor>::relay(
            settings.smtp_host.as_str(),
        )
        .map_err(|_| {
            email_error(
                EmailSendErrorCode::TlsFailed,
                true,
                "Failed to configure TLS.",
            )
        })?,
        EmailSenderSecurity::StartTls => {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(settings.smtp_host.as_str())
                .map_err(|_| {
                    email_error(
                        EmailSendErrorCode::TlsFailed,
                        true,
                        "Failed to configure STARTTLS.",
                    )
                })?
        }
        EmailSenderSecurity::None => {
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(settings.smtp_host.as_str())
        }
    };
    builder = builder.port(settings.smtp_port).credentials(credentials);
    Ok(builder.build())
}

fn normalize_settings_for_save(mut settings: EmailSenderSettings) -> EmailSenderSettings {
    settings.sender_email = settings.sender_email.trim().to_string();
    settings.sender_name = settings.sender_name.trim().to_string();
    settings.smtp_host = settings.smtp_host.trim().to_string();
    settings.username = settings.username.trim().to_string();
    settings.recipient_email = settings.recipient_email.trim().to_string();
    resolve_effective_settings(&settings).unwrap_or(settings)
}

fn resolve_effective_settings(
    settings: &EmailSenderSettings,
) -> Result<EmailSenderSettings, EmailSendError> {
    let mut next = settings.clone();
    match next.provider {
        EmailSenderProvider::Mail126 => {
            next.smtp_host = "smtp.126.com".to_string();
            next.smtp_port = 465;
            next.security = EmailSenderSecurity::SslTls;
        }
        EmailSenderProvider::Mail163 => {
            next.smtp_host = "smtp.163.com".to_string();
            next.smtp_port = 465;
            next.security = EmailSenderSecurity::SslTls;
        }
        EmailSenderProvider::Qq => {
            next.smtp_host = "smtp.qq.com".to_string();
            next.smtp_port = 465;
            next.security = EmailSenderSecurity::SslTls;
        }
        EmailSenderProvider::Custom => {}
    }
    if next.smtp_port == 0 {
        return Err(email_error(
            EmailSendErrorCode::NotConfigured,
            false,
            "SMTP port is not configured.",
        ));
    }
    Ok(next)
}

fn validate_ready_settings(settings: &EmailSenderSettings) -> Result<(), EmailSendError> {
    if settings.sender_email.trim().is_empty()
        || settings.smtp_host.trim().is_empty()
        || settings.username.trim().is_empty()
    {
        return Err(email_error(
            EmailSendErrorCode::NotConfigured,
            false,
            "Email sender settings are incomplete.",
        ));
    }
    settings
        .sender_email
        .parse::<lettre::Address>()
        .map_err(|_| invalid_sender())?;
    Ok(())
}

fn validate_recipient(recipient: &str) -> Result<(), EmailSendError> {
    if recipient.is_empty() || recipient.parse::<lettre::Address>().is_err() {
        return Err(invalid_recipient());
    }
    Ok(())
}

fn resolve_requested_recipient<'a>(requested: Option<&'a str>, fallback: &'a str) -> &'a str {
    requested
        .map(str::trim)
        .filter(|recipient| !recipient.is_empty())
        .unwrap_or_else(|| fallback.trim())
}

fn validate_email_subject(subject: &str) -> Result<String, EmailSendError> {
    let trimmed = subject.trim();
    if trimmed.is_empty() {
        return Err(empty_conversation_completion_email_content());
    }
    if trimmed.contains('\r') || trimmed.contains('\n') {
        return Err(email_error(
            EmailSendErrorCode::NotConfigured,
            false,
            "Conversation completion email subject is invalid.",
        ));
    }
    Ok(trimmed.to_string())
}

fn validate_email_text_body(text_body: &str) -> Result<String, EmailSendError> {
    let trimmed = text_body.trim();
    if trimmed.is_empty() {
        return Err(empty_conversation_completion_email_content());
    }
    Ok(trimmed.to_string())
}

fn validate_conversation_completion_metadata(
    request: &SendConversationCompletionEmailRequest,
) -> Result<(), EmailSendError> {
    if request.workspace_id.trim().is_empty()
        || request.thread_id.trim().is_empty()
        || request.turn_id.trim().is_empty()
    {
        return Err(email_error(
            EmailSendErrorCode::NotConfigured,
            false,
            "Conversation completion email metadata is incomplete.",
        ));
    }
    Ok(())
}

fn classify_smtp_error(raw_error: &str) -> EmailSendError {
    let lower = raw_error.to_lowercase();
    if lower.contains("authentication") || lower.contains("auth") || lower.contains("credentials") {
        return email_error(
            EmailSendErrorCode::AuthenticationFailed,
            false,
            "SMTP authentication failed. Check your authorization code or app password.",
        );
    }
    if lower.contains("tls") || lower.contains("certificate") {
        return email_error(
            EmailSendErrorCode::TlsFailed,
            true,
            "SMTP TLS handshake failed.",
        );
    }
    if lower.contains("recipient") || lower.contains("address") {
        return invalid_recipient();
    }
    if lower.contains("timeout") {
        return email_error(
            EmailSendErrorCode::Timeout,
            true,
            "Email sending timed out.",
        );
    }
    if lower.contains("connect") || lower.contains("network") || lower.contains("dns") {
        return email_error(
            EmailSendErrorCode::ConnectFailed,
            true,
            "Failed to connect to SMTP server.",
        );
    }
    email_error(
        EmailSendErrorCode::SendRejected,
        false,
        "SMTP server rejected the message.",
    )
}

fn encode_email_error(error: EmailSendError) -> String {
    match serde_json::to_string(&error) {
        Ok(payload) => format!("EMAIL_SEND_ERROR:{payload}"),
        Err(_) => "EMAIL_SEND_ERROR:{\"code\":\"unknown\",\"retryable\":false,\"userMessage\":\"Email command failed.\"}".to_string(),
    }
}

fn secret_store_unavailable() -> EmailSendError {
    email_error(
        EmailSendErrorCode::SecretStoreUnavailable,
        true,
        "Email secret store is unavailable.",
    )
}

fn missing_secret() -> EmailSendError {
    email_error(
        EmailSendErrorCode::MissingSecret,
        false,
        "Email authorization code or app password is missing.",
    )
}

fn invalid_sender() -> EmailSendError {
    email_error(
        EmailSendErrorCode::InvalidSender,
        false,
        "Sender email address is invalid.",
    )
}

fn invalid_recipient() -> EmailSendError {
    email_error(
        EmailSendErrorCode::InvalidRecipient,
        false,
        "Recipient email address is invalid.",
    )
}

fn empty_conversation_completion_email_content() -> EmailSendError {
    email_error(
        EmailSendErrorCode::NotConfigured,
        false,
        "Conversation completion email content is empty.",
    )
}

fn email_error(
    code: EmailSendErrorCode,
    retryable: bool,
    user_message: impl Into<String>,
) -> EmailSendError {
    EmailSendError {
        code,
        retryable,
        user_message: user_message.into(),
        detail: BTreeMap::new(),
    }
}

fn non_empty(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex as StdMutex};
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    #[derive(Clone, Default)]
    struct MemoryEmailSecretStore {
        value: Arc<StdMutex<Option<String>>>,
        unavailable: bool,
        fail_set: bool,
        fail_clear: bool,
        calls: Arc<StdMutex<Vec<&'static str>>>,
    }

    impl EmailSecretStore for MemoryEmailSecretStore {
        fn get(&self) -> Result<Option<String>, EmailSendError> {
            self.calls.lock().expect("memory calls lock").push("get");
            if self.unavailable {
                return Err(secret_store_unavailable());
            }
            Ok(self.value.lock().expect("memory secret lock").clone())
        }

        fn set(&self, secret: &str) -> Result<(), EmailSendError> {
            self.calls.lock().expect("memory calls lock").push("set");
            if self.unavailable || self.fail_set {
                return Err(secret_store_unavailable());
            }
            *self.value.lock().expect("memory secret lock") = Some(secret.to_string());
            Ok(())
        }

        fn clear(&self) -> Result<(), EmailSendError> {
            self.calls.lock().expect("memory calls lock").push("clear");
            if self.unavailable || self.fail_clear {
                return Err(secret_store_unavailable());
            }
            *self.value.lock().expect("memory secret lock") = None;
            Ok(())
        }
    }

    impl MemoryEmailSecretStore {
        fn with_secret(secret: &str) -> Self {
            Self {
                value: Arc::new(StdMutex::new(Some(secret.to_string()))),
                ..Self::default()
            }
        }

        fn calls(&self) -> Vec<&'static str> {
            self.calls.lock().expect("memory calls lock").clone()
        }

        fn secret(&self) -> Option<String> {
            self.value.lock().expect("memory secret lock").clone()
        }
    }

    fn temp_settings_path(test_name: &str) -> (PathBuf, PathBuf) {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "moss-email-{test_name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("create temp settings root");
        let settings_path = root.join("settings.json");
        (root, settings_path)
    }

    #[test]
    fn provider_presets_apply_backend_defaults() {
        let settings_126 = resolve_effective_settings(&EmailSenderSettings {
            provider: EmailSenderProvider::Mail126,
            smtp_host: "ignored".to_string(),
            smtp_port: 587,
            security: EmailSenderSecurity::StartTls,
            ..EmailSenderSettings::default()
        })
        .expect("126 preset");
        assert_eq!(settings_126.smtp_host, "smtp.126.com");
        assert_eq!(settings_126.smtp_port, 465);
        assert_eq!(settings_126.security, EmailSenderSecurity::SslTls);

        let settings_163 = resolve_effective_settings(&EmailSenderSettings {
            provider: EmailSenderProvider::Mail163,
            ..EmailSenderSettings::default()
        })
        .expect("163 preset");
        assert_eq!(settings_163.smtp_host, "smtp.163.com");

        let settings_qq = resolve_effective_settings(&EmailSenderSettings {
            provider: EmailSenderProvider::Qq,
            ..EmailSenderSettings::default()
        })
        .expect("qq preset");
        assert_eq!(settings_qq.smtp_host, "smtp.qq.com");
    }

    #[test]
    fn custom_provider_keeps_manual_smtp_fields() {
        let settings = resolve_effective_settings(&EmailSenderSettings {
            provider: EmailSenderProvider::Custom,
            smtp_host: "smtp.example.com".to_string(),
            smtp_port: 587,
            security: EmailSenderSecurity::StartTls,
            ..EmailSenderSettings::default()
        })
        .expect("custom settings");
        assert_eq!(settings.smtp_host, "smtp.example.com");
        assert_eq!(settings.smtp_port, 587);
        assert_eq!(settings.security, EmailSenderSecurity::StartTls);
    }

    #[test]
    fn validation_rejects_invalid_recipient_before_smtp() {
        let error = validate_recipient("not-an-email").expect_err("invalid recipient");
        assert_eq!(error.code, EmailSendErrorCode::InvalidRecipient);
    }

    #[test]
    fn file_secret_store_persists_trims_and_clears_secret() {
        let (root, settings_path) = temp_settings_path("file-secret-store");
        let store = FileEmailSecretStore::from_settings_path(&settings_path);
        assert!(store.get().expect("missing secret").is_none());

        store.set("  stored-secret  ").expect("set secret");
        assert_eq!(
            store.get().expect("saved secret").as_deref(),
            Some("stored-secret")
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            let secret_path = settings_path
                .parent()
                .expect("settings parent")
                .join(EMAIL_SECRET_FILE_NAME);
            let mode = fs::metadata(secret_path)
                .expect("secret file metadata")
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600);
        }

        store.clear().expect("clear secret");
        assert!(store.get().expect("cleared secret").is_none());
        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn secret_store_replace_and_clear_updates_configured_status() {
        let app_settings = Mutex::new(AppSettings::default());
        let store = MemoryEmailSecretStore::default();
        store.set("first").expect("set first");
        store.set("second").expect("replace");
        assert_eq!(store.get().expect("get").as_deref(), Some("second"));
        store.clear().expect("clear");
        assert!(store.get().expect("get after clear").is_none());

        let view = get_email_sender_settings_core(&app_settings, &store)
            .await
            .expect("settings view");
        assert!(!view.secret_configured);
        assert_eq!(view.secret, None);
    }

    #[tokio::test]
    async fn settings_view_returns_saved_secret_for_settings_echo() {
        let app_settings = Mutex::new(AppSettings::default());
        let store = MemoryEmailSecretStore::with_secret("stored-secret");

        let view = get_email_sender_settings_core(&app_settings, &store)
            .await
            .expect("settings view");

        assert!(view.secret_configured);
        assert_eq!(view.secret.as_deref(), Some("stored-secret"));
    }

    #[tokio::test]
    async fn unavailable_secret_store_returns_stable_code() {
        let app_settings = Mutex::new(AppSettings::default());
        let store = MemoryEmailSecretStore {
            unavailable: true,
            ..MemoryEmailSecretStore::default()
        };
        let error = get_email_sender_settings_core(&app_settings, &store)
            .await
            .expect_err("secret store unavailable");
        assert_eq!(error.code, EmailSendErrorCode::SecretStoreUnavailable);
    }

    #[tokio::test]
    async fn update_settings_write_failure_does_not_touch_secret_store() {
        let (root, settings_path) = temp_settings_path("write-failure");
        fs::create_dir_all(&settings_path).expect("create directory at settings path");
        let mut original = AppSettings::default();
        original.email_sender.sender_email = "old@example.com".to_string();
        let app_settings = Mutex::new(original);
        let store = MemoryEmailSecretStore::with_secret("old-secret");

        let error = update_email_sender_settings_core(
            UpdateEmailSenderSettingsRequest {
                settings: EmailSenderSettings {
                    sender_email: "new@example.com".to_string(),
                    ..EmailSenderSettings::default()
                },
                secret: Some("new-secret".to_string()),
                clear_secret: true,
            },
            &app_settings,
            &settings_path,
            &store,
        )
        .await
        .expect_err("settings write should fail before secret mutation");

        assert_eq!(error.code, EmailSendErrorCode::Unknown);
        assert_eq!(store.secret().as_deref(), Some("old-secret"));
        assert!(store.calls().is_empty());
        assert_eq!(
            app_settings.lock().await.email_sender.sender_email,
            "old@example.com"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn update_settings_secret_failure_reports_error_after_non_secret_save() {
        let (root, settings_path) = temp_settings_path("secret-failure");
        let app_settings = Mutex::new(AppSettings::default());
        let store = MemoryEmailSecretStore {
            fail_set: true,
            ..MemoryEmailSecretStore::default()
        };

        let next_settings = EmailSenderSettings {
            enabled: true,
            provider: EmailSenderProvider::Mail126,
            sender_email: "sender@example.com".to_string(),
            username: "sender@example.com".to_string(),
            ..EmailSenderSettings::default()
        };
        let error = update_email_sender_settings_core(
            UpdateEmailSenderSettingsRequest {
                settings: next_settings.clone(),
                secret: Some("new-secret".to_string()),
                clear_secret: false,
            },
            &app_settings,
            &settings_path,
            &store,
        )
        .await
        .expect_err("secret store failure should not report success");

        assert_eq!(error.code, EmailSendErrorCode::SecretStoreUnavailable);
        assert_eq!(store.calls(), vec!["set"]);
        assert_eq!(
            crate::storage::read_settings(&settings_path)
                .expect("read persisted settings")
                .email_sender
                .provider,
            EmailSenderProvider::Mail126
        );
        assert_eq!(
            app_settings.lock().await.email_sender.provider,
            EmailSenderProvider::Mail126
        );
        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn send_test_email_disabled_does_not_read_secret_store() {
        let store = MemoryEmailSecretStore::with_secret("stored-secret");
        let error = send_test_email_core(
            EmailSenderSettings::default(),
            SendTestEmailRequest {
                recipient: Some("to@example.com".to_string()),
            },
            &store,
        )
        .await
        .expect_err("disabled sender should stop before secret lookup");

        assert_eq!(error.code, EmailSendErrorCode::Disabled);
        assert!(store.calls().is_empty());
    }

    #[tokio::test]
    async fn send_test_email_uses_saved_recipient_when_request_is_empty() {
        let settings = EmailSenderSettings {
            enabled: true,
            provider: EmailSenderProvider::Custom,
            sender_email: "sender@example.com".to_string(),
            smtp_host: "smtp.example.com".to_string(),
            username: "sender@example.com".to_string(),
            recipient_email: "saved-recipient@example.com".to_string(),
            ..EmailSenderSettings::default()
        };
        let error = send_test_email_core(
            settings,
            SendTestEmailRequest { recipient: None },
            &MemoryEmailSecretStore::default(),
        )
        .await
        .expect_err("missing secret after saved recipient validation");

        assert_eq!(error.code, EmailSendErrorCode::MissingSecret);
    }

    #[tokio::test]
    async fn send_test_email_blank_request_recipient_falls_back_to_saved_recipient() {
        let settings = EmailSenderSettings {
            enabled: true,
            provider: EmailSenderProvider::Custom,
            sender_email: "sender@example.com".to_string(),
            smtp_host: "smtp.example.com".to_string(),
            username: "sender@example.com".to_string(),
            recipient_email: "saved-recipient@example.com".to_string(),
            ..EmailSenderSettings::default()
        };
        let error = send_test_email_core(
            settings,
            SendTestEmailRequest {
                recipient: Some("   ".to_string()),
            },
            &MemoryEmailSecretStore::default(),
        )
        .await
        .expect_err("missing secret after saved recipient fallback");

        assert_eq!(error.code, EmailSendErrorCode::MissingSecret);
    }

    #[tokio::test]
    async fn send_test_email_blocks_missing_secret_before_smtp() {
        let settings = EmailSenderSettings {
            enabled: true,
            provider: EmailSenderProvider::Custom,
            sender_email: "sender@example.com".to_string(),
            smtp_host: "smtp.example.com".to_string(),
            username: "sender@example.com".to_string(),
            ..EmailSenderSettings::default()
        };
        let error = send_test_email_core(
            settings,
            SendTestEmailRequest {
                recipient: Some("to@example.com".to_string()),
            },
            &MemoryEmailSecretStore::default(),
        )
        .await
        .expect_err("missing secret");
        assert_eq!(error.code, EmailSendErrorCode::MissingSecret);
    }

    #[test]
    fn conversation_completion_email_disabled_does_not_read_secret_store() {
        let store = MemoryEmailSecretStore::with_secret("stored-secret");
        let error = prepare_conversation_completion_email(
            EmailSenderSettings::default(),
            SendConversationCompletionEmailRequest {
                workspace_id: "workspace-1".to_string(),
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                subject: "Moss conversation completed".to_string(),
                text_body: "Assistant answer".to_string(),
                recipient: None,
            },
            &store,
        )
        .expect_err("disabled sender should stop before secret lookup");

        assert_eq!(error.code, EmailSendErrorCode::Disabled);
        assert!(store.calls().is_empty());
    }

    #[test]
    fn conversation_completion_email_rejects_invalid_recipient_before_secret_lookup() {
        let settings = EmailSenderSettings {
            enabled: true,
            recipient_email: "not-an-email".to_string(),
            ..EmailSenderSettings::default()
        };
        let store = MemoryEmailSecretStore::with_secret("stored-secret");
        let error = prepare_conversation_completion_email(
            settings,
            SendConversationCompletionEmailRequest {
                workspace_id: "workspace-1".to_string(),
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                subject: "Moss conversation completed".to_string(),
                text_body: "Assistant answer".to_string(),
                recipient: None,
            },
            &store,
        )
        .expect_err("invalid recipient");

        assert_eq!(error.code, EmailSendErrorCode::InvalidRecipient);
        assert!(store.calls().is_empty());
    }

    #[test]
    fn conversation_completion_email_requires_secret_after_validation() {
        let settings = EmailSenderSettings {
            enabled: true,
            provider: EmailSenderProvider::Custom,
            sender_email: "sender@example.com".to_string(),
            smtp_host: "smtp.example.com".to_string(),
            username: "sender@example.com".to_string(),
            recipient_email: "saved-recipient@example.com".to_string(),
            ..EmailSenderSettings::default()
        };
        let store = MemoryEmailSecretStore::default();
        let error = prepare_conversation_completion_email(
            settings,
            SendConversationCompletionEmailRequest {
                workspace_id: "workspace-1".to_string(),
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                subject: "Moss conversation completed".to_string(),
                text_body: "Assistant answer".to_string(),
                recipient: None,
            },
            &store,
        )
        .expect_err("missing secret");

        assert_eq!(error.code, EmailSendErrorCode::MissingSecret);
        assert_eq!(store.calls(), vec!["get"]);
    }

    #[test]
    fn conversation_completion_email_builds_send_request_from_saved_recipient() {
        let settings = EmailSenderSettings {
            enabled: true,
            provider: EmailSenderProvider::Custom,
            sender_email: "sender@example.com".to_string(),
            smtp_host: "smtp.example.com".to_string(),
            username: "sender@example.com".to_string(),
            recipient_email: "saved-recipient@example.com".to_string(),
            ..EmailSenderSettings::default()
        };
        let (prepared_settings, secret, send_request) = prepare_conversation_completion_email(
            settings.clone(),
            SendConversationCompletionEmailRequest {
                workspace_id: "workspace-1".to_string(),
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                subject: "  Moss conversation completed  ".to_string(),
                text_body: "  User: hi\nAssistant: done  ".to_string(),
                recipient: None,
            },
            &MemoryEmailSecretStore::with_secret("stored-secret"),
        )
        .expect("prepared conversation email");

        assert_eq!(prepared_settings.recipient_email, settings.recipient_email);
        assert_eq!(secret, "stored-secret");
        assert_eq!(send_request.to, "saved-recipient@example.com");
        assert_eq!(send_request.subject, "Moss conversation completed");
        assert_eq!(send_request.text_body, "User: hi\nAssistant: done");
    }

    #[test]
    fn conversation_completion_email_request_recipient_overrides_saved_recipient() {
        let settings = EmailSenderSettings {
            enabled: true,
            provider: EmailSenderProvider::Custom,
            sender_email: "sender@example.com".to_string(),
            smtp_host: "smtp.example.com".to_string(),
            username: "sender@example.com".to_string(),
            recipient_email: "saved-recipient@example.com".to_string(),
            ..EmailSenderSettings::default()
        };
        let (_, _, send_request) = prepare_conversation_completion_email(
            settings,
            SendConversationCompletionEmailRequest {
                workspace_id: "workspace-1".to_string(),
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                subject: "Moss conversation completed".to_string(),
                text_body: "Assistant answer".to_string(),
                recipient: Some("override@example.com".to_string()),
            },
            &MemoryEmailSecretStore::with_secret("stored-secret"),
        )
        .expect("prepared conversation email");

        assert_eq!(send_request.to, "override@example.com");
    }

    #[test]
    fn conversation_completion_email_blank_request_recipient_falls_back_to_saved_recipient() {
        let settings = EmailSenderSettings {
            enabled: true,
            provider: EmailSenderProvider::Custom,
            sender_email: "sender@example.com".to_string(),
            smtp_host: "smtp.example.com".to_string(),
            username: "sender@example.com".to_string(),
            recipient_email: "saved-recipient@example.com".to_string(),
            ..EmailSenderSettings::default()
        };
        let (_, _, send_request) = prepare_conversation_completion_email(
            settings,
            SendConversationCompletionEmailRequest {
                workspace_id: "workspace-1".to_string(),
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                subject: "Moss conversation completed".to_string(),
                text_body: "Assistant answer".to_string(),
                recipient: Some("   ".to_string()),
            },
            &MemoryEmailSecretStore::with_secret("stored-secret"),
        )
        .expect("prepared conversation email");

        assert_eq!(send_request.to, "saved-recipient@example.com");
    }

    #[test]
    fn conversation_completion_email_rejects_multiline_subject_before_secret_lookup() {
        let settings = EmailSenderSettings {
            enabled: true,
            recipient_email: "saved-recipient@example.com".to_string(),
            ..EmailSenderSettings::default()
        };
        let store = MemoryEmailSecretStore::with_secret("stored-secret");
        let error = prepare_conversation_completion_email(
            settings,
            SendConversationCompletionEmailRequest {
                workspace_id: "workspace-1".to_string(),
                thread_id: "thread-1".to_string(),
                turn_id: "turn-1".to_string(),
                subject: "Moss conversation\ncompleted".to_string(),
                text_body: "Assistant answer".to_string(),
                recipient: None,
            },
            &store,
        )
        .expect_err("multiline subject should be rejected");

        assert_eq!(error.code, EmailSendErrorCode::NotConfigured);
        assert_eq!(store.calls(), Vec::<&'static str>::new());
    }
}

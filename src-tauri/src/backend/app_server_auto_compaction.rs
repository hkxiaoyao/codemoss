use serde_json::Value;

pub(super) const AUTO_COMPACTION_THRESHOLD_PERCENT: f64 = 92.0;
const AUTO_COMPACTION_TARGET_PERCENT: f64 = 70.0;
const AUTO_COMPACTION_COOLDOWN_MS: u64 = 90_000;
const AUTO_COMPACTION_INFLIGHT_TIMEOUT_MS: u64 = 120_000;

#[derive(Debug, Default, Clone)]
pub(super) struct AutoCompactionThreadState {
    pub(super) is_processing: bool,
    pub(super) in_flight: bool,
    last_triggered_at_ms: u64,
}

fn read_number_field(obj: &Value, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|key| {
        obj.get(*key).and_then(|value| {
            value
                .as_f64()
                .or_else(|| value.as_i64().map(|v| v as f64))
                .or_else(|| value.as_u64().map(|v| v as f64))
                .or_else(|| value.as_str().and_then(|v| v.trim().parse::<f64>().ok()))
        })
    })
}

pub(super) fn extract_compaction_usage_percent(value: &Value) -> Option<f64> {
    let method = super::extract_event_method(value)?;
    let params = value.get("params")?;
    let (used_tokens, context_window) = if method == "token_count" {
        let info = params.get("info")?;
        let last_usage = info
            .get("last_token_usage")
            .or_else(|| info.get("lastTokenUsage"))
            .filter(|usage| usage.is_object());
        let usage = last_usage?;
        let input_tokens =
            read_number_field(usage, &["input_tokens", "inputTokens"]).unwrap_or(0.0);
        let cached_tokens = read_number_field(
            usage,
            &[
                "cached_input_tokens",
                "cache_read_input_tokens",
                "cachedInputTokens",
                "cacheReadInputTokens",
            ],
        )
        .unwrap_or(0.0);
        let used_tokens = input_tokens + cached_tokens;
        let context_window = read_number_field(
            usage,
            &[
                "model_context_window",
                "modelContextWindow",
                "context_window",
            ],
        )
        .or_else(|| read_number_field(info, &["model_context_window", "modelContextWindow"]))
        .unwrap_or(200_000.0);
        (used_tokens, context_window)
    } else if method == "thread/tokenUsage/updated" {
        let usage = params
            .get("tokenUsage")
            .or_else(|| params.get("token_usage"))
            .unwrap_or(&Value::Null);
        let snapshot = usage.get("last").filter(|value| value.is_object())?;
        let input_tokens =
            read_number_field(snapshot, &["inputTokens", "input_tokens"]).unwrap_or(0.0);
        let cached_tokens = read_number_field(
            snapshot,
            &[
                "cachedInputTokens",
                "cached_input_tokens",
                "cacheReadInputTokens",
                "cache_read_input_tokens",
            ],
        )
        .unwrap_or(0.0);
        let used_tokens = input_tokens + cached_tokens;
        let context_window = read_number_field(
            usage,
            &[
                "modelContextWindow",
                "model_context_window",
                "context_window",
            ],
        )
        .unwrap_or(200_000.0);
        (used_tokens, context_window)
    } else {
        return None;
    };
    if context_window <= 0.0 {
        return None;
    }
    Some((used_tokens / context_window) * 100.0)
}

pub(super) fn is_codex_thread_id(thread_id: &str) -> bool {
    let normalized = thread_id.trim();
    if normalized.is_empty() {
        return false;
    }
    !normalized.starts_with("claude:")
        && !normalized.starts_with("claude-pending-")
        && !normalized.starts_with("opencode:")
        && !normalized.starts_with("opencode-pending-")
        && !normalized.starts_with("gemini:")
        && !normalized.starts_with("gemini-pending-")
}

pub(super) fn evaluate_auto_compaction_state(
    state: &mut AutoCompactionThreadState,
    method: &str,
    usage_percent: Option<f64>,
    threshold_percent: f64,
    auto_compaction_enabled: bool,
    now: u64,
) -> bool {
    match method {
        "turn/started" => {
            state.is_processing = true;
        }
        "turn/completed" | "turn/error" => {
            state.is_processing = false;
        }
        "thread/compacted" => {
            state.is_processing = false;
            state.in_flight = false;
        }
        "thread/compactionFailed" => {
            state.in_flight = false;
        }
        _ => {}
    }

    let Some(percent) = usage_percent else {
        return false;
    };
    if !auto_compaction_enabled {
        return false;
    }
    if percent <= AUTO_COMPACTION_TARGET_PERCENT {
        return false;
    }
    if percent < threshold_percent {
        return false;
    }

    if state.in_flight
        && now.saturating_sub(state.last_triggered_at_ms) > AUTO_COMPACTION_INFLIGHT_TIMEOUT_MS
    {
        state.in_flight = false;
    }

    if state.in_flight || state.is_processing {
        return false;
    }
    if now.saturating_sub(state.last_triggered_at_ms) < AUTO_COMPACTION_COOLDOWN_MS {
        return false;
    }

    state.in_flight = true;
    state.last_triggered_at_ms = now;
    true
}

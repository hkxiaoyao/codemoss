use super::*;

pub(super) fn build_thread_compacting_event(thread_id: &str, usage_percent: f64) -> Value {
    json!({
        "method": "thread/compacting",
        "params": {
            "threadId": thread_id,
            "thread_id": thread_id,
            "auto": true,
            "usagePercent": usage_percent,
            "usage_percent": usage_percent,
            "thresholdPercent": AUTO_COMPACTION_THRESHOLD_PERCENT,
            "threshold_percent": AUTO_COMPACTION_THRESHOLD_PERCENT,
            "targetPercent": AUTO_COMPACTION_TARGET_PERCENT,
            "target_percent": AUTO_COMPACTION_TARGET_PERCENT
        }
    })
}

pub(super) fn build_thread_compaction_failed_event(thread_id: &str, reason: &str) -> Value {
    json!({
        "method": "thread/compactionFailed",
        "params": {
            "threadId": thread_id,
            "thread_id": thread_id,
            "auto": true,
            "reason": reason
        }
    })
}

pub(super) fn build_late_turn_started_event(value: &Value) -> Option<Value> {
    let turn = value
        .get("result")
        .and_then(|result| result.get("turn"))
        .or_else(|| value.get("turn"))?;
    let thread_id = turn
        .get("threadId")
        .or_else(|| turn.get("thread_id"))
        .and_then(Value::as_str)?
        .trim()
        .to_string();
    if thread_id.is_empty() {
        return None;
    }
    let turn_id = turn
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    Some(json!({
        "method": "turn/started",
        "params": {
            "threadId": thread_id,
            "thread_id": thread_id,
            "turnId": turn_id,
            "turn_id": turn_id,
            "turn": turn.clone(),
            "lateResponse": true,
            "late_response": true,
        }
    }))
}

fn extract_response_error_payload(value: &Value) -> Option<Value> {
    value.get("error").cloned().or_else(|| {
        value
            .get("result")
            .and_then(|result| result.get("error"))
            .cloned()
    })
}

pub(super) fn build_late_turn_error_event(
    value: &Value,
    request: &TimedOutRequest,
) -> Option<Value> {
    let thread_id = request.thread_id.as_deref()?.trim();
    if thread_id.is_empty() {
        return None;
    }

    let late_error = match extract_response_error_payload(value) {
        Some(Value::Object(object)) => {
            let mut payload = object.clone();
            let message_missing = payload
                .get("message")
                .and_then(Value::as_str)
                .map(|message| message.trim().is_empty())
                .unwrap_or(true);
            if message_missing {
                payload.insert(
                    "message".to_string(),
                    Value::String("Turn failed to start".to_string()),
                );
            }
            payload.insert("lateResponse".to_string(), Value::Bool(true));
            payload.insert("late_response".to_string(), Value::Bool(true));
            Value::Object(payload)
        }
        Some(Value::String(message)) => json!({
            "message": message,
            "lateResponse": true,
            "late_response": true,
        }),
        Some(other) => json!({
            "message": other.to_string(),
            "lateResponse": true,
            "late_response": true,
        }),
        None => json!({
            "message": "Turn failed to start",
            "lateResponse": true,
            "late_response": true,
        }),
    };

    Some(json!({
        "method": "turn/error",
        "params": {
            "threadId": thread_id,
            "thread_id": thread_id,
            "turnId": Value::Null,
            "turn_id": Value::Null,
            "error": late_error,
            "willRetry": false,
            "will_retry": false,
            "lateResponse": true,
            "late_response": true,
        }
    }))
}

pub(super) fn response_error_message(value: &Value) -> Option<String> {
    value
        .get("error")
        .and_then(|error| {
            error
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| error.as_str())
        })
        .or_else(|| {
            value
                .get("result")
                .and_then(|result| result.get("error"))
                .and_then(|error| {
                    error
                        .get("message")
                        .and_then(Value::as_str)
                        .or_else(|| error.as_str())
                })
        })
        .map(ToString::to_string)
}

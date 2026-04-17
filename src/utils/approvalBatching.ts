import type { ApprovalRequest } from "../types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstNonEmptyString(
  source: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getApprovalRootRecord(request: ApprovalRequest) {
  return asRecord(request.params);
}

function getApprovalInputRecord(request: ApprovalRequest) {
  const root = getApprovalRootRecord(request);
  const nested = asRecord(root.input);
  return Object.keys(nested).length ? nested : root;
}

export function getApprovalTurnId(request: ApprovalRequest): string | null {
  const root = getApprovalRootRecord(request);
  const input = getApprovalInputRecord(request);
  return (
    firstNonEmptyString(root, ["turnId", "turn_id"]) ??
    firstNonEmptyString(input, ["turnId", "turn_id"])
  );
}

export function getApprovalThreadId(request: ApprovalRequest): string | null {
  const root = getApprovalRootRecord(request);
  const input = getApprovalInputRecord(request);
  return (
    firstNonEmptyString(root, ["threadId", "thread_id"]) ??
    firstNonEmptyString(input, ["threadId", "thread_id"])
  );
}

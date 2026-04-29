import { describe, expect, it } from "vitest";
import { resolveCompletionEmailIntentThreadId } from "./completionEmailIntent";

describe("resolveCompletionEmailIntentThreadId", () => {
  it("keeps the requested thread when the intent already matches it", () => {
    const threadId = resolveCompletionEmailIntentThreadId(
      "thread-1",
      { "thread-1": { status: "armed" } },
      (value) => value,
    );

    expect(threadId).toBe("thread-1");
  });

  it("falls back to the canonical alias when the pending thread has been finalized", () => {
    const threadId = resolveCompletionEmailIntentThreadId(
      "codex-pending-1",
      { "codex:session-1": { status: "armed" } },
      () => "codex:session-1",
    );

    expect(threadId).toBe("codex:session-1");
  });

  it("returns the requested thread when no intent exists for either id", () => {
    const threadId = resolveCompletionEmailIntentThreadId(
      "codex-pending-1",
      {},
      () => "codex:session-1",
    );

    expect(threadId).toBe("codex-pending-1");
  });
});

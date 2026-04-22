import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import { initialState, threadReducer } from "./useThreadsReducer";

describe("threadReducer inline code snapshot dedupe", () => {
  it("dedupes repeated completed snapshot that contains multiple inline code spans", () => {
    const itemId = "assistant-inline-code-duplicate-complete-1";
    const readable =
      "`computer_use` 修复已提交, commit hash 是 a06c730c。我继续补 `journal record`, 然后再提测试和 `changelog`。";
    const withStreamedPrefix = threadReducer(initialState, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId,
      delta: "`computer_use` 修复已提交, commit hash 是 a06c730c。",
      hasCustomName: false,
    });
    const completed = threadReducer(withStreamedPrefix, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId,
      text: `${readable} ${readable}`,
      hasCustomName: false,
    });

    const messages = (completed.itemsByThread["thread-1"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "message" }> =>
        item.kind === "message" && item.role === "assistant" && item.id === itemId,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe(readable);
  });
});

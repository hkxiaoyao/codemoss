import { describe, expect, it } from "vitest";
import type { ThreadState } from "./useThreadsReducer";
import { initialState, threadReducer } from "./useThreadsReducer";

describe("threadReducer history restore", () => {
  it("preserves the local Codex compaction message through history reconcile", () => {
    const base: ThreadState = {
      ...initialState,
      itemsByThread: {
        "thread-1": [
          {
            id: "assistant-history-1",
            kind: "message",
            role: "assistant",
            text: "之前的回答",
          },
          {
            id: "context-compacted-codex-compact-thread-1",
            kind: "message",
            role: "assistant",
            text: "Codex 已压缩背景信息",
            engineSource: "codex",
          },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "setThreadItems",
      threadId: "thread-1",
      items: [
        {
          id: "assistant-history-1",
          kind: "message",
          role: "assistant",
          text: "之前的回答",
        },
        {
          id: "assistant-history-2",
          kind: "message",
          role: "assistant",
          text: "新的历史补帧",
        },
      ],
    });

    expect(next.itemsByThread["thread-1"]).toEqual([
      {
        id: "assistant-history-1",
        kind: "message",
        role: "assistant",
        text: "之前的回答",
      },
      {
        id: "context-compacted-codex-compact-thread-1",
        kind: "message",
        role: "assistant",
        text: "Codex 已压缩背景信息",
        engineSource: "codex",
      },
      {
        id: "assistant-history-2",
        kind: "message",
        role: "assistant",
        text: "新的历史补帧",
      },
    ]);
  });
});

// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";
import { resumeThread } from "../../../services/tauri";
import { buildItemsFromThread } from "../../../utils/threadItems";
import { renderActions } from "./useThreadActions.test-utils";

vi.mock("../../../services/tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../services/tauri")>();
  return {
    ...actual,
    resumeThread: vi.fn(),
  };
});

vi.mock("../../../utils/threadItems", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../utils/threadItems")>();
  return {
    ...actual,
    buildItemsFromThread: vi.fn(),
    extractClaudeApprovalResumeEntries: vi.fn(() => []),
    getThreadTimestamp: vi.fn(),
    isReviewingFromThread: vi.fn(),
    mergeThreadItems: vi.fn(),
    previewThreadName: vi.fn(),
    normalizeItem: vi.fn((item: ConversationItem) => item),
    stripClaudeApprovalResumeArtifacts: vi.fn((text: string) => text),
  };
});

describe("useThreadActions history restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks history restored even when resume keeps existing local items", async () => {
    const localAssistantItem: ConversationItem = {
      id: "assistant-local-1",
      kind: "message",
      role: "assistant",
      text: "Local cached answer",
    };

    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: { id: "thread-local", preview: "preview", updated_at: 555 },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([
      {
        id: "assistant-remote-1",
        kind: "message",
        role: "assistant",
        text: "Remote answer",
      },
    ]);

    const { result, dispatch, loadedThreadsRef } = renderActions({
      itemsByThread: {
        "thread-local": [localAssistantItem],
      },
    });

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-local");
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "setThreadHistoryRestoredAt",
        threadId: "thread-local",
      }),
    );
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "setThreadItems",
        threadId: "thread-local",
      }),
    );
    expect(loadedThreadsRef.current["thread-local"]).toBe(true);
  });
});

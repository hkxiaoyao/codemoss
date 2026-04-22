// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageRow, ReasoningRow } from "./MessagesRows";
import { parseReasoning } from "./messagesReasoning";

const markdownCalls = vi.hoisted(() => ({
  calls: [] as Array<{ streamingThrottleMs?: number; value: string }>,
}));

vi.mock("./Markdown", () => ({
  Markdown: ({
    streamingThrottleMs,
    value,
  }: {
    streamingThrottleMs?: number;
    value: string;
  }) => {
    markdownCalls.calls.push({ streamingThrottleMs, value });
    return (
      <div
        data-testid="markdown"
        data-throttle={streamingThrottleMs ?? -1}
      >
        {value}
      </div>
    );
  },
}));

describe("MessagesRows stream mitigation", () => {
  beforeEach(() => {
    markdownCalls.calls = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("raises assistant markdown throttle only when mitigation is active", () => {
    const messageItem = {
      id: "assistant-1",
      kind: "message" as const,
      role: "assistant" as const,
      text: "streaming output",
    };

    const { rerender } = render(
      <MessageRow
        item={messageItem}
        isStreaming
        isCopied={false}
        onCopy={vi.fn()}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("48");

    rerender(
      <MessageRow
        item={messageItem}
        isStreaming
        isCopied={false}
        onCopy={vi.fn()}
        streamMitigationProfile={{
          id: "claude-qwen-windows-render-safe",
          messageStreamingThrottleMs: 120,
          reasoningStreamingThrottleMs: 260,
        }}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("120");
  });

  it("raises reasoning markdown throttle only when mitigation is active", () => {
    const reasoningItem = {
      id: "reasoning-1",
      kind: "reasoning" as const,
      summary: "Planning",
      content: "Reasoning body",
    };

    const { rerender } = render(
      <ReasoningRow
        item={reasoningItem}
        parsed={parseReasoning(reasoningItem)}
        isExpanded
        isLive
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("180");

    rerender(
      <ReasoningRow
        item={reasoningItem}
        parsed={parseReasoning(reasoningItem)}
        isExpanded
        isLive
        onToggle={vi.fn()}
        streamMitigationProfile={{
          id: "claude-qwen-windows-render-safe",
          messageStreamingThrottleMs: 120,
          reasoningStreamingThrottleMs: 260,
        }}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("260");
  });
});

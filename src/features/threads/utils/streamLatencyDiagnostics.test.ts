import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentClaudeConfig: vi.fn(),
  appendRendererDiagnostic: vi.fn(),
  isWindowsPlatform: vi.fn(),
  isMacPlatform: vi.fn(),
}));

vi.mock("../../../services/tauri", () => ({
  getCurrentClaudeConfig: mocks.getCurrentClaudeConfig,
}));

vi.mock("../../../services/rendererDiagnostics", () => ({
  appendRendererDiagnostic: mocks.appendRendererDiagnostic,
}));

vi.mock("../../../utils/platform", () => ({
  isWindowsPlatform: mocks.isWindowsPlatform,
  isMacPlatform: mocks.isMacPlatform,
}));

import {
  getThreadStreamLatencySnapshot,
  noteThreadDeltaReceived,
  noteThreadTurnStarted,
  noteThreadVisibleRender,
  primeThreadStreamLatencyContext,
  reportThreadUpstreamPending,
  resetThreadStreamLatencyDiagnosticsForTests,
  resolveActiveThreadStreamMitigation,
} from "./streamLatencyDiagnostics";

describe("streamLatencyDiagnostics", () => {
  beforeEach(() => {
    mocks.getCurrentClaudeConfig.mockReset();
    mocks.appendRendererDiagnostic.mockReset();
    mocks.isWindowsPlatform.mockReset();
    mocks.isMacPlatform.mockReset();
    mocks.isWindowsPlatform.mockReturnValue(false);
    mocks.isMacPlatform.mockReturnValue(false);
    resetThreadStreamLatencyDiagnosticsForTests();
  });

  it("activates the Qwen Windows mitigation only after render amplification evidence appears", async () => {
    mocks.isWindowsPlatform.mockReturnValue(true);
    mocks.getCurrentClaudeConfig.mockResolvedValue({
      apiKey: "",
      baseUrl: "https://dashscope.aliyuncs.com/apps/anthropic",
      providerId: "qwen",
      providerName: "Qwen",
    });

    await primeThreadStreamLatencyContext({
      workspaceId: "ws-1",
      threadId: "thread-1",
      engine: "claude",
      model: "qwen3.6-plus",
    });

    noteThreadTurnStarted({
      workspaceId: "ws-1",
      threadId: "thread-1",
      turnId: "turn-1",
      startedAt: 1_000,
    });
    noteThreadDeltaReceived("thread-1", 1_100);
    noteThreadVisibleRender("thread-1", {
      visibleItemCount: 2,
      renderAt: 1_340,
    });

    const snapshot = getThreadStreamLatencySnapshot("thread-1");
    const mitigation = resolveActiveThreadStreamMitigation(snapshot);

    expect(snapshot?.latencyCategory).toBe("render-amplification");
    expect(snapshot?.firstVisibleRenderAfterDeltaMs).toBe(240);
    expect(mitigation?.id).toBe("claude-qwen-windows-render-safe");
    expect(mitigation?.messageStreamingThrottleMs).toBe(120);
    expect(mitigation?.reasoningStreamingThrottleMs).toBe(260);
    expect(mocks.appendRendererDiagnostic).toHaveBeenCalledWith(
      "stream-latency/mitigation-activated",
      expect.objectContaining({
        providerId: "qwen",
        model: "qwen3.6-plus",
        platform: "windows",
        latencyCategory: "render-amplification",
      }),
    );
  });

  it("keeps unmatched providers on the baseline path even when render amplification is observed", async () => {
    mocks.isWindowsPlatform.mockReturnValue(true);
    mocks.getCurrentClaudeConfig.mockResolvedValue({
      apiKey: "",
      baseUrl: "https://api.anthropic.test",
      providerId: "custom",
      providerName: "Custom Provider",
    });

    await primeThreadStreamLatencyContext({
      workspaceId: "ws-1",
      threadId: "thread-2",
      engine: "claude",
      model: "claude-sonnet-4.5",
    });

    noteThreadTurnStarted({
      workspaceId: "ws-1",
      threadId: "thread-2",
      turnId: "turn-2",
      startedAt: 2_000,
    });
    noteThreadDeltaReceived("thread-2", 2_120);
    noteThreadVisibleRender("thread-2", {
      visibleItemCount: 2,
      renderAt: 2_360,
    });

    const snapshot = getThreadStreamLatencySnapshot("thread-2");

    expect(snapshot?.latencyCategory).toBe("render-amplification");
    expect(resolveActiveThreadStreamMitigation(snapshot)).toBeNull();
  });

  it("records upstream-pending diagnostics with correlated provider dimensions", async () => {
    mocks.isWindowsPlatform.mockReturnValue(true);
    mocks.getCurrentClaudeConfig.mockResolvedValue({
      apiKey: "",
      baseUrl: "https://dashscope.aliyuncs.com/apps/anthropic",
      providerId: "qwen",
      providerName: "Qwen",
    });

    await primeThreadStreamLatencyContext({
      workspaceId: "ws-1",
      threadId: "thread-3",
      engine: "claude",
      model: "qwen3-max",
    });

    noteThreadTurnStarted({
      workspaceId: "ws-1",
      threadId: "thread-3",
      turnId: "turn-3",
      startedAt: 3_000,
    });

    reportThreadUpstreamPending("thread-3", {
      elapsedMs: 6_000,
      diagnosticCategory: "first-token-delay",
    });

    expect(mocks.appendRendererDiagnostic).toHaveBeenCalledWith(
      "stream-latency/upstream-pending",
      expect.objectContaining({
        workspaceId: "ws-1",
        threadId: "thread-3",
        turnId: "turn-3",
        providerId: "qwen",
        model: "qwen3-max",
        platform: "windows",
        diagnosticCategory: "first-token-delay",
      }),
    );
  });

  it("clears stale provider fingerprint when a newer non-claude turn primes the same thread", async () => {
    let resolveConfig: ((value: {
      apiKey: string;
      baseUrl: string;
      providerId: string;
      providerName: string;
    }) => void) | null = null;
    mocks.getCurrentClaudeConfig.mockReturnValueOnce(
      new Promise<{
        apiKey: string;
        baseUrl: string;
        providerId: string;
        providerName: string;
      }>((resolve) => {
        resolveConfig = resolve;
      }),
    );

    const pendingPrime = primeThreadStreamLatencyContext({
      workspaceId: "ws-1",
      threadId: "thread-4",
      engine: "claude",
      model: "qwen3-max",
    });

    await primeThreadStreamLatencyContext({
      workspaceId: "ws-1",
      threadId: "thread-4",
      engine: "codex",
      model: "gpt-5.4",
    });

    expect(resolveConfig).toBeTypeOf("function");
    if (!resolveConfig) {
      throw new Error("expected pending config resolver");
    }
    const applyConfig: (value: {
      apiKey: string;
      baseUrl: string;
      providerId: string;
      providerName: string;
    }) => void = resolveConfig;
    applyConfig({
      apiKey: "",
      baseUrl: "https://dashscope.aliyuncs.com/apps/anthropic",
      providerId: "qwen",
      providerName: "Qwen",
    });
    await pendingPrime;

    expect(getThreadStreamLatencySnapshot("thread-4")).toMatchObject({
      engine: "codex",
      model: "gpt-5.4",
      providerId: null,
      providerName: null,
      baseUrl: null,
    });
  });

  it("clears previous provider fingerprint when claude config refresh fails", async () => {
    mocks.getCurrentClaudeConfig.mockResolvedValueOnce({
      apiKey: "",
      baseUrl: "https://dashscope.aliyuncs.com/apps/anthropic",
      providerId: "qwen",
      providerName: "Qwen",
    });
    await primeThreadStreamLatencyContext({
      workspaceId: "ws-1",
      threadId: "thread-5",
      engine: "claude",
      model: "qwen3-max",
    });

    mocks.getCurrentClaudeConfig.mockRejectedValueOnce(new Error("network down"));
    await primeThreadStreamLatencyContext({
      workspaceId: "ws-1",
      threadId: "thread-5",
      engine: "claude",
      model: "claude-sonnet-4.5",
    });

    expect(getThreadStreamLatencySnapshot("thread-5")).toMatchObject({
      engine: "claude",
      model: "claude-sonnet-4.5",
      providerId: null,
      providerName: null,
      baseUrl: null,
    });
  });
});

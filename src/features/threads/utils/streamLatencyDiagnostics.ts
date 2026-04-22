import { useSyncExternalStore } from "react";
import { appendRendererDiagnostic } from "../../../services/rendererDiagnostics";
import { getCurrentClaudeConfig } from "../../../services/tauri";
import { isMacPlatform, isWindowsPlatform } from "../../../utils/platform";
import type { ConversationEngine } from "../contracts/conversationCurtainContracts";

export type StreamPlatform = "windows" | "macos" | "linux" | "unknown";
export type StreamLatencyCategory = "upstream-pending" | "render-amplification";
export type StreamMitigationProfileId = "claude-qwen-windows-render-safe";

export type StreamMitigationProfile = {
  id: StreamMitigationProfileId;
  messageStreamingThrottleMs: number;
  reasoningStreamingThrottleMs: number;
};

export type ThreadStreamLatencySnapshot = {
  threadId: string;
  workspaceId: string | null;
  turnId: string | null;
  engine: ConversationEngine | null;
  model: string | null;
  providerId: string | null;
  providerName: string | null;
  baseUrl: string | null;
  platform: StreamPlatform;
  startedAt: number | null;
  firstDeltaAt: number | null;
  lastDeltaAt: number | null;
  pendingRenderSinceDeltaAt: number | null;
  deltaCount: number;
  cadenceSamplesMs: number[];
  firstVisibleRenderAt: number | null;
  firstVisibleRenderAfterDeltaMs: number | null;
  lastRenderLagMs: number | null;
  latencyCategory: StreamLatencyCategory | null;
  mitigationProfile: StreamMitigationProfileId | null;
  mitigationReason: string | null;
  upstreamPendingReported: boolean;
  renderAmplificationReported: boolean;
};

const CADENCE_SAMPLE_LIMIT = 12;
const RENDER_AMPLIFICATION_THRESHOLD_MS = 160;
const STREAM_MITIGATION_DISABLE_FLAG_KEY = "ccgui.debug.streamMitigation.disabled";

const STREAM_MITIGATION_PROFILES: Readonly<Record<StreamMitigationProfileId, StreamMitigationProfile>> = {
  "claude-qwen-windows-render-safe": {
    id: "claude-qwen-windows-render-safe",
    messageStreamingThrottleMs: 120,
    reasoningStreamingThrottleMs: 260,
  },
};

const snapshotByThread = new Map<string, ThreadStreamLatencySnapshot>();
const latestProviderConfigRequestByThread = new Map<string, number>();
const snapshotListeners = new Set<() => void>();

function notifySnapshotListeners() {
  snapshotListeners.forEach((listener) => {
    listener();
  });
}

function normalizeNullableString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function createInitialSnapshot(threadId: string): ThreadStreamLatencySnapshot {
  return {
    threadId,
    workspaceId: null,
    turnId: null,
    engine: null,
    model: null,
    providerId: null,
    providerName: null,
    baseUrl: null,
    platform: "unknown",
    startedAt: null,
    firstDeltaAt: null,
    lastDeltaAt: null,
    pendingRenderSinceDeltaAt: null,
    deltaCount: 0,
    cadenceSamplesMs: [],
    firstVisibleRenderAt: null,
    firstVisibleRenderAfterDeltaMs: null,
    lastRenderLagMs: null,
    latencyCategory: null,
    mitigationProfile: null,
    mitigationReason: null,
    upstreamPendingReported: false,
    renderAmplificationReported: false,
  };
}

function getOrCreateSnapshot(threadId: string) {
  return snapshotByThread.get(threadId) ?? createInitialSnapshot(threadId);
}

function updateThreadSnapshot(
  threadId: string,
  updater: (snapshot: ThreadStreamLatencySnapshot) => ThreadStreamLatencySnapshot,
) {
  const current = getOrCreateSnapshot(threadId);
  const next = updater(current);
  if (next === current) {
    return current;
  }
  snapshotByThread.set(threadId, next);
  notifySnapshotListeners();
  return next;
}

function appendCadenceSample(samples: number[], nextSampleMs: number) {
  const sample = Math.max(0, nextSampleMs);
  const nextSamples = [...samples, sample];
  return nextSamples.length > CADENCE_SAMPLE_LIMIT
    ? nextSamples.slice(nextSamples.length - CADENCE_SAMPLE_LIMIT)
    : nextSamples;
}

function resolvePlatform(): StreamPlatform {
  if (isWindowsPlatform()) {
    return "windows";
  }
  if (isMacPlatform()) {
    return "macos";
  }
  if (typeof navigator !== "undefined") {
    const normalizedPlatform = (
      (
        navigator as Navigator & {
          userAgentData?: { platform?: string };
        }
      ).userAgentData?.platform ??
      navigator.platform ??
      ""
    ).toLowerCase();
    if (normalizedPlatform.includes("linux")) {
      return "linux";
    }
  }
  return "unknown";
}

function summarizeCadence(samples: number[]) {
  if (!samples.length) {
    return {
      chunkCadenceAvgMs: null,
      chunkCadenceMaxMs: null,
    };
  }
  const total = samples.reduce((sum, sample) => sum + sample, 0);
  return {
    chunkCadenceAvgMs: Number((total / samples.length).toFixed(1)),
    chunkCadenceMaxMs: Math.max(...samples),
  };
}

function isStreamMitigationDisabled() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const value = window.localStorage.getItem(STREAM_MITIGATION_DISABLE_FLAG_KEY);
    if (!value) {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "on";
  } catch {
    return false;
  }
}

export function matchesQwenCompatibleClaudeWindowsFingerprint(
  snapshot: Pick<
    ThreadStreamLatencySnapshot,
    "engine" | "platform" | "providerId" | "providerName" | "baseUrl" | "model"
  >,
) {
  if (snapshot.engine !== "claude" || snapshot.platform !== "windows") {
    return false;
  }
  const providerId = normalizeNullableString(snapshot.providerId)?.toLowerCase() ?? "";
  const providerName = normalizeNullableString(snapshot.providerName)?.toLowerCase() ?? "";
  const baseUrl = normalizeNullableString(snapshot.baseUrl)?.toLowerCase() ?? "";
  const model = normalizeNullableString(snapshot.model)?.toLowerCase() ?? "";
  return (
    providerId === "qwen" ||
    providerName.includes("qwen") ||
    baseUrl.includes("dashscope.aliyuncs.com/apps/anthropic") ||
    model.includes("qwen")
  );
}

export function getThreadStreamLatencySnapshot(threadId: string | null) {
  if (!threadId) {
    return null;
  }
  return snapshotByThread.get(threadId) ?? null;
}

function buildCorrelationPayload(
  snapshot: ThreadStreamLatencySnapshot,
  extra: Record<string, unknown> = {},
) {
  const cadenceSummary = summarizeCadence(snapshot.cadenceSamplesMs);
  return {
    workspaceId: snapshot.workspaceId,
    threadId: snapshot.threadId,
    turnId: snapshot.turnId,
    engine: snapshot.engine,
    providerId: snapshot.providerId,
    providerName: snapshot.providerName,
    baseUrl: snapshot.baseUrl,
    model: snapshot.model,
    platform: snapshot.platform,
    firstDeltaAtMs:
      snapshot.startedAt !== null && snapshot.firstDeltaAt !== null
        ? Math.max(0, snapshot.firstDeltaAt - snapshot.startedAt)
        : null,
    firstVisibleRenderAtMs:
      snapshot.startedAt !== null && snapshot.firstVisibleRenderAt !== null
        ? Math.max(0, snapshot.firstVisibleRenderAt - snapshot.startedAt)
        : null,
    firstVisibleRenderAfterDeltaMs: snapshot.firstVisibleRenderAfterDeltaMs,
    lastRenderLagMs: snapshot.lastRenderLagMs,
    deltaCount: snapshot.deltaCount,
    latencyCategory: snapshot.latencyCategory,
    mitigationProfile: snapshot.mitigationProfile,
    mitigationReason: snapshot.mitigationReason,
    ...cadenceSummary,
    ...extra,
  };
}

export function buildThreadStreamCorrelationDimensions(threadId: string | null) {
  const snapshot = getThreadStreamLatencySnapshot(threadId);
  if (!snapshot) {
    return {
      engine: null,
      providerId: null,
      providerName: null,
      baseUrl: null,
      model: null,
      platform: resolvePlatform(),
      firstVisibleRenderAtMs: null,
      firstVisibleRenderAfterDeltaMs: null,
      lastRenderLagMs: null,
      chunkCadenceAvgMs: null,
      chunkCadenceMaxMs: null,
      latencyCategory: null,
      mitigationProfile: null,
      mitigationReason: null,
    };
  }
  const {
    workspaceId: _workspaceId,
    threadId: _threadId,
    turnId: _turnId,
    deltaCount: _deltaCount,
    ...dimensions
  } = buildCorrelationPayload(snapshot);
  return dimensions;
}

export async function primeThreadStreamLatencyContext(input: {
  workspaceId: string;
  threadId: string;
  engine: ConversationEngine;
  model?: string | null;
}) {
  const requestId = (latestProviderConfigRequestByThread.get(input.threadId) ?? 0) + 1;
  latestProviderConfigRequestByThread.set(input.threadId, requestId);
  const normalizedModel = normalizeNullableString(input.model);
  updateThreadSnapshot(input.threadId, (current) => ({
    ...current,
    workspaceId: input.workspaceId,
    engine: input.engine,
    model: normalizedModel,
    platform: resolvePlatform(),
    providerId: null,
    providerName: null,
    baseUrl: null,
  }));
  if (input.engine !== "claude") {
    return;
  }
  try {
    const config = await getCurrentClaudeConfig();
    if (latestProviderConfigRequestByThread.get(input.threadId) !== requestId) {
      return;
    }
    updateThreadSnapshot(input.threadId, (current) => ({
      ...current,
      providerId: normalizeNullableString(config.providerId),
      providerName: normalizeNullableString(config.providerName),
      baseUrl: normalizeNullableString(config.baseUrl),
    }));
  } catch {
    // Provider fingerprint is best effort. Diagnostics can still rely on model + platform.
  }
}

export function noteThreadTurnStarted(input: {
  workspaceId: string;
  threadId: string;
  turnId: string;
  startedAt?: number;
}) {
  const startedAt = input.startedAt ?? Date.now();
  updateThreadSnapshot(input.threadId, (current) => ({
    ...current,
    workspaceId: input.workspaceId,
    turnId: input.turnId,
    startedAt,
    firstDeltaAt: null,
    lastDeltaAt: null,
    pendingRenderSinceDeltaAt: null,
    deltaCount: 0,
    cadenceSamplesMs: [],
    firstVisibleRenderAt: null,
    firstVisibleRenderAfterDeltaMs: null,
    lastRenderLagMs: null,
    latencyCategory: null,
    mitigationProfile: null,
    mitigationReason: null,
    upstreamPendingReported: false,
    renderAmplificationReported: false,
  }));
}

export function noteThreadDeltaReceived(threadId: string, timestamp = Date.now()) {
  updateThreadSnapshot(threadId, (current) => {
    const cadenceSamplesMs =
      current.lastDeltaAt === null
        ? current.cadenceSamplesMs
        : appendCadenceSample(current.cadenceSamplesMs, timestamp - current.lastDeltaAt);
    return {
      ...current,
      firstDeltaAt: current.firstDeltaAt ?? timestamp,
      lastDeltaAt: timestamp,
      pendingRenderSinceDeltaAt: current.pendingRenderSinceDeltaAt ?? timestamp,
      deltaCount: current.deltaCount + 1,
      cadenceSamplesMs,
    };
  });
}

function maybeActivateMitigation(
  snapshot: ThreadStreamLatencySnapshot,
  renderLagMs: number,
  visibleItemCount: number,
) {
  if (snapshot.mitigationProfile || renderLagMs < RENDER_AMPLIFICATION_THRESHOLD_MS) {
    return snapshot;
  }
  if (!matchesQwenCompatibleClaudeWindowsFingerprint(snapshot)) {
    return snapshot;
  }
  if (isStreamMitigationDisabled()) {
    return snapshot;
  }
  const nextSnapshot: ThreadStreamLatencySnapshot = {
    ...snapshot,
    mitigationProfile: "claude-qwen-windows-render-safe",
    mitigationReason: "render-lag-after-first-delta",
  };
  appendRendererDiagnostic(
    "stream-latency/mitigation-activated",
    buildCorrelationPayload(nextSnapshot, {
      renderLagMs,
      visibleItemCount,
      activationReason: "render-lag-after-first-delta",
    }),
  );
  return nextSnapshot;
}

export function noteThreadVisibleRender(
  threadId: string,
  input: { visibleItemCount: number; renderAt?: number },
) {
  const renderAt = input.renderAt ?? Date.now();
  updateThreadSnapshot(threadId, (current) => {
    if (
      current.startedAt === null ||
      current.pendingRenderSinceDeltaAt === null ||
      current.firstDeltaAt === null
    ) {
      return current;
    }
    const renderLagMs = Math.max(0, renderAt - current.pendingRenderSinceDeltaAt);
    let nextSnapshot: ThreadStreamLatencySnapshot = {
      ...current,
      firstVisibleRenderAt: current.firstVisibleRenderAt ?? renderAt,
      firstVisibleRenderAfterDeltaMs:
        current.firstVisibleRenderAfterDeltaMs ?? renderLagMs,
      lastRenderLagMs: renderLagMs,
      pendingRenderSinceDeltaAt: null,
    };

    if (current.firstVisibleRenderAt === null) {
      appendRendererDiagnostic(
        "stream-latency/first-visible-render",
        buildCorrelationPayload(nextSnapshot, {
          renderLagMs,
          visibleItemCount: input.visibleItemCount,
        }),
      );
    }

    if (
      renderLagMs >= RENDER_AMPLIFICATION_THRESHOLD_MS &&
      !current.renderAmplificationReported
    ) {
      nextSnapshot = {
        ...nextSnapshot,
        latencyCategory: "render-amplification",
        renderAmplificationReported: true,
      };
      appendRendererDiagnostic(
        "stream-latency/render-amplification",
        buildCorrelationPayload(nextSnapshot, {
          renderLagMs,
          visibleItemCount: input.visibleItemCount,
          mitigationEligible: matchesQwenCompatibleClaudeWindowsFingerprint(nextSnapshot),
          mitigationSuppressed: isStreamMitigationDisabled() ? "disabled-flag" : null,
        }),
      );
      nextSnapshot = maybeActivateMitigation(
        nextSnapshot,
        renderLagMs,
        input.visibleItemCount,
      );
    }
    return nextSnapshot;
  });
}

export function reportThreadUpstreamPending(
  threadId: string,
  extra: Record<string, unknown> = {},
) {
  updateThreadSnapshot(threadId, (current) => {
    const nextSnapshot: ThreadStreamLatencySnapshot = current.upstreamPendingReported
      ? current
      : {
          ...current,
          latencyCategory: current.latencyCategory ?? "upstream-pending",
          upstreamPendingReported: true,
        };
    if (!current.upstreamPendingReported) {
      appendRendererDiagnostic(
        "stream-latency/upstream-pending",
        buildCorrelationPayload(nextSnapshot, extra),
      );
    }
    return nextSnapshot;
  });
}

export function completeThreadStreamTurn(threadId: string) {
  updateThreadSnapshot(threadId, (current) => ({
    ...current,
    turnId: null,
    startedAt: null,
    firstDeltaAt: null,
    lastDeltaAt: null,
    pendingRenderSinceDeltaAt: null,
    deltaCount: 0,
    cadenceSamplesMs: [],
    firstVisibleRenderAt: null,
    firstVisibleRenderAfterDeltaMs: null,
    lastRenderLagMs: null,
    latencyCategory: null,
    mitigationProfile: null,
    mitigationReason: null,
    upstreamPendingReported: false,
    renderAmplificationReported: false,
  }));
}

export function resolveActiveThreadStreamMitigation(
  snapshot: ThreadStreamLatencySnapshot | null,
) {
  if (!snapshot?.mitigationProfile || isStreamMitigationDisabled()) {
    return null;
  }
  return STREAM_MITIGATION_PROFILES[snapshot.mitigationProfile] ?? null;
}

function subscribeToThreadStreamLatencySnapshots(listener: () => void) {
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
}

export function useThreadStreamLatencySnapshot(threadId: string | null) {
  return useSyncExternalStore(
    subscribeToThreadStreamLatencySnapshots,
    () => (threadId ? snapshotByThread.get(threadId) ?? null : null),
    () => null,
  );
}

export function resetThreadStreamLatencyDiagnosticsForTests() {
  snapshotByThread.clear();
  latestProviderConfigRequestByThread.clear();
  notifySnapshotListeners();
}

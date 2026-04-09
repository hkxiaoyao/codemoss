import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationItem } from "../../../types";

export type StreamActivityPhase = "idle" | "waiting" | "ingress";

const DEFAULT_INGRESS_HOLD_MS = 950;
const FINGERPRINT_WINDOW_SIZE = 24;

function toItemFingerprint(item: ConversationItem): string {
  if (item.kind === "message") {
    return `m:${item.id}:${item.role}:${item.text.length}:${item.isFinal ? "1" : "0"}`;
  }
  if (item.kind === "reasoning") {
    return `r:${item.id}:${item.summary.length}:${item.content.length}`;
  }
  if (item.kind === "tool") {
    return `t:${item.id}:${item.status ?? ""}:${item.output?.length ?? 0}:${item.changes?.length ?? 0}`;
  }
  if (item.kind === "explore") {
    return `x:${item.id}:${item.status}:${item.entries.length}`;
  }
  if (item.kind === "diff") {
    return `d:${item.id}:${item.status ?? ""}:${item.diff.length}`;
  }
  return `v:${item.id}:${item.state}:${item.text.length}`;
}

function buildConversationFingerprint(items: ConversationItem[]): string {
  if (items.length === 0) {
    return "";
  }
  const sliceStart = Math.max(0, items.length - FINGERPRINT_WINDOW_SIZE);
  return items.slice(sliceStart).map(toItemFingerprint).join("|");
}

export function useStreamActivityPhase({
  isProcessing,
  items,
  ingressHoldMs = DEFAULT_INGRESS_HOLD_MS,
}: {
  isProcessing: boolean;
  items: ConversationItem[];
  ingressHoldMs?: number;
}): StreamActivityPhase {
  const fingerprint = useMemo(() => buildConversationFingerprint(items), [items]);
  const [phase, setPhase] = useState<StreamActivityPhase>(
    isProcessing ? "waiting" : "idle",
  );
  const previousFingerprintRef = useRef<string | null>(null);
  const lastIngressAtRef = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);
  const isProcessingRef = useRef(isProcessing);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isProcessing) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      previousFingerprintRef.current = fingerprint;
      lastIngressAtRef.current = 0;
      setPhase("idle");
      return;
    }

    const previousFingerprint = previousFingerprintRef.current;
    previousFingerprintRef.current = fingerprint;

    if (previousFingerprint !== null && previousFingerprint !== fingerprint) {
      lastIngressAtRef.current = Date.now();
      setPhase("ingress");
      return;
    }

    if (lastIngressAtRef.current <= 0) {
      setPhase("waiting");
      return;
    }

    const elapsed = Date.now() - lastIngressAtRef.current;
    setPhase(elapsed < ingressHoldMs ? "ingress" : "waiting");
  }, [fingerprint, ingressHoldMs, isProcessing]);

  useEffect(() => {
    if (!isProcessing || phase !== "ingress" || lastIngressAtRef.current <= 0) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    const elapsed = Date.now() - lastIngressAtRef.current;
    const remaining = Math.max(0, ingressHoldMs - elapsed);
    if (remaining <= 0) {
      setPhase("waiting");
      return;
    }

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      if (isProcessingRef.current) {
        setPhase("waiting");
      }
    }, remaining);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [fingerprint, ingressHoldMs, isProcessing, phase]);

  return phase;
}


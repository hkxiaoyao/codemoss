export const CODEX_AUTO_COMPACTION_THRESHOLD_DEFAULT_PERCENT = 92;

export const CODEX_AUTO_COMPACTION_THRESHOLD_OPTIONS = [
  92,
  100,
  110,
  120,
  130,
  140,
  150,
  160,
  170,
  180,
  190,
  200,
] as const;

const allowedCodexAutoCompactionThresholds = new Set<number>(
  CODEX_AUTO_COMPACTION_THRESHOLD_OPTIONS,
);

export function normalizeCodexAutoCompactionThresholdPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return CODEX_AUTO_COMPACTION_THRESHOLD_DEFAULT_PERCENT;
  }
  const normalized = Math.trunc(value as number);
  return allowedCodexAutoCompactionThresholds.has(normalized)
    ? normalized
    : CODEX_AUTO_COMPACTION_THRESHOLD_DEFAULT_PERCENT;
}

export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 2.6;
export const UI_SCALE_STEP = 0.1;
export const UI_SCALE_DEFAULT = 1;

export function clampUiScale(value: number) {
  if (!Number.isFinite(value)) {
    return UI_SCALE_DEFAULT;
  }
  const clamped = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, value));
  return Number(clamped.toFixed(2));
}

export function sanitizeUiScale(value: number) {
  if (!Number.isFinite(value)) {
    return UI_SCALE_DEFAULT;
  }
  if (value < UI_SCALE_MIN || value > UI_SCALE_MAX) {
    return UI_SCALE_DEFAULT;
  }
  return Number(value.toFixed(2));
}

export function formatUiScale(value: number) {
  return clampUiScale(value).toFixed(1);
}

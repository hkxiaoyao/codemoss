import { describe, expect, it } from "vitest";
import {
  clampUiScale,
  sanitizeUiScale,
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
} from "./uiScale";

describe("uiScale utilities", () => {
  it("clamps to supported range", () => {
    expect(clampUiScale(UI_SCALE_MIN - 0.2)).toBe(UI_SCALE_MIN);
    expect(clampUiScale(UI_SCALE_MAX + 0.2)).toBe(UI_SCALE_MAX);
  });

  it("retains supported precision values", () => {
    expect(clampUiScale(1.25)).toBe(1.25);
    expect(clampUiScale(2.6)).toBe(2.6);
  });

  it("sanitizes persisted invalid values to default", () => {
    expect(sanitizeUiScale(Number.NaN)).toBe(UI_SCALE_DEFAULT);
    expect(sanitizeUiScale(0.2)).toBe(UI_SCALE_DEFAULT);
    expect(sanitizeUiScale(2.7)).toBe(UI_SCALE_DEFAULT);
  });
});

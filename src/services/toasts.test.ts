import { describe, expect, it, vi } from "vitest";
import { pushErrorToast, subscribeErrorToasts } from "./toasts";

describe("error toasts", () => {
  it("publishes error toasts to subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeErrorToasts(listener);
    const action = vi.fn();

    const id = pushErrorToast({
      title: "Test error",
      message: "Something went wrong",
      variant: "info",
      durationMs: 1234,
      sticky: true,
      actions: [
        {
          label: "Retry",
          pendingLabel: "Retrying...",
          run: action,
        },
      ],
    });

    expect(id).toMatch(/^error-toast-/);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        instanceId: expect.any(String),
        title: "Test error",
        message: "Something went wrong",
        variant: "info",
        durationMs: 1234,
        sticky: true,
        actions: [
          expect.objectContaining({
            label: "Retry",
            pendingLabel: "Retrying...",
            run: action,
          }),
        ],
      }),
    );

    unsubscribe();
  });
});

// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorToasts } from "./ErrorToasts";

describe("ErrorToasts", () => {
  it("renders toast actions and runs them with pending feedback", async () => {
    let resolveAction: (() => void) | null = null;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const onDismiss = vi.fn();

    render(
      <ErrorToasts
        toasts={[
          {
            id: "toast-1",
            title: "Failed to create session.",
            message: "Runtime is recovering.",
            sticky: true,
            actions: [
              {
                label: "Reconnect and retry",
                pendingLabel: "Reconnecting...",
                run,
              },
            ],
          },
        ]}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reconnect and retry" }));

    expect(run).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole("button", { name: "Reconnecting..." }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await act(async () => {
      resolveAction?.();
    });

    await waitFor(() => {
      expect(onDismiss).toHaveBeenCalledWith("toast-1");
    });
  });

  it("shows inline action error when a toast action fails", async () => {
    const onDismiss = vi.fn();

    render(
      <ErrorToasts
        toasts={[
          {
            id: "toast-2",
            title: "Failed to create session.",
            message: "Runtime is recovering.",
            sticky: true,
            actions: [
              {
                label: "Reconnect and retry",
                run: async () => {
                  throw new Error("Reconnect failed");
                },
              },
            ],
          },
        ]}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reconnect and retry" }));

    expect(await screen.findByText("Reconnect failed")).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("clears stale inline action errors when the same toast id is re-emitted", async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <ErrorToasts
        toasts={[
          {
            id: "toast-2",
            instanceId: "toast-2:v1",
            title: "Failed to create session.",
            message: "Runtime is recovering.",
            sticky: true,
            actions: [
              {
                label: "Reconnect and retry",
                run: async () => {
                  throw new Error("Reconnect failed");
                },
              },
            ],
          },
        ]}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reconnect and retry" }));
    expect(await screen.findByText("Reconnect failed")).toBeTruthy();

    rerender(
      <ErrorToasts
        toasts={[
          {
            id: "toast-2",
            instanceId: "toast-2:v2",
            title: "Failed to create session.",
            message: "Runtime is recovering again.",
            sticky: true,
            actions: [
              {
                label: "Reconnect and retry",
                run: async () => undefined,
              },
            ],
          },
        ]}
        onDismiss={onDismiss}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("Reconnect failed")).toBeNull();
    });
  });

  it("does not disable unrelated toast actions while one action is running", async () => {
    let resolveFirst: (() => void) | null = null;
    const firstRun = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const secondRun = vi.fn(async () => undefined);

    render(
      <ErrorToasts
        toasts={[
          {
            id: "toast-1",
            instanceId: "toast-1:v1",
            title: "Failed to create session.",
            message: "Runtime is recovering.",
            sticky: true,
            actions: [
              {
                label: "Reconnect workspace A",
                pendingLabel: "Reconnecting workspace A...",
                run: firstRun,
              },
            ],
          },
          {
            id: "toast-2",
            instanceId: "toast-2:v1",
            title: "Failed to create session.",
            message: "Runtime is recovering.",
            sticky: true,
            actions: [
              {
                label: "Reconnect workspace B",
                pendingLabel: "Reconnecting workspace B...",
                run: secondRun,
              },
            ],
          },
        ]}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reconnect workspace A" }));

    const secondButton = screen.getByRole("button", {
      name: "Reconnect workspace B",
    }) as HTMLButtonElement;
    expect(secondButton.disabled).toBe(false);

    fireEvent.click(secondButton);

    expect(firstRun).toHaveBeenCalledTimes(1);
    expect(secondRun).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.();
    });
  });

  it("renders info toasts as status messages", () => {
    render(
      <ErrorToasts
        toasts={[
          {
            id: "toast-3",
            title: "Runtime recovered.",
            message: "Retrying session creation...",
            variant: "info",
          },
        ]}
        onDismiss={vi.fn()}
      />,
    );

    const toast = screen.getByRole("status");
    expect(toast.className).toContain("error-toast-info");
    expect(screen.getByText("Runtime recovered.")).toBeTruthy();
  });
});

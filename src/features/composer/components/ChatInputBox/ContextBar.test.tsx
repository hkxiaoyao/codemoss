// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextBar } from "./ContextBar";

describe("ContextBar live canvas controls visibility", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.removeItem("ccgui.messages.live.autoFollow");
    window.localStorage.removeItem("ccgui.messages.live.collapseMiddleSteps");
  });

  it("shows output collapse controls in history mode when there are messages", () => {
    const { container } = render(
      <ContextBar
        isLoading={false}
        hasMessages
        showStatusPanelToggle
      />,
    );

    expect(container.querySelector(".context-live-canvas-controls")).toBeTruthy();
    expect(container.querySelector(".context-live-canvas-btn--focus-follow")).toBeNull();
    expect(container.querySelector(".context-live-canvas-btn")).toBeTruthy();
  });

  it("hides output collapse controls when idle and no messages", () => {
    const { container } = render(
      <ContextBar
        isLoading={false}
        hasMessages={false}
        showStatusPanelToggle
      />,
    );

    expect(container.querySelector(".context-live-canvas-controls")).toBeNull();
  });

  it("disables rewind while conversation is in progress", () => {
    const onRewind = vi.fn();
    const { container } = render(
      <ContextBar
        isLoading
        hasMessages
        currentProvider="claude"
        onRewind={onRewind}
        showRewindEntry
      />,
    );

    const rewindButton = container.querySelector(".context-rewind-btn") as HTMLButtonElement | null;

    expect(rewindButton).toBeTruthy();
    expect(rewindButton?.hasAttribute("disabled")).toBe(true);

    rewindButton?.click();
    expect(onRewind).not.toHaveBeenCalled();
  });

  it("shows rewind for codex provider when enabled", () => {
    const { container } = render(
      <ContextBar
        isLoading={false}
        hasMessages
        currentProvider="codex"
        onRewind={vi.fn()}
        showRewindEntry
      />,
    );

    const rewindButton = container.querySelector(".context-rewind-btn");
    expect(rewindButton).toBeTruthy();
  });

  it("renders the completion email toggle in the bottom context bar", () => {
    const onToggleCompletionEmail = vi.fn();

    const { rerender } = render(
      <ContextBar
        isLoading={false}
        hasMessages
        onToggleCompletionEmail={onToggleCompletionEmail}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: "composer.completionEmailAriaLabel",
    });
    expect(toggle.closest(".context-bar")).toBeTruthy();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    toggle.click();
    expect(onToggleCompletionEmail).toHaveBeenCalledTimes(1);

    rerender(
      <ContextBar
        isLoading={false}
        hasMessages
        completionEmailSelected
        completionEmailDisabled
        onToggleCompletionEmail={onToggleCompletionEmail}
      />,
    );

    const selectedToggle = screen.getByRole("button", {
      name: "composer.completionEmailSelected",
    }) as HTMLButtonElement;
    expect(selectedToggle.getAttribute("aria-pressed")).toBe("true");
    expect(selectedToggle.disabled).toBe(true);
  });

  it("renders Codex auto-compaction controls inside the context tooltip", () => {
    const onCodexAutoCompactionSettingsChange = vi.fn();

    const { rerender } = render(
      <ContextBar
        currentProvider="codex"
        contextDualViewEnabled
        dualContextUsage={{
          usedTokens: 50,
          contextWindow: 100,
          percent: 50,
          hasUsage: true,
          compactionState: "idle",
        }}
        codexAutoCompactionEnabled={false}
        codexAutoCompactionThresholdPercent={150}
        onCodexAutoCompactionSettingsChange={onCodexAutoCompactionSettingsChange}
      />,
    );

    const toggle = screen.getByLabelText("chat.contextDualViewAutoCompactionEnabled");
    const threshold = screen.getByLabelText("chat.contextDualViewAutoCompactionThreshold") as HTMLSelectElement;

    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(threshold.value).toBe("150");
    expect(threshold.disabled).toBe(true);

    fireEvent.click(toggle);
    expect(onCodexAutoCompactionSettingsChange).toHaveBeenCalledWith({ enabled: true });

    rerender(
      <ContextBar
        currentProvider="codex"
        contextDualViewEnabled
        dualContextUsage={{
          usedTokens: 50,
          contextWindow: 100,
          percent: 50,
          hasUsage: true,
          compactionState: "idle",
        }}
        codexAutoCompactionEnabled
        codexAutoCompactionThresholdPercent={150}
        onCodexAutoCompactionSettingsChange={onCodexAutoCompactionSettingsChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("chat.contextDualViewAutoCompactionThreshold"), {
      target: { value: "180" },
    });
    expect(onCodexAutoCompactionSettingsChange).toHaveBeenCalledWith({ thresholdPercent: 180 });
  });

  it("shows the real Codex context usage percent while filling the ring at 100 percent", () => {
    const { container } = render(
      <ContextBar
        currentProvider="codex"
        contextDualViewEnabled
        dualContextUsage={{
          usedTokens: 130,
          contextWindow: 100,
          percent: 100,
          hasUsage: true,
          compactionState: "idle",
        }}
      />,
    );

    expect(screen.getAllByText("130%").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("0%")).toBeTruthy();

    const ring = container.querySelector(".context-dual-usage-ring") as HTMLElement | null;
    expect(ring?.style.getPropertyValue("--dual-usage-percent")).toBe("100%");
  });
});

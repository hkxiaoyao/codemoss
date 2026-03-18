// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useWorkspaceActions } from "./useWorkspaceActions";
import { ask } from "@tauri-apps/plugin-dialog";
import { openNewWindow, pickWorkspacePath } from "../../../services/tauri";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("./useNewAgentShortcut", () => ({
  useNewAgentShortcut: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
}));

vi.mock("../../../services/tauri", () => ({
  openNewWindow: vi.fn(async () => undefined),
  pickWorkspacePath: vi.fn(async () => null),
}));

const baseWorkspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Workspace",
  path: "/tmp/workspace",
  connected: true,
  settings: { sidebarCollapsed: false },
};

function makeOptions(overrides?: Partial<Parameters<typeof useWorkspaceActions>[0]>) {
  return {
    activeWorkspace: baseWorkspace,
    isCompact: false,
    activeEngine: "claude" as const,
    setActiveEngine: vi.fn(async () => undefined),
    addWorkspace: vi.fn(async () => null),
    addWorkspaceFromPath: vi.fn(async () => null),
    connectWorkspace: vi.fn(async () => undefined),
    startThreadForWorkspace: vi.fn(async () => "thread-1"),
    setActiveThreadId: vi.fn(),
    setActiveTab: vi.fn(),
    exitDiffView: vi.fn(),
    selectWorkspace: vi.fn(),
    openWorktreePrompt: vi.fn(),
    openClonePrompt: vi.fn(),
    composerInputRef: { current: null },
    onDebug: vi.fn(),
    ...overrides,
  };
}

describe("useWorkspaceActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses selected engine for new session and switches active engine first", async () => {
    const workspace: WorkspaceInfo = { ...baseWorkspace, connected: false };
    const options = makeOptions({ activeEngine: "claude" });

    const { result } = renderHook(() => useWorkspaceActions(options));

    await act(async () => {
      await result.current.handleAddAgent(workspace, "codex");
    });

    expect(options.selectWorkspace).toHaveBeenCalledWith("ws-1");
    expect(options.connectWorkspace).toHaveBeenCalledWith(workspace);
    expect(options.setActiveEngine).toHaveBeenCalledWith("codex");
    expect(options.startThreadForWorkspace).toHaveBeenCalledWith("ws-1", {
      engine: "codex",
    });
  });

  it("falls back to current active engine when no explicit engine provided", async () => {
    const options = makeOptions({ activeEngine: "opencode" });

    const { result } = renderHook(() => useWorkspaceActions(options));

    await act(async () => {
      await result.current.handleAddAgent(baseWorkspace);
    });

    expect(options.setActiveEngine).not.toHaveBeenCalled();
    expect(options.startThreadForWorkspace).toHaveBeenCalledWith("ws-1", {
      engine: "opencode",
    });
  });

  it("adds workspace to current window when open mode is current", async () => {
    vi.mocked(pickWorkspacePath).mockResolvedValue("/tmp/new-repo");
    vi.mocked(ask).mockResolvedValueOnce(true);
    const options = makeOptions({
      addWorkspaceFromPath: vi.fn(async () => ({
        id: "ws-2",
        name: "new-repo",
        path: "/tmp/new-repo",
        connected: true,
        settings: { sidebarCollapsed: false },
      })),
    });
    const { result } = renderHook(() => useWorkspaceActions(options));

    await act(async () => {
      await result.current.handleAddWorkspace();
    });

    expect(options.addWorkspaceFromPath).toHaveBeenCalledWith("/tmp/new-repo");
    expect(openNewWindow).not.toHaveBeenCalled();
  });

  it("opens new window when mode is new-window", async () => {
    vi.mocked(pickWorkspacePath).mockResolvedValue("/tmp/new-repo");
    vi.mocked(ask).mockResolvedValueOnce(false);
    const options = makeOptions();
    const { result } = renderHook(() => useWorkspaceActions(options));

    await act(async () => {
      await result.current.handleAddWorkspace();
    });

    expect(openNewWindow).toHaveBeenCalledWith("/tmp/new-repo");
    expect(options.addWorkspaceFromPath).not.toHaveBeenCalled();
  });

  it("asks user for mode once on each add workspace flow", async () => {
    vi.mocked(pickWorkspacePath).mockResolvedValue("/tmp/new-repo");
    vi.mocked(ask).mockResolvedValueOnce(false);
    const options = makeOptions();
    const { result } = renderHook(() => useWorkspaceActions(options));

    await act(async () => {
      await result.current.handleAddWorkspace();
    });

    expect(ask).toHaveBeenCalledTimes(1);
    expect(openNewWindow).toHaveBeenCalledWith("/tmp/new-repo");
  });
});

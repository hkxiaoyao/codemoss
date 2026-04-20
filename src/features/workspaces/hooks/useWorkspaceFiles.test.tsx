// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { getWorkspaceFiles } from "../../../services/tauri";
import { useWorkspaceFiles } from "./useWorkspaceFiles";

vi.mock("../../../services/tauri", () => ({
  getWorkspaceFiles: vi.fn(),
}));

const workspaceA: WorkspaceInfo = {
  id: "workspace-a",
  name: "Workspace A",
  path: "/tmp/workspace-a",
  connected: true,
  settings: {
    sidebarCollapsed: false,
  },
};

const workspaceB: WorkspaceInfo = {
  id: "workspace-b",
  name: "Workspace B",
  path: "/tmp/workspace-b",
  connected: true,
  settings: {
    sidebarCollapsed: false,
  },
};

function flushAsyncWork() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("useWorkspaceFiles", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("retries the initial load once after a failure and recovers file state", async () => {
    const getWorkspaceFilesMock = vi.mocked(getWorkspaceFiles);
    getWorkspaceFilesMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        files: ["src/app.tsx"],
        directories: ["src"],
        gitignored_files: [],
        gitignored_directories: [],
      });

    const { result, unmount } = renderHook(() =>
      useWorkspaceFiles({
        activeWorkspace: workspaceA,
        pollingEnabled: false,
      }),
    );

    await flushAsyncWork();

    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(1);
    expect(result.current.files).toEqual([]);
    expect(result.current.loadError).toBe("network down");

    await act(async () => {
      vi.advanceTimersByTime(1_500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(2);
    expect(result.current.files).toEqual(["src/app.tsx"]);
    expect(result.current.directories).toEqual(["src"]);
    expect(result.current.loadError).toBeNull();

    unmount();
  });

  it("cleans up a scheduled retry when the active workspace changes", async () => {
    const getWorkspaceFilesMock = vi.mocked(getWorkspaceFiles);
    getWorkspaceFilesMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        files: ["docs/readme.md"],
        directories: ["docs"],
        gitignored_files: [],
        gitignored_directories: [],
      });

    const { rerender, result, unmount } = renderHook(
      ({ activeWorkspace }: { activeWorkspace: WorkspaceInfo | null }) =>
        useWorkspaceFiles({
          activeWorkspace,
          pollingEnabled: false,
        }),
      {
        initialProps: { activeWorkspace: workspaceA },
      },
    );

    await flushAsyncWork();
    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(1);
    expect(result.current.loadError).toBe("network down");

    rerender({ activeWorkspace: workspaceB });
    await flushAsyncWork();

    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(2);
    expect(result.current.files).toEqual(["docs/readme.md"]);
    expect(result.current.loadError).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1_500);
      await Promise.resolve();
    });

    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("ignores stale responses from the previous workspace after a fast switch", async () => {
    const workspaceAResponse = createDeferred<{
      files: string[];
      directories: string[];
      gitignored_files: string[];
      gitignored_directories: string[];
    }>();
    const workspaceBResponse = createDeferred<{
      files: string[];
      directories: string[];
      gitignored_files: string[];
      gitignored_directories: string[];
    }>();
    const getWorkspaceFilesMock = vi.mocked(getWorkspaceFiles);
    getWorkspaceFilesMock.mockImplementation((requestedWorkspaceId) => {
      if (requestedWorkspaceId === workspaceA.id) {
        return workspaceAResponse.promise;
      }
      if (requestedWorkspaceId === workspaceB.id) {
        return workspaceBResponse.promise;
      }
      return Promise.reject(new Error(`unexpected workspace: ${requestedWorkspaceId}`));
    });

    const { rerender, result, unmount } = renderHook(
      ({ activeWorkspace }: { activeWorkspace: WorkspaceInfo | null }) =>
        useWorkspaceFiles({
          activeWorkspace,
          pollingEnabled: false,
        }),
      {
        initialProps: { activeWorkspace: workspaceA },
      },
    );

    await flushAsyncWork();
    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(1);

    rerender({ activeWorkspace: workspaceB });
    await flushAsyncWork();
    expect(getWorkspaceFilesMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      workspaceBResponse.resolve({
        files: ["docs/guide.md"],
        directories: ["docs"],
        gitignored_files: [],
        gitignored_directories: [],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.files).toEqual(["docs/guide.md"]);
    expect(result.current.directories).toEqual(["docs"]);
    expect(result.current.loadError).toBeNull();

    await act(async () => {
      workspaceAResponse.resolve({
        files: ["src/app.tsx"],
        directories: ["src"],
        gitignored_files: [],
        gitignored_directories: [],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.files).toEqual(["docs/guide.md"]);
    expect(result.current.directories).toEqual(["docs"]);
    expect(result.current.loadError).toBeNull();

    unmount();
  });
});

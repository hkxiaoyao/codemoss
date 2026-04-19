// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveWorkspaceSessions,
  listWorkspaceSessions,
} from "../../../../../services/tauri";
import {
  buildWorkspaceSessionSelectionKey,
  useWorkspaceSessionCatalog,
  type WorkspaceSessionCatalogFilters,
} from "./useWorkspaceSessionCatalog";

vi.mock("../../../../../services/tauri", () => ({
  listWorkspaceSessions: vi.fn(),
  archiveWorkspaceSessions: vi.fn(),
  unarchiveWorkspaceSessions: vi.fn(),
  deleteWorkspaceSessions: vi.fn(),
}));

const DEFAULT_FILTERS: WorkspaceSessionCatalogFilters = {
  keyword: "",
  engine: "",
  status: "active",
};

describe("useWorkspaceSessionCatalog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("builds selection key with workspace ownership", () => {
    expect(
      buildWorkspaceSessionSelectionKey({
        workspaceId: "ws-2",
        sessionId: "claude:123",
      }),
    ).toBe("ws-2::claude:123");
  });

  it("ignores stale responses after workspace selection is cleared", async () => {
    let resolveList:
      | ((value: {
          data: Array<{
            sessionId: string;
            workspaceId: string;
            engine: string;
            title: string;
            updatedAt: number;
            threadKind: string;
          }>;
            nextCursor: string | null;
            partialSource: string | null;
        }) => void)
      | null = null;

    vi.mocked(listWorkspaceSessions).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ workspaceId }) =>
        useWorkspaceSessionCatalog({
          workspaceId,
          filters: DEFAULT_FILTERS,
        }),
      {
        initialProps: { workspaceId: "ws-1" as string | null },
      },
    );

    await waitFor(() => {
      expect(vi.mocked(listWorkspaceSessions)).toHaveBeenCalledWith("ws-1", {
        query: { keyword: null, engine: null, status: "active" },
        cursor: null,
        limit: 100,
      });
    });

    rerender({ workspaceId: null });

    await act(async () => {
      resolveList?.({
        data: [
          {
            sessionId: "session-a",
            workspaceId: "ws-1",
            engine: "codex",
            title: "Leaked stale entry",
            updatedAt: 1,
            threadKind: "native",
          },
        ],
        nextCursor: null,
        partialSource: null,
      });
      await Promise.resolve();
    });

    expect(result.current.entries).toEqual([]);
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("groups batch archive requests by owner workspace", async () => {
    vi.mocked(listWorkspaceSessions).mockResolvedValueOnce({
      data: [
        {
          sessionId: "codex:main",
          workspaceId: "ws-main",
          engine: "codex",
          title: "Main session",
          updatedAt: 10,
          threadKind: "native",
        },
        {
          sessionId: "codex:worktree",
          workspaceId: "ws-worktree",
          engine: "codex",
          title: "Worktree session",
          updatedAt: 11,
          threadKind: "native",
        },
      ],
      nextCursor: null,
      partialSource: null,
    });
    vi.mocked(archiveWorkspaceSessions)
      .mockResolvedValueOnce({
        results: [{ sessionId: "codex:main", ok: true, archivedAt: 100 }],
      })
      .mockResolvedValueOnce({
        results: [{ sessionId: "codex:worktree", ok: true, archivedAt: 101 }],
      });

    const { result } = renderHook(() =>
      useWorkspaceSessionCatalog({
        workspaceId: "ws-main",
        filters: DEFAULT_FILTERS,
      }),
    );

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(2);
    });

    let response:
      | Awaited<ReturnType<typeof result.current.mutate>>
      | undefined;
    await act(async () => {
      response = await result.current.mutate("archive", result.current.entries);
    });

    expect(archiveWorkspaceSessions).toHaveBeenNthCalledWith(1, "ws-main", ["codex:main"]);
    expect(archiveWorkspaceSessions).toHaveBeenNthCalledWith(2, "ws-worktree", [
      "codex:worktree",
    ]);
    expect(response?.results).toEqual([
      {
        selectionKey: "ws-main::codex:main",
        sessionId: "codex:main",
        workspaceId: "ws-main",
        ok: true,
        archivedAt: 100,
        error: undefined,
        code: undefined,
      },
      {
        selectionKey: "ws-worktree::codex:worktree",
        sessionId: "codex:worktree",
        workspaceId: "ws-worktree",
        ok: true,
        archivedAt: 101,
        error: undefined,
        code: undefined,
      },
    ]);
  });

  it("preserves successful workspace buckets when another bucket throws", async () => {
    vi.mocked(listWorkspaceSessions).mockResolvedValueOnce({
      data: [
        {
          sessionId: "codex:main",
          workspaceId: "ws-main",
          engine: "codex",
          title: "Main session",
          updatedAt: 10,
          threadKind: "native",
        },
        {
          sessionId: "codex:worktree",
          workspaceId: "ws-worktree",
          engine: "codex",
          title: "Worktree session",
          updatedAt: 11,
          threadKind: "native",
        },
      ],
      nextCursor: null,
      partialSource: null,
    });
    vi.mocked(archiveWorkspaceSessions)
      .mockResolvedValueOnce({
        results: [{ sessionId: "codex:main", ok: true, archivedAt: 100 }],
      })
      .mockRejectedValueOnce(new Error("worktree archive failed"));

    const { result } = renderHook(() =>
      useWorkspaceSessionCatalog({
        workspaceId: "ws-main",
        filters: DEFAULT_FILTERS,
      }),
    );

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(2);
    });

    let response:
      | Awaited<ReturnType<typeof result.current.mutate>>
      | undefined;
    await act(async () => {
      response = await result.current.mutate("archive", result.current.entries);
    });

    expect(response?.results).toEqual([
      {
        selectionKey: "ws-main::codex:main",
        sessionId: "codex:main",
        workspaceId: "ws-main",
        ok: true,
        archivedAt: 100,
        error: undefined,
        code: undefined,
      },
      {
        selectionKey: "ws-worktree::codex:worktree",
        sessionId: "codex:worktree",
        workspaceId: "ws-worktree",
        ok: false,
        archivedAt: null,
        error: "worktree archive failed",
        code: "MUTATION_REQUEST_FAILED",
      },
    ]);
    expect(result.current.entries).toEqual([
      {
        sessionId: "codex:worktree",
        workspaceId: "ws-worktree",
        engine: "codex",
        title: "Worktree session",
        updatedAt: 11,
        threadKind: "native",
      },
    ]);
  });
});

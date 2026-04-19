// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectSucceededWorkspaceIds,
  SessionManagementSection,
} from "./SessionManagementSection";
import type { WorkspaceInfo } from "../../../../../types";
import {
  archiveWorkspaceSessions,
  deleteWorkspaceSessions,
  listWorkspaceSessions,
} from "../../../../../services/tauri";

vi.mock("../../../../../services/tauri", () => ({
  listWorkspaceSessions: vi.fn(),
  archiveWorkspaceSessions: vi.fn(),
  unarchiveWorkspaceSessions: vi.fn(),
  deleteWorkspaceSessions: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Workspace",
  path: "/tmp/workspace",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const worktree: WorkspaceInfo = {
  id: "ws-2",
  name: "Workspace Worktree",
  path: "/tmp/worktree",
  connected: true,
  kind: "worktree",
  parentId: "ws-1",
  settings: { sidebarCollapsed: false },
};

function getEnabledButtonByName(name: string) {
  const button = screen
    .getAllByRole("button", { name })
    .find((candidate) => !(candidate as HTMLButtonElement).disabled);
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

function getEnabledButtonByTestId(testId: string) {
  const button = screen
    .getAllByTestId(testId)
    .find((candidate) => !(candidate as HTMLButtonElement).disabled);
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

function getCheckboxByName(name: string) {
  const checkbox = screen.getAllByRole("checkbox", { name })[0];
  expect(checkbox).toBeTruthy();
  return checkbox as HTMLInputElement;
}

describe("SessionManagementSection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders owner workspace label for aggregated project entries", async () => {
    vi.mocked(listWorkspaceSessions).mockResolvedValueOnce({
      data: [
        {
          sessionId: "codex:main",
          workspaceId: "ws-1",
          title: "Main session",
          updatedAt: 1710000000000,
          engine: "codex",
          archivedAt: null,
          threadKind: "native",
          sourceLabel: "cli/codex",
        },
        {
          sessionId: "codex:worktree",
          workspaceId: "ws-2",
          title: "Worktree session",
          updatedAt: 1710000000001,
          engine: "codex",
          archivedAt: null,
          threadKind: "native",
          sourceLabel: "cli/codex",
        },
      ],
      nextCursor: null,
      partialSource: null,
    });

    render(
      <SessionManagementSection
        title="Session Management"
        description="Manage sessions"
        workspaces={[workspace, worktree]}
        groupedWorkspaces={[{ id: null, name: "Ungrouped", workspaces: [workspace, worktree] }]}
        initialWorkspaceId="ws-1"
      />,
    );

    expect(await screen.findByText("Ungrouped / Workspace")).toBeTruthy();
    expect(await screen.findByText("Ungrouped / [worktree] Workspace Worktree")).toBeTruthy();
    expect(await screen.findAllByText("cli/codex")).toHaveLength(2);
  });

  it("collects unique owner workspaces from successful mutation results", () => {
    expect(
      collectSucceededWorkspaceIds([
        {
          selectionKey: "ws-1::codex:1",
          sessionId: "codex:1",
          workspaceId: "ws-1",
          ok: true,
        },
        {
          selectionKey: "ws-2::codex:2",
          sessionId: "codex:2",
          workspaceId: "ws-2",
          ok: true,
        },
        {
          selectionKey: "ws-1::codex:3",
          sessionId: "codex:3",
          workspaceId: "ws-1",
          ok: true,
        },
        {
          selectionKey: "ws-3::codex:4",
          sessionId: "codex:4",
          workspaceId: "ws-3",
          ok: false,
          error: "failed",
          code: "DELETE_FAILED",
        },
      ]),
    ).toEqual(["ws-1", "ws-2"]);
  });

  it("keeps failed sessions selected after partial archive failure", async () => {
    vi.mocked(listWorkspaceSessions)
      .mockResolvedValueOnce({
        data: [
          {
            sessionId: "codex:ok",
            workspaceId: "ws-1",
            title: "Ok session",
            updatedAt: 1710000000000,
            engine: "codex",
            archivedAt: null,
            threadKind: "native",
            sourceLabel: "cli/codex",
          },
          {
            sessionId: "codex:failed",
            workspaceId: "ws-1",
            title: "Failed session",
            updatedAt: 1710000000001,
            engine: "codex",
            archivedAt: null,
            threadKind: "native",
            sourceLabel: "cli/codex",
          },
        ],
        nextCursor: null,
        partialSource: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            sessionId: "codex:failed",
            workspaceId: "ws-1",
            title: "Failed session",
            updatedAt: 1710000000001,
            engine: "codex",
            archivedAt: null,
            threadKind: "native",
            sourceLabel: "cli/codex",
          },
        ],
        nextCursor: null,
        partialSource: null,
      });
    vi.mocked(archiveWorkspaceSessions).mockResolvedValue({
      results: [
        { sessionId: "codex:ok", ok: true, archivedAt: 1710000000999 },
        {
          sessionId: "codex:failed",
          ok: false,
          error: "archive failed",
          code: "DELETE_FAILED",
        },
      ],
    });

    render(
      <SessionManagementSection
        title="Session Management"
        description="Manage sessions"
        workspaces={[workspace]}
        groupedWorkspaces={[{ id: null, name: "Ungrouped", workspaces: [workspace] }]}
        initialWorkspaceId="ws-1"
      />,
    );

    fireEvent.click(await screen.findByRole("checkbox", { name: "Ok session" }));
    fireEvent.click(getCheckboxByName("Failed session"));
    fireEvent.click(getEnabledButtonByName("settings.sessionManagementArchiveSelected"));

    await waitFor(() => {
      expect(archiveWorkspaceSessions).toHaveBeenCalledWith("ws-1", [
        "codex:ok",
        "codex:failed",
      ]);
    });

    await waitFor(() => {
      expect(screen.queryByRole("checkbox", { name: "Ok session" })).toBeNull();
    });

    expect(
      getCheckboxByName("Failed session").checked,
    ).toBe(true);
  });

  it("groups delete requests by entry owner workspace", async () => {
    vi.mocked(listWorkspaceSessions).mockResolvedValueOnce({
      data: [
        {
          sessionId: "codex:main",
          workspaceId: "ws-1",
          title: "Main session",
          updatedAt: 1710000000000,
          engine: "codex",
          archivedAt: null,
          threadKind: "native",
        },
        {
          sessionId: "codex:worktree",
          workspaceId: "ws-2",
          title: "Worktree session",
          updatedAt: 1710000000001,
          engine: "codex",
          archivedAt: null,
          threadKind: "native",
        },
      ],
      nextCursor: null,
      partialSource: null,
    });
    vi.mocked(deleteWorkspaceSessions)
      .mockResolvedValueOnce({
        results: [{ sessionId: "codex:main", ok: true }],
      })
      .mockResolvedValueOnce({
        results: [{ sessionId: "codex:worktree", ok: true }],
      });

    render(
      <SessionManagementSection
        title="Session Management"
        description="Manage sessions"
        workspaces={[workspace, worktree]}
        groupedWorkspaces={[{ id: null, name: "Ungrouped", workspaces: [workspace, worktree] }]}
        initialWorkspaceId="ws-1"
      />,
    );

    fireEvent.click(await screen.findByRole("checkbox", { name: "Main session" }));
    fireEvent.click(getCheckboxByName("Worktree session"));
    fireEvent.click(getEnabledButtonByTestId("settings-project-sessions-delete-selected"));
    fireEvent.click(getEnabledButtonByTestId("settings-project-sessions-delete-selected"));

    await waitFor(() => {
      expect(deleteWorkspaceSessions).toHaveBeenNthCalledWith(1, "ws-1", ["codex:main"]);
      expect(deleteWorkspaceSessions).toHaveBeenNthCalledWith(2, "ws-2", ["codex:worktree"]);
    });
  });

});

import type { RefObject } from "react";
import { useCallback } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { useNewAgentShortcut } from "./useNewAgentShortcut";
import { openNewWindow, pickWorkspacePath } from "../../../services/tauri";
import type { DebugEntry, EngineType, WorkspaceInfo } from "../../../types";

type WorkspaceOpenMode = "current-window" | "new-window";

type Params = {
  activeWorkspace: WorkspaceInfo | null;
  isCompact: boolean;
  activeEngine: EngineType;
  setActiveEngine?: (engine: EngineType) => Promise<void> | void;
  addWorkspace: () => Promise<WorkspaceInfo | null>;
  addWorkspaceFromPath: (path: string) => Promise<WorkspaceInfo | null>;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { engine?: EngineType },
  ) => Promise<string | null>;
  setActiveThreadId: (threadId: string | null, workspaceId: string) => void;
  setActiveTab: (tab: "projects" | "codex" | "spec" | "git" | "log") => void;
  exitDiffView: () => void;
  selectWorkspace: (workspaceId: string) => void;
  openWorktreePrompt: (workspace: WorkspaceInfo) => void;
  openClonePrompt: (workspace: WorkspaceInfo) => void;
  composerInputRef: RefObject<HTMLTextAreaElement | null>;
  onDebug: (entry: DebugEntry) => void;
};

export function useWorkspaceActions({
  activeWorkspace,
  isCompact,
  activeEngine,
  setActiveEngine,
  addWorkspace: _addWorkspace,
  addWorkspaceFromPath,
  connectWorkspace,
  startThreadForWorkspace,
  setActiveThreadId,
  setActiveTab,
  exitDiffView,
  selectWorkspace,
  openWorktreePrompt,
  openClonePrompt,
  composerInputRef,
  onDebug,
}: Params) {
  const { t } = useTranslation();

  const localizeErrorMessage = useCallback(
    (message: string): string => {
      if (
        message.startsWith("CLI_NOT_FOUND:") ||
        message.includes("No such file or directory") ||
        message.includes("Failed to execute claude") ||
        message.includes("Failed to execute codex")
      ) {
        return `${t("errors.cliNotFound")}\n\n${t("errors.cliNotFoundHint")}`;
      }
      return message;
    },
    [t],
  );

  const handleWorkspaceAdded = useCallback(
    (workspace: WorkspaceInfo) => {
      setActiveThreadId(null, workspace.id);
      if (isCompact) {
        setActiveTab("codex");
      }
    },
    [isCompact, setActiveTab, setActiveThreadId],
  );

  const resolveWorkspaceOpenMode = useCallback(async (): Promise<WorkspaceOpenMode> => {
    const useCurrentWindow = await ask(t("workspace.addWorkspaceOpenModePrompt"), {
      title: t("workspace.addWorkspaceOpenModeTitle"),
      kind: "info",
      okLabel: t("workspace.addWorkspaceOpenCurrent"),
      cancelLabel: t("workspace.addWorkspaceOpenNewWindow"),
    });
    return useCurrentWindow ? "current-window" : "new-window";
  }, [t]);

  const handleOpenNewWindow = useCallback(
    async (path?: string | null) => {
      try {
        await openNewWindow(path);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onDebug({
          id: `${Date.now()}-client-open-new-window-error`,
          timestamp: Date.now(),
          source: "error",
          label: "workspace/open-new-window error",
          payload: message,
        });
        alert(`${t("errors.failedToOpenNewWindow")}\n\n${localizeErrorMessage(message)}`);
      }
    },
    [localizeErrorMessage, onDebug, t],
  );

  const handleAddWorkspaceFromPath = useCallback(
    async (path: string) => {
      try {
        const workspace = await addWorkspaceFromPath(path);
        if (workspace) {
          handleWorkspaceAdded(workspace);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onDebug({
          id: `${Date.now()}-client-add-workspace-error`,
          timestamp: Date.now(),
          source: "error",
          label: "workspace/add error",
          payload: message,
        });
        alert(`${t("errors.failedToAddWorkspace")}\n\n${localizeErrorMessage(message)}`);
      }
    },
    [addWorkspaceFromPath, handleWorkspaceAdded, localizeErrorMessage, onDebug, t],
  );

  const handleAddWorkspace = useCallback(async () => {
    try {
      const path = await pickWorkspacePath();
      if (!path) {
        return;
      }
      const mode = await resolveWorkspaceOpenMode();
      if (mode === "new-window") {
        await handleOpenNewWindow(path);
        return;
      }
      await handleAddWorkspaceFromPath(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onDebug({
        id: `${Date.now()}-client-add-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/add error",
        payload: message,
      });
      alert(`${t("errors.failedToAddWorkspace")}\n\n${localizeErrorMessage(message)}`);
    }
  }, [
    handleAddWorkspaceFromPath,
    handleOpenNewWindow,
    localizeErrorMessage,
    onDebug,
    resolveWorkspaceOpenMode,
    t,
  ]);

  const handleAddAgent = useCallback(
    async (workspace: WorkspaceInfo, engine?: EngineType) => {
      const targetEngine = engine ?? activeEngine;
      exitDiffView();
      selectWorkspace(workspace.id);
      if (!workspace.connected) {
        await connectWorkspace(workspace);
      }
      if (engine && engine !== activeEngine) {
        try {
          await setActiveEngine?.(targetEngine);
        } catch (error) {
          onDebug({
            id: `${Date.now()}-client-switch-engine-before-new-thread-error`,
            timestamp: Date.now(),
            source: "error",
            label: "workspace/switch engine before new thread error",
            payload: error instanceof Error ? error.message : String(error),
          });
        }
      }
      await startThreadForWorkspace(workspace.id, {
        engine: targetEngine,
      });
      if (isCompact) {
        setActiveTab("codex");
      }
      setTimeout(() => composerInputRef.current?.focus(), 0);
    },
    [
      composerInputRef,
      connectWorkspace,
      exitDiffView,
      isCompact,
      activeEngine,
      setActiveEngine,
      onDebug,
      selectWorkspace,
      setActiveTab,
      startThreadForWorkspace,
    ],
  );

  const handleAddWorktreeAgent = useCallback(
    async (workspace: WorkspaceInfo) => {
      exitDiffView();
      openWorktreePrompt(workspace);
    },
    [exitDiffView, openWorktreePrompt],
  );

  const handleAddCloneAgent = useCallback(
    async (workspace: WorkspaceInfo) => {
      exitDiffView();
      openClonePrompt(workspace);
    },
    [exitDiffView, openClonePrompt],
  );

  useNewAgentShortcut({
    isEnabled: Boolean(activeWorkspace),
    onTrigger: () => {
      if (activeWorkspace) {
        void handleAddAgent(activeWorkspace);
      }
    },
  });

  return {
    handleAddWorkspace,
    handleOpenNewWindow,
    handleAddWorkspaceFromPath,
    handleAddAgent,
    handleAddWorktreeAgent,
    handleAddCloneAgent,
  };
}

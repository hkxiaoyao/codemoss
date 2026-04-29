import type { WorkspaceInfo } from "../../../types";

export function getWorkspaceSidebarAlias(workspace: WorkspaceInfo) {
  const projectAlias = workspace.settings.projectAlias?.trim();
  const workspaceName = workspace.name.trim();
  if (!projectAlias || projectAlias === workspaceName) {
    return null;
  }
  return projectAlias;
}

export function getWorkspaceSidebarLabel(workspace: WorkspaceInfo) {
  return getWorkspaceSidebarAlias(workspace) ?? workspace.name;
}

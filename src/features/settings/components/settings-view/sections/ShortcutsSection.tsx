import type { KeyboardEvent } from "react";
import { Separator } from "@/components/ui/separator";
import { formatShortcut, getDefaultInterruptShortcut } from "@/utils/shortcuts";

type ShortcutSettingKey =
  | "composerModelShortcut"
  | "composerAccessShortcut"
  | "composerReasoningShortcut"
  | "composerCollaborationShortcut"
  | "interruptShortcut"
  | "newAgentShortcut"
  | "newWorktreeAgentShortcut"
  | "newCloneAgentShortcut"
  | "archiveThreadShortcut"
  | "toggleProjectsSidebarShortcut"
  | "toggleGitSidebarShortcut"
  | "toggleGlobalSearchShortcut"
  | "toggleDebugPanelShortcut"
  | "toggleTerminalShortcut"
  | "cycleAgentNextShortcut"
  | "cycleAgentPrevShortcut"
  | "cycleWorkspaceNextShortcut"
  | "cycleWorkspacePrevShortcut";

type ShortcutDrafts = {
  model: string | null;
  access: string | null;
  reasoning: string | null;
  collaboration: string | null;
  interrupt: string | null;
  newAgent: string | null;
  newWorktreeAgent: string | null;
  newCloneAgent: string | null;
  archiveThread: string | null;
  projectsSidebar: string | null;
  gitSidebar: string | null;
  globalSearch: string | null;
  debugPanel: string | null;
  terminal: string | null;
  cycleAgentNext: string | null;
  cycleAgentPrev: string | null;
  cycleWorkspaceNext: string | null;
  cycleWorkspacePrev: string | null;
};

type ShortcutsSectionProps = {
  active: boolean;
  t: (key: string) => string;
  shortcutDrafts: ShortcutDrafts;
  handleShortcutKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    setting: ShortcutSettingKey,
  ) => void;
  updateShortcut: (setting: ShortcutSettingKey, value: string | null) => Promise<void>;
};

export function ShortcutsSection({
  active,
  t,
  shortcutDrafts,
  handleShortcutKeyDown,
  updateShortcut,
}: ShortcutsSectionProps) {
  if (!active) {
    return null;
  }

  return (
    <section className="settings-section">
      <div className="settings-section-title">{t("settings.shortcutsTitle")}</div>
      <div className="settings-section-subtitle">
        {t("settings.shortcutsDescription")}
      </div>
      <div className="settings-subsection-title">{t("settings.fileSubtitle")}</div>
      <div className="settings-subsection-subtitle">
        {t("settings.fileSubDescription")}
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.newAgent")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.newAgent)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "newAgentShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("newAgentShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+n")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.newWorktreeAgent")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.newWorktreeAgent)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "newWorktreeAgentShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("newWorktreeAgentShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+alt+shift+n")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.newCloneAgent")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.newCloneAgent)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "newCloneAgentShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("newCloneAgentShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+alt+n")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.archiveActiveThread")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.archiveThread)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "archiveThreadShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("archiveThreadShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+ctrl+a")}
        </div>
      </div>
      <Separator className="my-4" />
      <div className="settings-subsection-title">{t("settings.composerSubtitle")}</div>
      <div className="settings-subsection-subtitle">
        {t("settings.composerSubDescription")}
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.cycleModel")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.model)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "composerModelShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("composerModelShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.pressNewShortcut")} {formatShortcut("cmd+shift+m")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.cycleAccessMode")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.access)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "composerAccessShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("composerAccessShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+shift+a")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.cycleReasoningMode")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.reasoning)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "composerReasoningShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("composerReasoningShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+shift+r")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.cycleCollaborationMode")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.collaboration)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "composerCollaborationShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("composerCollaborationShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("shift+tab")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.stopActiveRun")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.interrupt)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "interruptShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("interruptShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut(getDefaultInterruptShortcut())}
        </div>
      </div>
      <Separator className="my-4" />
      <div className="settings-subsection-title">{t("settings.panelsSubtitle")}</div>
      <div className="settings-subsection-subtitle">
        {t("settings.panelsSubDescription")}
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.toggleProjectsSidebar")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.projectsSidebar)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "toggleProjectsSidebarShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("toggleProjectsSidebarShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+shift+p")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.toggleGitSidebar")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.gitSidebar)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "toggleGitSidebarShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("toggleGitSidebarShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+shift+g")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.toggleGlobalSearch")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.globalSearch)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "toggleGlobalSearchShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("toggleGlobalSearchShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+o")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.toggleDebugPanel")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.debugPanel)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "toggleDebugPanelShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("toggleDebugPanelShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+shift+d")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.toggleTerminalPanel")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.terminal)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "toggleTerminalShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("toggleTerminalShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+shift+t")}
        </div>
      </div>
      <Separator className="my-4" />
      <div className="settings-subsection-title">{t("settings.navigationSubtitle")}</div>
      <div className="settings-subsection-subtitle">
        {t("settings.navigationSubDescription")}
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.nextAgent")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.cycleAgentNext)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "cycleAgentNextShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("cycleAgentNextShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+ctrl+down")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.previousAgent")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.cycleAgentPrev)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "cycleAgentPrevShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("cycleAgentPrevShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+ctrl+up")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.nextWorkspace")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.cycleWorkspaceNext)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "cycleWorkspaceNextShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("cycleWorkspaceNextShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+shift+down")}
        </div>
      </div>
      <div className="settings-field">
        <div className="settings-field-label">{t("settings.previousWorkspace")}</div>
        <div className="settings-field-row">
          <input
            className="settings-input settings-input--shortcut"
            value={formatShortcut(shortcutDrafts.cycleWorkspacePrev)}
            onKeyDown={(event) =>
              handleShortcutKeyDown(event, "cycleWorkspacePrevShortcut")
            }
            placeholder={t("settings.typeShortcut")}
            readOnly
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => void updateShortcut("cycleWorkspacePrevShortcut", null)}
          >
            {t("settings.clear")}
          </button>
        </div>
        <div className="settings-help">
          {t("settings.defaultColon")} {formatShortcut("cmd+shift+up")}
        </div>
      </div>
    </section>
  );
}

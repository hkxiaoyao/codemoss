import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

type WorkspaceAliasPromptProps = {
  workspaceName: string;
  alias: string;
  error: string | null;
  isBusy: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function WorkspaceAliasPrompt({
  workspaceName,
  alias,
  error,
  isBusy,
  onChange,
  onCancel,
  onConfirm,
}: WorkspaceAliasPromptProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      className="worktree-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t("sidebar.workspaceAliasDialogTitle")}
    >
      <div className="worktree-modal-backdrop" onClick={isBusy ? undefined : onCancel} />
      <div className="worktree-modal-card">
        <div className="worktree-modal-title">
          {t("sidebar.workspaceAliasDialogTitle")}
        </div>
        <div className="worktree-modal-subtitle">
          {t("sidebar.workspaceAliasDialogSubtitle", { name: workspaceName })}
        </div>
        <label className="worktree-modal-label" htmlFor="workspace-alias">
          {t("sidebar.workspaceAliasLabel")}
        </label>
        <input
          id="workspace-alias"
          ref={inputRef}
          className="worktree-modal-input"
          value={alias}
          placeholder={t("sidebar.workspaceAliasPlaceholder")}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              if (!isBusy) {
                onCancel();
              }
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (!isBusy) {
                onConfirm();
              }
            }
          }}
          disabled={isBusy}
        />
        <div className="worktree-modal-hint">
          {t("sidebar.workspaceAliasEmptyHint")}
        </div>
        {error ? <div className="worktree-modal-error">{error}</div> : null}
        <div className="worktree-modal-actions">
          <button
            className="ghost worktree-modal-button"
            onClick={onCancel}
            type="button"
            disabled={isBusy}
          >
            {t("common.cancel")}
          </button>
          <button
            className="primary worktree-modal-button"
            onClick={onConfirm}
            type="button"
            disabled={isBusy}
          >
            {isBusy ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

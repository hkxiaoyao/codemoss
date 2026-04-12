import { memo } from "react";
import { useTranslation } from "react-i18next";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import XCircle from "lucide-react/dist/esm/icons/x-circle";
import type { SubagentInfo } from "../types";

interface SubagentListProps {
  subagents: SubagentInfo[];
  onSelectSubagent?: (agent: SubagentInfo) => void;
}

const STATUS_ICON = {
  running: Loader2,
  completed: CheckCircle2,
  error: XCircle,
} as const;

export const SubagentList = memo(function SubagentList({
  subagents,
  onSelectSubagent,
}: SubagentListProps) {
  const { t } = useTranslation();
  if (subagents.length === 0) {
    return <div className="sp-empty">{t("statusPanel.emptySubagents")}</div>;
  }
  return (
    <div className="sp-subagent-list">
      {subagents.map((agent) => {
        const Icon = STATUS_ICON[agent.status] ?? Loader2;
        const isInteractive = Boolean(agent.navigationTarget && onSelectSubagent);
        const className = `sp-subagent-item sp-subagent-${agent.status}${
          isInteractive ? " is-clickable" : ""
        }`;
        const content = (
          <>
            <span className="sp-subagent-icon">
              <Icon size={14} />
            </span>
            <span className="sp-subagent-type">{agent.type}</span>
            <span className="sp-subagent-desc" title={agent.description}>
              {agent.description}
            </span>
          </>
        );
        return (
          isInteractive ? (
            <button
              key={agent.id}
              type="button"
              className={className}
              onClick={() => onSelectSubagent?.(agent)}
            >
              {content}
            </button>
          ) : (
            <div
              key={agent.id}
              className={className}
            >
              {content}
            </div>
          )
        );
      })}
    </div>
  );
});

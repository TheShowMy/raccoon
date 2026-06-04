import { CheckCircle2, ClipboardCheck, Loader2 } from "lucide-react";
import type { TaskDraft } from "../../api/client";

interface ConfirmPanelProps {
  taskDrafts: TaskDraft[];
  confirming: boolean;
  onConfirm: () => void;
}

export function ConfirmPanel({
  taskDrafts,
  confirming,
  onConfirm,
}: ConfirmPanelProps) {
  const primary = taskDrafts[0];

  return (
    <div className="rounded-lg border border-indigo-100 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-900">确认需求</h3>
        </div>
        <button
          onClick={onConfirm}
          disabled={confirming}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {confirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          确认并归档
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">
            {primary?.title || "确认后的需求"}
          </h4>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {primary?.description || "Coordinator 已整理当前需求范围。"}
          </p>
        </div>
        {primary?.acceptanceCriteria.length > 0 && (
          <div className="space-y-1">
            {primary.acceptanceCriteria.map((item) => (
              <div
                key={item}
                className="flex items-start gap-2 text-xs leading-5 text-slate-500"
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

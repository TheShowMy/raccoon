import { FolderOpen, Plus } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-5">
        {icon || <FolderOpen className="w-8 h-8 text-slate-300" />}
      </div>
      <h3 className="text-base font-semibold text-slate-700 mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-slate-400 mb-5 max-w-xs">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          {action.label}
        </button>
      )}
    </div>
  );
}

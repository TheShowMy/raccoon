import { MessageSquare } from "lucide-react";

export function EmptyChat() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-12">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white">
          <MessageSquare className="h-5 w-5" />
        </div>
        <p className="text-sm font-semibold text-slate-700">新的需求会话</p>
        <p className="mt-1 text-sm text-slate-400">
          在底部输入需求，Coordinator 会边分析边推进澄清。
        </p>
      </div>
    </div>
  );
}

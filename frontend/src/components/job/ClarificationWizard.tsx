import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  Loader2,
  Send,
  SkipForward,
} from "lucide-react";
import type { ClarificationItem, ClarificationOption } from "../../api/client";
import type { DraftAnswer } from "./types";

interface ClarificationWizardProps {
  round: number;
  clarifications: ClarificationItem[];
  answers: Record<number, DraftAnswer>;
  submitting: boolean;
  onSubmit: () => void;
  onSingleChoice: (clarificationId: number, value: string) => void;
  onMultiChoice: (clarificationId: number, value: string) => void;
  onFreeTextChange: (clarificationId: number, text: string) => void;
  onCustomTextChange: (clarificationId: number, text: string) => void;
}

export function ClarificationWizard({
  round,
  clarifications,
  answers,
  submitting,
  onSubmit,
  onSingleChoice,
  onMultiChoice,
  onFreeTextChange,
  onCustomTextChange,
}: ClarificationWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const item = clarifications[currentStep];
  const answer = answers[item.id] || createEmptyAnswer(item);
  const isAnswered = hasAnswer(item, answer);
  const isLastStep = currentStep === clarifications.length - 1;
  const allAnswered = clarifications.every((q) => hasAnswer(q, answers[q.id]));

  // 轮次警告
  const showRoundWarning = round >= 3;
  const showEscapeHatch = round >= 4;

  return (
    <div className="max-w-[86%] rounded-lg border border-amber-100 bg-amber-50/40 p-4">
      {/* 头部：标题 + 进度 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileQuestion className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-slate-900">需要你确认</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{
                width: `${((currentStep + 1) / clarifications.length) * 100}%`,
              }}
            />
          </div>
          <span className="text-xs text-slate-500">
            {currentStep + 1} / {clarifications.length}
          </span>
        </div>
      </div>

      {/* 轮次警告 */}
      {showRoundWarning && (
        <div
          className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            showEscapeHatch
              ? "bg-rose-50 text-rose-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">
              已进行第 {round} 轮澄清
              {showEscapeHatch ? "，需求可能比较复杂或不够明确。" : "。"}
            </p>
            {showEscapeHatch && (
              <p className="mt-0.5">
                如果问题难以收敛，可以直接跳过澄清生成确认卡片。
              </p>
            )}
          </div>
        </div>
      )}

      {/* 已回答问题摘要（可点击跳转） */}
      {currentStep > 0 && (
        <div className="mb-3 space-y-1">
          {clarifications.slice(0, currentStep).map((q, idx) => (
            <button
              key={q.id}
              onClick={() => setCurrentStep(idx)}
              className="flex w-full items-center gap-2 rounded-md bg-white/60 px-2.5 py-1.5 text-left text-xs text-slate-600 transition hover:bg-white"
            >
              <Check className="h-3 w-3 text-emerald-500" />
              <span className="truncate">{q.question}</span>
            </button>
          ))}
        </div>
      )}

      {/* 当前问题 */}
      <ClarificationCard
        item={item}
        index={currentStep}
        answer={answer}
        onSingleChoice={(value) => onSingleChoice(item.id, value)}
        onMultiChoice={(value) => onMultiChoice(item.id, value)}
        onFreeTextChange={(text) => onFreeTextChange(item.id, text)}
        onCustomTextChange={(text) => onCustomTextChange(item.id, text)}
      />

      {/* 底部操作栏 */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-amber-100 pt-3">
        <button
          onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
          disabled={currentStep === 0}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          上一步
        </button>

        <div className="flex items-center gap-2">
          {/* 逃生舱按钮 */}
          {showEscapeHatch && (
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SkipForward className="h-3.5 w-3.5" />
              跳过并生成
            </button>
          )}

          {isLastStep ? (
            <button
              onClick={onSubmit}
              disabled={submitting || !allAnswered}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              提交答案
            </button>
          ) : (
            <button
              onClick={() =>
                setCurrentStep((s) =>
                  Math.min(clarifications.length - 1, s + 1),
                )
              }
              disabled={!isAnswered}
              className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              下一步
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function createEmptyAnswer(item: ClarificationItem): DraftAnswer {
  return {
    selectedOptions: item.answer?.selectedOptions || [],
    freeText:
      item.questionType === "free_text" ? item.answer?.customText || "" : "",
    customText: item.answer?.customText || "",
  };
}

function hasAnswer(item: ClarificationItem, answer?: DraftAnswer): boolean {
  if (!answer) return false;
  if (item.questionType === "free_text") {
    return answer.freeText.trim().length > 0;
  }
  const hasOption = answer.selectedOptions.some(
    (option) => option !== "__other__",
  );
  const hasCustom =
    answer.selectedOptions.includes("__other__") &&
    answer.customText.trim().length > 0;
  return hasOption || hasCustom;
}

interface ClarificationCardProps {
  item: ClarificationItem;
  index: number;
  answer: DraftAnswer;
  onSingleChoice: (value: string) => void;
  onMultiChoice: (value: string) => void;
  onFreeTextChange: (text: string) => void;
  onCustomTextChange: (text: string) => void;
}

function ClarificationCard({
  item,
  index,
  answer,
  onSingleChoice,
  onMultiChoice,
  onFreeTextChange,
  onCustomTextChange,
}: ClarificationCardProps) {
  const isMulti = item.questionType === "multi_choice";
  const isText = item.questionType === "free_text";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700">
          Q{index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-slate-800">
            {item.question}
          </h4>
          <p className="mt-1 text-xs text-slate-400">
            {item.questionType === "single_choice" && "单选"}
            {item.questionType === "multi_choice" && "多选"}
            {item.questionType === "free_text" && "自由文本"}
          </p>
        </div>
      </div>

      {isText ? (
        <textarea
          value={answer.freeText}
          onChange={(event) => onFreeTextChange(event.target.value)}
          rows={3}
          placeholder="输入你的补充说明..."
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
        />
      ) : (
        <div className="space-y-2">
          {item.options.map((option) => (
            <ChoiceOption
              key={option.label}
              option={option}
              active={answer.selectedOptions.includes(option.label)}
              multi={isMulti}
              onClick={() =>
                isMulti
                  ? onMultiChoice(option.label)
                  : onSingleChoice(option.label)
              }
            />
          ))}

          {item.allowCustom && (
            <>
              <button
                onClick={() =>
                  isMulti
                    ? onMultiChoice("__other__")
                    : onSingleChoice("__other__")
                }
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                  answer.selectedOptions.includes("__other__")
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <ChoiceMark
                  active={answer.selectedOptions.includes("__other__")}
                  multi={isMulti}
                />
                <span className="text-sm font-medium">其他（手动输入）</span>
              </button>

              {answer.selectedOptions.includes("__other__") && (
                <input
                  value={answer.customText}
                  onChange={(event) => onCustomTextChange(event.target.value)}
                  placeholder="填写其他答案..."
                  className="ml-7 w-[calc(100%-1.75rem)] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChoiceOption({
  option,
  active,
  multi,
  onClick,
}: {
  option: ClarificationOption;
  active: boolean;
  multi: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
        active
          ? "border-slate-800 bg-slate-800 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <ChoiceMark active={active} multi={multi} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{option.label}</span>
        {option.description && (
          <span
            className={`mt-0.5 block text-xs leading-5 ${
              active ? "text-slate-200" : "text-slate-500"
            }`}
          >
            {option.description}
          </span>
        )}
        {option.recommended && (
          <span
            className={`mt-1 inline-flex text-[10px] font-medium ${
              active ? "text-slate-300" : "text-slate-400"
            }`}
          >
            推荐
          </span>
        )}
      </span>
    </button>
  );
}

function ChoiceMark({ active, multi }: { active: boolean; multi: boolean }) {
  return (
    <span
      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border ${
        multi ? "rounded" : "rounded-full"
      } ${
        active
          ? "border-white/80 bg-white text-slate-900"
          : "border-slate-300 bg-white text-transparent"
      }`}
    >
      <Check className="h-3 w-3" />
    </span>
  );
}

import type { ReactNode } from "react";
import type {
  ClarificationItem,
  ClarificationOption,
  Job,
  JobMessage,
  JobStatus,
  SubmitClarificationAnswer,
  TaskDraft,
} from "../../api/client";

export type MessageType = { type: "success" | "error"; text: string };

export interface DraftAnswer {
  selectedOptions: string[];
  freeText: string;
  customText: string;
}

export interface StreamEvent {
  jobId: number;
  event: string;
  message: string;
}

export const OTHER_VALUE = "__other__";

export interface StatusConfig {
  label: string;
  className: string;
  icon: ReactNode;
}

export function createEmptyAnswer(item: ClarificationItem): DraftAnswer {
  return {
    selectedOptions: item.answer?.selectedOptions || [],
    freeText:
      item.questionType === "free_text" ? item.answer?.customText || "" : "",
    customText: item.answer?.customText || "",
  };
}

export function createInitialAnswers(
  items: ClarificationItem[],
): Record<number, DraftAnswer> {
  const nextAnswers: Record<number, DraftAnswer> = {};
  for (const item of items) {
    nextAnswers[item.id] = createEmptyAnswer(item);
  }
  return nextAnswers;
}

export function hasAnswer(
  item: ClarificationItem,
  answer?: DraftAnswer,
): boolean {
  if (!answer) return false;
  if (item.questionType === "free_text") {
    return answer.freeText.trim().length > 0;
  }
  const hasOption = answer.selectedOptions.some(
    (option) => option !== OTHER_VALUE,
  );
  const hasCustom =
    answer.selectedOptions.includes(OTHER_VALUE) &&
    answer.customText.trim().length > 0;
  return hasOption || hasCustom;
}

export function buildSubmitAnswer(
  item: ClarificationItem,
  answer: DraftAnswer,
): SubmitClarificationAnswer {
  if (item.questionType === "free_text") {
    return {
      clarificationId: item.id,
      selectedOptions: [],
      customText: answer.freeText.trim(),
    };
  }

  return {
    clarificationId: item.id,
    selectedOptions: answer.selectedOptions.filter(
      (option) => option !== OTHER_VALUE,
    ),
    customText: answer.selectedOptions.includes(OTHER_VALUE)
      ? answer.customText.trim()
      : undefined,
  };
}

export function getJobTitle(job: Job): string {
  return job.title || job.originalRequirement.slice(0, 32) || "未命名任务";
}

export {
  type ClarificationItem,
  type ClarificationOption,
  type Job,
  type JobMessage,
  type JobStatus,
  type SubmitClarificationAnswer,
  type TaskDraft,
};

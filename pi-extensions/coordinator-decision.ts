/**
 * Raccoon Coordinator 结构化输出扩展
 *
 * 注册 submit_coordinator_decision 工具，让 Coordinator LLM
 * 通过 tool use 输出结构化决策数据，彻底避免文本解析的不确定性。
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const OptionSchema = Type.Object({
	label: Type.String({ description: "短选项文本" }),
	description: Type.String({ description: "选择该项的影响或取舍" }),
	recommended: Type.Boolean({
		default: false,
		description: "是否为推荐选项",
	}),
});

const ClarificationSchema = Type.Object({
	question: Type.String({ description: "澄清问题文本" }),
	type: Type.String({
		enum: ["single_choice", "multi_choice", "free_text"],
		description: "问题类型",
	}),
	options: Type.Optional(
		Type.Array(OptionSchema, { description: "选项列表（free_text 可为空）" }),
	),
	allowCustom: Type.Optional(
		Type.Boolean({ default: true, description: "是否允许自定义输入" }),
	),
});

const DraftSchema = Type.Object({
	title: Type.String({ description: "确认需求标题" }),
	summary: Type.String({ description: "最终需求范围摘要" }),
	acceptanceCriteria: Type.Optional(
		Type.Array(Type.String(), { description: "验收标准列表" }),
	),
});

const submitDecisionTool = defineTool({
	name: "submit_coordinator_decision",
	label: "Submit Coordinator Decision",
	description:
		"作为 raccoon Requirement Analyst，提交你对用户需求的最终分析决策。本工具只用于需求澄清和确认，禁止包含任务拆分、DAG、执行计划或节点依赖。",
	promptSnippet: "Submit the final requirement analysis decision as structured data",
	promptGuidelines: [
		"Use submit_coordinator_decision as your final action after analyzing the user's requirement.",
		"All user-visible fields must be written in Simplified Chinese, including progress, clarification questions, options, draft title, summary, and acceptance criteria.",
		"Do not output English thinking text, English progress text, or mixed-language analysis unless preserving technical names, file names, or API names.",
		"Set status to 'needs_clarification' only when an uncertainty affects the implementation path, acceptance criteria, data compatibility, or security boundary.",
		"Set status to 'ready' when missing details can be handled by project conventions, minimal viable scope, or safe defaults; include those assumptions in the draft.",
		"When status is 'needs_clarification', provide 1-6 clarification questions with meaningful tradeoffs.",
		"For single_choice and multi_choice questions, provide 2-4 mutually exclusive options and put the sole recommended option first when one exists.",
		"When status is 'ready', provide the task draft with title, summary, and acceptance criteria.",
		"Do not split the work into tasks, do not create a DAG, and do not include execution plans.",
	],
	parameters: Type.Object({
		status: Type.String({
			enum: ["needs_clarification", "ready"],
			description: "决策状态",
		}),
		progress: Type.String({
			description: "给用户看的简短过程说明，说明你正在判断什么",
		}),
		clarifications: Type.Optional(
			Type.Array(ClarificationSchema, {
				description: "澄清问题列表（needs_clarification 时必填）",
			}),
		),
		draft: Type.Optional(
			DraftSchema,
		),
	}),

	async execute(_toolCallId, params) {
		return {
			content: [
				{ type: "text", text: "Coordinator decision submitted successfully." },
			],
			details: params,
			terminate: true,
		};
	},
});

export default function (pi: ExtensionAPI) {
	pi.registerTool(submitDecisionTool);
}

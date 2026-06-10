/**
 * Raccoon DAG Planner 结构化输出扩展
 *
 * 只注册 submit_dag_plan 工具。该扩展用于已确认需求之后的任务拆分，
 * 不参与需求澄清和需求确认。
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const DagNodeSchema = Type.Object({
	id: Type.String({
		description: "DAG 节点唯一 ID，只能使用小写字母、数字、下划线和短横线",
	}),
	title: Type.String({ description: "节点标题，使用简体中文" }),
	kind: Type.Union(
		[
			Type.Literal("backend"),
			Type.Literal("frontend"),
			Type.Literal("review"),
			Type.Literal("browser"),
			Type.Literal("vision"),
			Type.Literal("docs"),
			Type.Literal("test"),
		],
		{ description: "节点类型" },
	),
	workerIdentity: Type.Union(
		[
			Type.Literal("coder"),
			Type.Literal("reviewer"),
			Type.Literal("browser"),
			Type.Literal("vision"),
		],
		{ description: "执行该节点的 worker 身份" },
	),
	instructions: Type.String({
		description: "节点执行说明，必须包含目标、修改范围、依赖输入和验收步骤",
	}),
	acceptanceCriteria: Type.Array(Type.String(), {
		description: "节点验收标准，使用简体中文，至少包含一个可执行命令或明确人工检查步骤",
	}),
	targetFiles: Type.Array(Type.String(), {
		description: "预计影响的文件路径，必须尽量具体",
	}),
	dependsOn: Type.Optional(
		Type.Array(Type.String(), { description: "前置节点 ID 列表" }),
	),
});

const submitDagPlanTool = defineTool({
	name: "submit_dag_plan",
	label: "Submit DAG Plan",
	description:
		"作为 raccoon DAG Planner，将已确认需求拆分为可执行的无环 DAG。在规划完成后必须调用此工具一次。",
	promptSnippet: "Submit the executable DAG plan as structured data",
	promptGuidelines: [
		"Use submit_dag_plan as your final action after splitting the confirmed requirement into executable tasks.",
		"All user-visible fields must be written in Simplified Chinese, except technical names, file names, and API names.",
		"Do not repeat the confirmed requirement as task instructions; produce engineering decomposition based on repository structure.",
		"The DAG must be acyclic; node IDs must be unique and dependencies must reference existing node IDs.",
		"Each node must include concrete targetFiles, instructions, and acceptance criteria.",
		"If two nodes may modify the same file, serialize them with dependsOn.",
	],
	parameters: Type.Object({
		nodes: Type.Array(DagNodeSchema, {
			description: "DAG 节点列表",
		}),
	}),

	async execute(_toolCallId, params) {
		return {
			content: [
				{ type: "text", text: "DAG plan submitted successfully." },
			],
			details: params,
			terminate: true,
		};
	},
});

export default function (pi: ExtensionAPI) {
	pi.registerTool(submitDagPlanTool);
}

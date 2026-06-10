import { useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileCode2,
  Loader2,
  Maximize2,
  Minimize2,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type {
  DagEdge,
  DagNode,
  JobMessage,
  TaskArtifact,
} from "../../api/client";
import type { StreamEvent } from "./types";
import { TraceBubble } from "./TraceBubble";
import { buildBubbleStreamFromEvents } from "./traceRuntime";

interface DagPanelProps {
  nodes: DagNode[];
  edges: DagEdge[];
  artifacts: TaskArtifact[];
  jobStatus: string;
  streamMessages?: StreamEvent[];
  messages?: JobMessage[];
  onReplan?: () => void;
  replanning?: boolean;
  isFullscreen?: boolean;
  onFullscreenChange?: (v: boolean) => void;
  onResume?: () => void;
  resuming?: boolean;
}

type FlowNodeData = {
  dagNode: DagNode;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "等待中",
  ready: "可执行",
  running: "执行中",
  succeeded: "已完成",
  failed: "失败",
  blocked: "阻塞",
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "border-slate-200 bg-white text-slate-500",
  ready: "border-sky-200 bg-sky-50 text-sky-700",
  running: "border-amber-200 bg-amber-50 text-amber-700",
  succeeded: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
  blocked: "border-orange-200 bg-orange-50 text-orange-700",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] || status;
}

function statusClass(status: string) {
  return STATUS_CLASSES[status] || STATUS_CLASSES.pending;
}

function DagFlowNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const node = data.dagNode;
  const running = node.status === "running";

  return (
    <div
      className={`w-56 rounded-lg border px-3 py-2 shadow-sm ${statusClass(
        node.status,
      )}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">{node.title}</div>
          <div className="mt-1 truncate text-[11px] opacity-75">
            {node.kind} / {node.workerIdentity}
          </div>
        </div>
        {running ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : node.status === "succeeded" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : node.status === "failed" || node.status === "blocked" ? (
          <AlertCircle className="h-4 w-4 shrink-0" />
        ) : (
          <Clock3 className="h-4 w-4 shrink-0" />
        )}
      </div>
      <div className="mt-2 inline-flex rounded border border-current/20 px-1.5 py-0.5 text-[10px] font-medium">
        {statusLabel(node.status)}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = {
  dagNode: DagFlowNode,
};

export function DagPanel({
  nodes,
  edges,
  artifacts,
  jobStatus,
  streamMessages = [],
  messages = [],
  onReplan,
  replanning = false,
  isFullscreen = false,
  onFullscreenChange,
  onResume,
  resuming = false,
}: DagPanelProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const selectedNode =
    nodes.find((node) => node.id === selectedNodeId) || nodes[0] || null;
  const selectedArtifacts = selectedNode
    ? artifacts.filter((artifact) => artifact.nodeId === selectedNode.id)
    : [];
  const selectedArtifact = selectedArtifacts[0] || null;

  const flowNodes = useMemo<Node<FlowNodeData>[]>(() => {
    const levels = calculateLevels(nodes, edges);
    const levelIndexes = new Map<number, number>();

    return nodes.map((node) => {
      const level = levels.get(node.id) || 0;
      const index = levelIndexes.get(level) || 0;
      levelIndexes.set(level, index + 1);

      return {
        id: String(node.id),
        type: "dagNode",
        position: { x: level * 300, y: index * 140 },
        data: { dagNode: node },
      };
    });
  }, [edges, nodes]);

  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge) => ({
        id: String(edge.id),
        source: String(edge.fromNodeId),
        target: String(edge.toNodeId),
        animated: nodes.some(
          (node) => node.id === edge.toNodeId && node.status === "running",
        ),
      })),
    [edges, nodes],
  );

  const liveBubbles = useMemo(() => {
    if (jobStatus !== "dag_planning" || streamMessages.length === 0)
      return null;
    return buildBubbleStreamFromEvents(streamMessages);
  }, [jobStatus, streamMessages]);

  if (nodes.length === 0) {
    const hasLiveBubbles = liveBubbles && liveBubbles.length > 0;
    const fallbackEvents = streamMessages.filter((m) => m.event === "pi_event");
    const isFailed = jobStatus === "dag_planning_failed";
    const lastError = isFailed
      ? messages.filter((m) => m.role === "system").slice(-1)[0]?.content
      : null;

    return (
      <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Network className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-900">任务 DAG</h3>
          <span className="ml-auto rounded border border-slate-200 px-2 py-1 text-xs text-slate-500">
            {statusLabel(jobStatus)}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center overflow-y-auto p-6">
          <div className="flex flex-col items-center py-2">
            {isFailed ? (
              <>
                <AlertCircle className="h-10 w-10 text-rose-500" />
                <p className="mt-3 text-sm font-semibold text-rose-700">
                  DAG 规划失败
                </p>
                {lastError ? (
                  <p className="mt-2 max-w-lg text-center text-xs text-slate-500">
                    {lastError}
                  </p>
                ) : null}
                {onReplan && (
                  <button
                    onClick={onReplan}
                    disabled={replanning}
                    className="mt-4 flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {replanning && <Loader2 className="h-4 w-4 animate-spin" />}
                    重新规划
                  </button>
                )}
              </>
            ) : (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                <p className="mt-3 text-sm font-medium text-slate-700">
                  DAG 规划中
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Coordinator 正在把确认需求拆分为可执行任务…
                </p>
              </>
            )}
          </div>

          {hasLiveBubbles ? (
            <div className="mt-4 w-full max-w-2xl">
              <TraceBubble bubbles={liveBubbles} isLive={true} />
            </div>
          ) : fallbackEvents.length > 0 ? (
            <div className="mt-4 w-full max-w-lg space-y-2">
              {fallbackEvents.slice(-5).map((evt, i) => (
                <div
                  key={i}
                  className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                >
                  {evt.message}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 flex flex-col bg-white"
    : "flex h-full flex-col rounded-lg border border-slate-200 bg-white";

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-900">任务 DAG</h3>
        </div>
        <div className="flex items-center gap-2">
          {jobStatus === "blocked" && onResume && (
            <button
              onClick={onResume}
              disabled={resuming}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resuming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              继续执行
            </button>
          )}
          {nodes.length > 0 && (
            <button
              onClick={() => setDetailOpen((v) => !v)}
              className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              title={detailOpen ? "收起详情" : "展开详情"}
            >
              {detailOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            onClick={() => onFullscreenChange?.(!isFullscreen)}
            className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title={isFullscreen ? "退出全屏" : "全屏"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
          <span className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500">
            {statusLabel(jobStatus)}
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 border-r border-slate-100">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.1}
            maxZoom={2}
            panOnScroll
            zoomOnScroll
            onNodeClick={(_, node) => setSelectedNodeId(Number(node.id))}
          >
            <Background />
            <Controls />
            <MiniMap className="!bg-white/90" />
          </ReactFlow>
        </div>

        {detailOpen && (
          <aside className="w-80 min-w-0 overflow-y-auto p-4">
            {selectedNode ? (
              <NodeDetail node={selectedNode} artifacts={selectedArtifacts} />
            ) : (
              <p className="text-sm text-slate-500">选择一个节点查看详情。</p>
            )}

            {selectedArtifact && (
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
                  <FileCode2 className="h-3.5 w-3.5" />
                  {selectedArtifact.path || selectedArtifact.artifactType}
                </div>
                <Editor
                  height="220px"
                  language="markdown"
                  value={selectedArtifact.content}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                    wordWrap: "on",
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function NodeDetail({
  node,
  artifacts,
}: {
  node: DagNode;
  artifacts: TaskArtifact[];
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-900">{node.title}</h4>
          <p className="mt-1 text-xs text-slate-500">
            {node.kind} / {node.workerIdentity}
          </p>
        </div>
        <span
          className={`shrink-0 rounded border px-2 py-1 text-xs ${statusClass(
            node.status,
          )}`}
        >
          {statusLabel(node.status)}
        </span>
      </div>

      <section className="mt-4">
        <h5 className="text-xs font-semibold text-slate-700">执行说明</h5>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-500">
          {node.instructions}
        </p>
      </section>

      <section className="mt-4">
        <h5 className="text-xs font-semibold text-slate-700">验收标准</h5>
        <ul className="mt-1 space-y-1">
          {node.acceptanceCriteria.map((item) => (
            <li
              key={item}
              className="flex gap-2 text-xs leading-5 text-slate-500"
            >
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {node.targetFiles.length > 0 && (
        <section className="mt-4">
          <h5 className="text-xs font-semibold text-slate-700">目标文件</h5>
          <div className="mt-1 space-y-1">
            {node.targetFiles.map((file) => (
              <div
                key={file}
                className="truncate rounded border border-slate-100 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-500"
              >
                {file}
              </div>
            ))}
          </div>
        </section>
      )}

      {(node.resultSummary || node.errorMessage) && (
        <section className="mt-4">
          <h5 className="text-xs font-semibold text-slate-700">执行结果</h5>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-500">
            {node.resultSummary || node.errorMessage}
          </p>
        </section>
      )}

      <section className="mt-4">
        <h5 className="text-xs font-semibold text-slate-700">产物</h5>
        <p className="mt-1 text-xs text-slate-500">
          {artifacts.length > 0
            ? `已生成 ${artifacts.length} 个可查看产物。`
            : "暂无产物。"}
        </p>
      </section>
    </div>
  );
}

function calculateLevels(nodes: DagNode[], edges: DagEdge[]) {
  const levels = new Map<number, number>();
  const incoming = new Map<number, number[]>();
  for (const edge of edges) {
    incoming.set(edge.toNodeId, [
      ...(incoming.get(edge.toNodeId) || []),
      edge.fromNodeId,
    ]);
  }

  const resolve = (nodeId: number): number => {
    if (levels.has(nodeId)) return levels.get(nodeId) || 0;
    const parents = incoming.get(nodeId) || [];
    const level =
      parents.length === 0
        ? 0
        : Math.max(...parents.map((parentId) => resolve(parentId))) + 1;
    levels.set(nodeId, level);
    return level;
  };

  for (const node of nodes) {
    resolve(node.id);
  }
  return levels;
}

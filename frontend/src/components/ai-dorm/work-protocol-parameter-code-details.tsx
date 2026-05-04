import type {
  WorkProtocolGroomingAuditEvent,
  WorkProtocolGroomingAuditSeverity,
} from "@/lib/work-protocol/grooming-audit";

export type ProtocolParameterCodeBlock = {
  id: string;
  target: "protocol" | "node" | "edge";
  targetId: string;
  label: string;
  status: "fresh" | "invalid";
  language: "json";
  code: Record<string, unknown>;
};

type ParameterSummaryItem = {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "danger";
};

type ParameterSummarySection = {
  title: string;
  items: ParameterSummaryItem[];
};

type ParameterCandidateOption = {
  id: string;
  label: string;
  value: string;
  active: boolean;
};

type ParameterCandidateSlot = {
  id: string;
  label: string;
  currentValue: string;
  description: string;
  options: ParameterCandidateOption[];
};

type ParameterCandidateSection = {
  title: string;
  slots: ParameterCandidateSlot[];
};

type ParameterPatchPreviewTarget =
  | { kind: "node"; nodeId: string }
  | { kind: "edge"; edgeId: string };

type ParameterPatchPreviewPayload = {
  target: ParameterPatchPreviewTarget;
  path: string;
  value: unknown;
};

export type ParameterPatchCandidatePreview = {
  block: ProtocolParameterCodeBlock;
  slot: ParameterCandidateSlot;
  option: ParameterCandidateOption;
  payload: ParameterPatchPreviewPayload;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asText(value: unknown, fallback = "未设置") {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
}

function compactJsonValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `${value.length} 项`;
  }

  if (isPlainRecord(value)) {
    return `${Object.keys(value).length} 字段`;
  }

  return "未设置";
}

function namedArrayPreview(
  value: unknown,
  keys: string[] = ["name", "id", "label", "jsonPath"],
) {
  if (!Array.isArray(value)) {
    return "0 项";
  }

  if (value.length === 0) {
    return "0 项";
  }

  const names = value
    .map((item) => {
      if (!isPlainRecord(item)) {
        return undefined;
      }

      for (const key of keys) {
        const candidate = item[key];
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate;
        }
      }

      return undefined;
    })
    .filter((item): item is string => Boolean(item));

  if (names.length === 0) {
    return `${value.length} 项`;
  }

  const suffix = value.length > 2 ? ` 等 ${value.length} 项` : "";
  return `${names.slice(0, 2).join("、")}${suffix}`;
}

function namedArrayValues(
  value: unknown,
  keys: string[] = ["name", "id", "label", "jsonPath"],
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string" && item.trim()) {
        return item;
      }

      if (!isPlainRecord(item)) {
        return undefined;
      }

      for (const key of keys) {
        const candidate = item[key];
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate;
        }
      }

      return undefined;
    })
    .filter((item): item is string => Boolean(item));
}

function getRecord(value: unknown, key: string) {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const child = value[key];
  return isPlainRecord(child) ? child : undefined;
}

function getNestedRecord(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, key) => getRecord(current, key), value);
}

function contractSummary(value: unknown) {
  if (!isPlainRecord(value)) {
    return "未绑定";
  }

  const id = asText(value.id);
  const status = asText(value.status, "");
  return status ? `${id} / ${status}` : id;
}

function itemToneClass(tone: ParameterSummaryItem["tone"]) {
  if (tone === "good") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (tone === "warn") {
    return "bg-amber-50 text-amber-700";
  }

  if (tone === "danger") {
    return "bg-rose-50 text-rose-700";
  }

  return "bg-white text-slate-600";
}

function riskItemTone(value: unknown): ParameterSummaryItem["tone"] {
  if (value === "critical" || value === "high") {
    return "danger";
  }

  if (value === "medium") {
    return "warn";
  }

  return "neutral";
}

function approvalItemTone(value: unknown): ParameterSummaryItem["tone"] {
  return value === "required" ? "warn" : "neutral";
}

function uniqueTextValues(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function makeCandidateSlot(params: {
  id: string;
  label: string;
  currentValue?: unknown;
  candidates: unknown[];
  description: string;
}): ParameterCandidateSlot | null {
  const currentValue = asText(params.currentValue, "");
  const values = uniqueTextValues([currentValue, ...params.candidates]);

  if (values.length === 0) {
    return null;
  }

  return {
    id: params.id,
    label: params.label,
    currentValue: currentValue || "未设置",
    description: params.description,
    options: values.map((value) => ({
      id: `${params.id}:${value}`,
      label: value,
      value,
      active: value === currentValue,
    })),
  };
}

function compactSlots(
  slots: Array<ParameterCandidateSlot | null>,
): ParameterCandidateSlot[] {
  return slots.filter((slot): slot is ParameterCandidateSlot => Boolean(slot));
}

function buildNodeCandidateSections(
  code: Record<string, unknown>,
): ParameterCandidateSection[] {
  const contractOptions = getRecord(code, "contractParameterOptions");
  const contracts = getRecord(code, "capabilityContracts");
  const executionContract = getRecord(contracts, "execution");
  const departmentScopeContract = getRecord(contracts, "departmentScope");
  const failurePolicy = getRecord(code, "failurePolicy");

  return [
    {
      title: "执行槽位",
      slots: compactSlots([
        makeCandidateSlot({
          id: "node.executionTarget",
          label: "执行对象",
          currentValue:
            code.callableId ?? code.agentId ?? code.writableObjectKind,
          candidates: [executionContract?.id],
          description: "选择 Tool、Skill、RAG、AI员工或写入对象。",
        }),
        makeCandidateSlot({
          id: "node.departmentScopeId",
          label: "部门范围",
          currentValue: code.departmentScopeId,
          candidates: [departmentScopeContract?.id, contractOptions?.scopes],
          description: "限定该节点可见和可操作的资源范围。",
        }),
        makeCandidateSlot({
          id: "node.executorKind",
          label: "执行器类型",
          currentValue: code.executorKind,
          candidates: ["bp_ask", "system", "tool", "skill", "rag", "agent", "control", "human", "write"],
          description: "决定运行时把任务交给哪类执行器。",
        }),
      ]),
    },
    {
      title: "输入输出槽位",
      slots: compactSlots([
        makeCandidateSlot({
          id: "node.inputBindings",
          label: "输入绑定",
          currentValue: namedArrayPreview(code.inputBindings),
          candidates: [
            namedArrayValues(code.inputBindings),
            namedArrayValues(contractOptions?.requiredInputs, ["id", "name", "label"]),
            namedArrayValues(contractOptions?.optionalInputs, ["id", "name", "label"]),
          ],
          description: "把上游上下文绑定到该节点输入。",
        }),
        makeCandidateSlot({
          id: "node.outputFields",
          label: "输出字段",
          currentValue: namedArrayPreview(code.outputFields),
          candidates: [
            namedArrayValues(code.outputFields),
            namedArrayValues(contractOptions?.outputs, ["id", "name", "label"]),
          ],
          description: "声明该节点会产出哪些字段。",
        }),
      ]),
    },
    {
      title: "控制槽位",
      slots: compactSlots([
        makeCandidateSlot({
          id: "node.riskLevel",
          label: "风险等级",
          currentValue: code.riskLevel,
          candidates: ["none", "low", "medium", "high", "critical"],
          description: "运行前闸门会用它决定是否需要额外确认。",
        }),
        makeCandidateSlot({
          id: "node.approvalPolicy",
          label: "确认策略",
          currentValue: code.approvalPolicy,
          candidates: ["none", "recommended", "required"],
          description: "决定是否进入人工确认节点或确认队列。",
        }),
        makeCandidateSlot({
          id: "node.failurePolicy",
          label: "失败策略",
          currentValue: failurePolicy?.mode,
          candidates: ["fail_protocol", "skip_node", "route_to_node", "return_to_bp_ask"],
          description: "决定节点失败后协议如何继续。",
        }),
      ]),
    },
  ].filter((section) => section.slots.length > 0);
}

function buildEdgeCandidateSections(
  code: Record<string, unknown>,
): ParameterCandidateSection[] {
  const contractFlow = getRecord(code, "contractFlow");
  const source = getRecord(contractFlow, "source");
  const target = getRecord(contractFlow, "target");
  const transfer = getRecord(contractFlow, "transfer");
  const sourceOutputs = namedArrayValues(source?.outputs);
  const targetInputs = namedArrayValues(target?.inputBindings);
  const mappingCandidates = sourceOutputs.flatMap((from) =>
    targetInputs.slice(0, 4).map((to) => `${from} -> ${to}`),
  );

  return [
    {
      title: "传输槽位",
      slots: compactSlots([
        makeCandidateSlot({
          id: "edge.transferMode",
          label: "传输模式",
          currentValue: code.transferMode ?? transfer?.mode,
          candidates: [
            "communication_prompt",
            "structured_packet",
            "field_mapping",
            "control_signal",
          ],
          description: "决定连线传递提示词、结构化包、字段映射还是控制信号。",
        }),
        makeCandidateSlot({
          id: "edge.requiredFields",
          label: "必需字段",
          currentValue: namedArrayPreview(code.requiredFields ?? transfer?.requiredFields),
          candidates: [
            namedArrayValues(code.requiredFields ?? transfer?.requiredFields),
            sourceOutputs,
          ],
          description: "指定下游必须拿到哪些上游字段。",
        }),
        makeCandidateSlot({
          id: "edge.fieldMappings",
          label: "字段映射",
          currentValue: namedArrayPreview(code.fieldMappings ?? transfer?.fieldMappings, [
            "fromPath",
            "toPath",
            "source",
            "target",
          ]),
          candidates: [
            namedArrayValues(code.fieldMappings ?? transfer?.fieldMappings, [
              "fromPath",
              "toPath",
              "source",
              "target",
            ]),
            mappingCandidates,
          ],
          description: "把上游输出字段映射到下游输入字段。",
        }),
      ]),
    },
  ].filter((section) => section.slots.length > 0);
}

function buildProtocolCandidateSections(
  code: Record<string, unknown>,
): ParameterCandidateSection[] {
  return [
    {
      title: "协议槽位",
      slots: compactSlots([
        makeCandidateSlot({
          id: "protocol.entryNodeIds",
          label: "入口节点",
          currentValue: namedArrayPreview(code.entryNodeIds, ["id"]),
          candidates: [namedArrayValues(code.entryNodeIds, ["id"])],
          description: "决定 BP问问 从哪些节点进入该协议。",
        }),
        makeCandidateSlot({
          id: "protocol.reportNodeIds",
          label: "汇报出口",
          currentValue: namedArrayPreview(code.reportNodeIds, ["id"]),
          candidates: [namedArrayValues(code.reportNodeIds, ["id"])],
          description: "决定哪些节点把结果回交给 BP问问。",
        }),
        makeCandidateSlot({
          id: "protocol.requiredInputs",
          label: "触发输入",
          currentValue: namedArrayPreview(code.requiredInputs, ["id"]),
          candidates: [namedArrayValues(code.requiredInputs, ["id"])],
          description: "决定触发该协议时必须具备的上下文。",
        }),
      ]),
    },
  ].filter((section) => section.slots.length > 0);
}

function buildParameterCandidateSections(
  block: ProtocolParameterCodeBlock,
): ParameterCandidateSection[] {
  if (block.target === "node") {
    return buildNodeCandidateSections(block.code);
  }

  if (block.target === "edge") {
    return buildEdgeCandidateSections(block.code);
  }

  return buildProtocolCandidateSections(block.code);
}

function buildCandidatePatchPayload(
  block: ProtocolParameterCodeBlock,
  slot: ParameterCandidateSlot,
  option: ParameterCandidateOption,
): ParameterPatchPreviewPayload | null {
  if (block.target === "node") {
    const target = { kind: "node" as const, nodeId: block.targetId };

    if (slot.id === "node.departmentScopeId") {
      return {
        target,
        path: "compiledSpec.departmentScopeId",
        value: option.value,
      };
    }

    if (slot.id === "node.riskLevel") {
      return {
        target,
        path: "compiledSpec.riskLevel",
        value: option.value,
      };
    }

    if (slot.id === "node.approvalPolicy") {
      return {
        target,
        path: "compiledSpec.approvalPolicy",
        value: option.value,
      };
    }

    if (slot.id === "node.failurePolicy") {
      return {
        target,
        path: "compiledSpec.failurePolicy",
        value: { mode: option.value },
      };
    }
  }

  if (block.target === "edge" && slot.id === "edge.transferMode") {
    return {
      target: { kind: "edge", edgeId: block.targetId },
      path: "compiledSpec.transferMode",
      value: option.value,
    };
  }

  return null;
}

function buildNodeParameterSections(
  code: Record<string, unknown>,
): ParameterSummarySection[] {
  const contractOptions = getRecord(code, "contractParameterOptions");
  const contracts = getRecord(code, "capabilityContracts");

  return [
    {
      title: "执行",
      items: [
        { label: "类型", value: asText(code.kind) },
        { label: "执行器", value: asText(code.executorKind) },
        {
          label: "对象",
          value:
            asText(code.callableId, "") ||
            asText(code.agentId, "") ||
            asText(code.writableObjectKind, "") ||
            "未绑定",
        },
        { label: "范围", value: asText(code.departmentScopeId) },
      ],
    },
    {
      title: "输入输出",
      items: [
        { label: "输入绑定", value: namedArrayPreview(code.inputBindings) },
        { label: "输出字段", value: namedArrayPreview(code.outputFields) },
        {
          label: "必填输入",
          value: namedArrayPreview(contractOptions?.requiredInputs, ["id", "name", "label"]),
        },
        {
          label: "可选输入",
          value: namedArrayPreview(contractOptions?.optionalInputs, ["id", "name", "label"]),
        },
      ],
    },
    {
      title: "控制",
      items: [
        {
          label: "风险",
          value: asText(code.riskLevel),
          tone: riskItemTone(code.riskLevel),
        },
        {
          label: "确认",
          value: asText(code.approvalPolicy),
          tone: approvalItemTone(code.approvalPolicy),
        },
        {
          label: "失败策略",
          value: isPlainRecord(code.failurePolicy)
            ? asText(code.failurePolicy.mode)
            : "未设置",
        },
      ],
    },
    {
      title: "契约",
      items: [
        { label: "节点", value: contractSummary(contracts?.nodeKind) },
        { label: "执行", value: contractSummary(contracts?.execution) },
        { label: "范围", value: contractSummary(contracts?.departmentScope) },
      ],
    },
  ];
}

function buildEdgeParameterSections(
  code: Record<string, unknown>,
): ParameterSummarySection[] {
  const contractFlow = getRecord(code, "contractFlow");
  const source = getRecord(contractFlow, "source");
  const target = getRecord(contractFlow, "target");
  const transfer = getRecord(contractFlow, "transfer");

  return [
    {
      title: "端点",
      items: [
        { label: "上游", value: asText(code.sourceNodeId) },
        { label: "下游", value: asText(code.targetNodeId) },
        {
          label: "上游输出",
          value: namedArrayPreview(source?.outputs),
        },
        {
          label: "下游输入",
          value: namedArrayPreview(target?.inputBindings),
        },
      ],
    },
    {
      title: "传输",
      items: [
        { label: "模式", value: asText(code.transferMode ?? transfer?.mode) },
        {
          label: "必需字段",
          value: namedArrayPreview(code.requiredFields ?? transfer?.requiredFields, [
            "id",
            "name",
            "label",
          ]),
        },
        {
          label: "字段映射",
          value: namedArrayPreview(code.fieldMappings ?? transfer?.fieldMappings, [
            "source",
            "target",
            "name",
          ]),
        },
        {
          label: "输出包",
          value: compactJsonValue(transfer?.outputPacketSchema),
        },
      ],
    },
    {
      title: "契约",
      items: [
        {
          label: "上游契约",
          value: contractSummary(getNestedRecord(source, ["contracts", "execution"])),
        },
        {
          label: "下游契约",
          value: contractSummary(getNestedRecord(target, ["contracts", "execution"])),
        },
      ],
    },
  ];
}

function buildProtocolParameterSections(
  code: Record<string, unknown>,
): ParameterSummarySection[] {
  const capabilityContracts = getRecord(code, "capabilityContracts");
  const counts = getRecord(capabilityContracts, "counts");

  return [
    {
      title: "协议",
      items: [
        { label: "协议", value: asText(code.protocolId) },
        { label: "入口", value: namedArrayPreview(code.entryNodeIds, ["id"]) },
        { label: "汇报", value: namedArrayPreview(code.reportNodeIds, ["id"]) },
        { label: "输入", value: namedArrayPreview(code.requiredInputs, ["id"]) },
      ],
    },
    {
      title: "能力目录",
      items: [
        { label: "版本", value: asText(capabilityContracts?.contractVersion) },
        { label: "目录", value: asText(capabilityContracts?.catalogHash) },
        { label: "总数", value: compactJsonValue(counts?.total) },
        { label: "状态", value: compactJsonValue(counts?.byStatus) },
      ],
    },
  ];
}

function buildParameterSummarySections(
  block: ProtocolParameterCodeBlock,
): ParameterSummarySection[] {
  if (block.target === "node") {
    return buildNodeParameterSections(block.code);
  }

  if (block.target === "edge") {
    return buildEdgeParameterSections(block.code);
  }

  return buildProtocolParameterSections(block.code);
}

function formatParameterCode(code: Record<string, unknown>) {
  return JSON.stringify(code, null, 2);
}

function ParameterSummaryFields({
  block,
  compact = false,
}: {
  block: ProtocolParameterCodeBlock;
  compact?: boolean;
}) {
  const sections = buildParameterSummarySections(block).filter((section) =>
    section.items.some((item) => item.value !== "未设置" && item.value !== "未绑定"),
  );

  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {sections.map((section) => (
        <div
          key={section.title}
          className="rounded-[0.75rem] border border-slate-200 bg-white p-2"
        >
          <div className="text-[10px] font-black text-slate-400">
            {section.title}
          </div>
          <div className={`mt-1 grid gap-1.5 ${compact ? "grid-cols-1" : "grid-cols-2"}`}>
            {section.items.map((item) => (
              <div
                key={`${section.title}-${item.label}`}
                className={`rounded-[0.55rem] px-2 py-1.5 ${itemToneClass(item.tone)}`}
              >
                <div className="text-[9px] font-black opacity-60">{item.label}</div>
                <div className="mt-0.5 break-words font-semibold leading-4">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ParameterCandidateSlots({
  block,
  compact = false,
  previewBusy = false,
  onPreviewCandidate,
}: {
  block: ProtocolParameterCodeBlock;
  compact?: boolean;
  previewBusy?: boolean;
  onPreviewCandidate?: (preview: ParameterPatchCandidatePreview) => void;
}) {
  const sections = buildParameterCandidateSections(block);
  const slotCount = sections.reduce(
    (total, section) => total + section.slots.length,
    0,
  );

  if (slotCount === 0) {
    return null;
  }

  return (
    <details className="overflow-hidden rounded-[0.75rem] border border-indigo-100 bg-indigo-50/50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
        <span className="text-[10px] font-black text-indigo-700">
          候选参数槽位
        </span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-indigo-600">
          {slotCount} 项
        </span>
      </summary>

      <div className="space-y-2 border-t border-indigo-100 p-2">
        {sections.map((section) => (
          <div key={section.title} className="rounded-[0.7rem] bg-white p-2">
            <div className="text-[10px] font-black text-slate-400">
              {section.title}
            </div>
            <div className="mt-1.5 space-y-1.5">
              {section.slots.map((slot) => (
                <div
                  key={slot.id}
                  className="rounded-[0.65rem] border border-slate-100 bg-slate-50 px-2 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-black text-slate-700">
                        {slot.label}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-[9px] leading-4 text-slate-400">
                        {slot.description}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-black text-white">
                      只读
                    </span>
                  </div>

                  <div className="mt-1.5 rounded-[0.5rem] bg-white px-2 py-1 text-[9px] font-semibold text-slate-500">
                    当前：{slot.currentValue}
                  </div>

                  <div className={`mt-1.5 flex flex-wrap gap-1 ${compact ? "max-h-16 overflow-hidden" : ""}`}>
                    {slot.options.slice(0, compact ? 4 : 8).map((option) => {
                      const patchPayload = buildCandidatePatchPayload(
                        block,
                        slot,
                        option,
                      );
                      const canPreview = Boolean(
                        patchPayload && onPreviewCandidate && !option.active,
                      );

                      if (canPreview && patchPayload) {
                        return (
                          <button
                            key={option.id}
                            type="button"
                            disabled={previewBusy}
                            onClick={(event) => {
                              event.stopPropagation();
                              onPreviewCandidate?.({
                                block,
                                slot,
                                option,
                                payload: patchPayload,
                              });
                            }}
                            className="rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold text-indigo-600 ring-1 ring-indigo-100 transition hover:bg-indigo-600 hover:text-white disabled:cursor-wait disabled:bg-slate-100 disabled:text-slate-400"
                            title={`dry-run ${option.value}`}
                          >
                            {previewBusy ? "预览中" : option.label}
                          </button>
                        );
                      }

                      return (
                        <span
                          key={option.id}
                          className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                            option.active
                              ? "bg-indigo-600 text-white"
                              : patchPayload
                                ? "bg-white text-indigo-400"
                                : "bg-white text-slate-400"
                          }`}
                          title={patchPayload ? "需要可用的梳理稿后才能预览" : option.value}
                        >
                          {option.label}
                        </span>
                      );
                    })}
                    {slot.options.length > (compact ? 4 : 8) ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-400">
                        +{slot.options.length - (compact ? 4 : 8)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function auditSeverityTone(severity: WorkProtocolGroomingAuditSeverity) {
  if (severity === "error") {
    return "border-rose-100 bg-rose-50 text-rose-700";
  }

  if (severity === "warning") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  if (severity === "success") {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }

  return "border-blue-100 bg-blue-50 text-blue-700";
}

function TargetAuditEvents({
  events,
  compact = false,
}: {
  events?: WorkProtocolGroomingAuditEvent[];
  compact?: boolean;
}) {
  const visibleEvents = (events ?? []).filter(
    (event) => event.severity !== "success",
  );

  if (visibleEvents.length === 0) {
    return null;
  }

  const importantEvents = [
    ...visibleEvents.filter((event) => event.severity === "error"),
    ...visibleEvents.filter((event) => event.severity === "warning"),
    ...visibleEvents.filter((event) => event.severity === "info"),
  ].slice(0, compact ? 1 : 2);
  const hiddenCount = visibleEvents.length - importantEvents.length;

  return (
    <div className={`${compact ? "mt-2" : "mt-3"} space-y-1.5`}>
      {importantEvents.map((event) => (
        <div
          key={event.id}
          className={`rounded-[0.75rem] border px-2.5 py-2 text-[10px] leading-4 ${auditSeverityTone(
            event.severity,
          )}`}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-black">{event.title}</span>
            <span className="shrink-0 font-semibold opacity-60">
              {event.code}
            </span>
          </div>
          <div className="mt-1 text-current/80">{event.message}</div>
          {event.path ? (
            <div className="mt-1 truncate font-mono text-[9px] text-current/60">
              {event.path}
            </div>
          ) : null}
        </div>
      ))}
      {hiddenCount > 0 ? (
        <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
          还有 {hiddenCount} 条相关审计事件
        </div>
      ) : null}
    </div>
  );
}

function countVisibleAuditEvents(events?: WorkProtocolGroomingAuditEvent[]) {
  const visibleEvents = (events ?? []).filter(
    (event) => event.severity !== "success",
  );

  return {
    visibleEvents,
    errors: visibleEvents.filter((event) => event.severity === "error").length,
    warnings: visibleEvents.filter((event) => event.severity === "warning").length,
    info: visibleEvents.filter((event) => event.severity === "info").length,
  };
}

function parameterCodeStatusLabel(
  block: ProtocolParameterCodeBlock | undefined,
  stale: boolean,
) {
  if (!block) {
    return "无参数";
  }

  return block.status === "fresh" && !stale ? "已梳理" : "需更新";
}

export function ParameterCodeDetails({
  block,
  stale,
  compact = false,
}: {
  block?: ProtocolParameterCodeBlock;
  stale: boolean;
  compact?: boolean;
}) {
  if (!block) {
    return null;
  }

  return (
    <details
      data-canvas-object="true"
      className={`mt-2 overflow-hidden rounded-[0.85rem] border border-blue-100 bg-blue-50/70 ${
        compact ? "text-[10px]" : "text-[11px]"
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-black text-blue-700">
        <span className="truncate">参数代码</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] ${
            block.status === "fresh" && !stale
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {block.status === "fresh" && !stale ? "已梳理" : "需更新"}
        </span>
      </summary>
      <pre className="max-h-44 overflow-auto border-t border-blue-100 bg-slate-950 px-3 py-2 font-mono text-[10px] leading-4 text-slate-100">
        {formatParameterCode(block.code)}
      </pre>
    </details>
  );
}

export function TargetProtocolDetails({
  block,
  auditEvents,
  stale,
  compact = false,
  previewBusy = false,
  onPreviewCandidate,
}: {
  block?: ProtocolParameterCodeBlock;
  auditEvents?: WorkProtocolGroomingAuditEvent[];
  stale: boolean;
  compact?: boolean;
  previewBusy?: boolean;
  onPreviewCandidate?: (preview: ParameterPatchCandidatePreview) => void;
}) {
  const { visibleEvents, errors, warnings, info } =
    countVisibleAuditEvents(auditEvents);

  if (!block && visibleEvents.length === 0) {
    return null;
  }

  const hasProblem = errors > 0 || warnings > 0;
  const parameterTone =
    block && block.status === "fresh" && !stale
      ? "bg-emerald-50 text-emerald-700"
      : block
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-500";
  const auditTone = errors
    ? "bg-rose-50 text-rose-700"
    : warnings
      ? "bg-amber-50 text-amber-700"
      : visibleEvents.length > 0
        ? "bg-slate-100 text-slate-600"
        : "bg-emerald-50 text-emerald-700";

  return (
    <details
      data-canvas-object="true"
      open={hasProblem}
      className={`mt-2 overflow-hidden rounded-[0.9rem] border border-slate-200 bg-white/85 ${
        compact ? "text-[10px]" : "text-[11px]"
      }`}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2">
        <span className="font-black text-slate-700">对象详情</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${parameterTone}`}>
            参数 {parameterCodeStatusLabel(block, stale)}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${auditTone}`}>
            审计 {errors || warnings ? `${errors}/${warnings}` : info || "通过"}
          </span>
        </span>
      </summary>

      <div className="border-t border-slate-100 bg-slate-50/70 p-2">
        {block ? (
          <div className="space-y-2">
            <ParameterSummaryFields block={block} compact={compact} />
            <ParameterCandidateSlots
              block={block}
              compact={compact}
              previewBusy={previewBusy}
              onPreviewCandidate={onPreviewCandidate}
            />
            <details className="overflow-hidden rounded-[0.75rem] border border-slate-200 bg-white">
              <summary className="cursor-pointer list-none px-3 py-2 text-[10px] font-black text-slate-500">
                原始参数 JSON
              </summary>
              <pre className="max-h-40 overflow-auto border-t border-slate-100 bg-slate-950 px-3 py-2 font-mono text-[10px] leading-4 text-slate-100">
                {formatParameterCode(block.code)}
              </pre>
            </details>
          </div>
        ) : (
          <div className="rounded-[0.75rem] border border-dashed border-slate-200 bg-white px-3 py-2 text-[10px] leading-4 text-slate-400">
            协议梳理后，这里会显示该对象的参数代码。
          </div>
        )}

        <TargetAuditEvents events={auditEvents} compact={compact} />
      </div>
    </details>
  );
}

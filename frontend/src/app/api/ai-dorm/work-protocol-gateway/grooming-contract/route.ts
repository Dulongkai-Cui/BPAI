import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { buildWorkProtocolCapabilityCatalog } from "@/lib/work-protocol/catalog";
import { buildWorkProtocolGroomingAudit } from "@/lib/work-protocol/grooming-audit";
import {
  MODEL_GROOMING_OUTPUT_CONTRACT,
  buildWorkProtocolGroomingInputPack,
  validateWorkProtocolModelGroomingOutput,
} from "@/lib/work-protocol/grooming-contract";
import { applyWorkProtocolModelGroomingOutput } from "@/lib/work-protocol/model-output-applier";
import type { WorkProtocolDraft } from "@/lib/work-protocol/types";

export const runtime = "nodejs";

type GroomingContractPayload = {
  draft?: WorkProtocolDraft;
  modelOutput?: unknown;
  applyModelOutput?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as
    | GroomingContractPayload
    | null;

  if (!isRecord(payload) || !isRecord(payload.draft)) {
    return NextResponse.json(
      { message: "Missing work protocol draft." },
      { status: 400 },
    );
  }

  const catalog = await buildWorkProtocolCapabilityCatalog(user);
  const inputPack = buildWorkProtocolGroomingInputPack({
    draft: payload.draft,
    catalog,
  });
  const validation = Object.hasOwn(payload, "modelOutput")
    ? validateWorkProtocolModelGroomingOutput(payload?.modelOutput, inputPack)
    : undefined;
  const application =
    payload.applyModelOutput && Object.hasOwn(payload, "modelOutput")
      ? applyWorkProtocolModelGroomingOutput({
          draft: payload.draft,
          catalog,
          modelOutput: payload.modelOutput,
          inputPack,
        })
      : undefined;
  const audit = buildWorkProtocolGroomingAudit({
    inputPack,
    validation,
    application,
    modelOutput: payload.modelOutput,
  });

  return NextResponse.json({
    inputPack,
    outputContract: MODEL_GROOMING_OUTPUT_CONTRACT,
    validation,
    application,
    audit,
    catalogHash: catalog.catalogHash,
  });
}

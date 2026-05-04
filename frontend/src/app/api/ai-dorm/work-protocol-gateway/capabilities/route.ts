import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import {
  buildCapabilityContracts,
  buildWorkProtocolCapabilityCatalog,
  summarizeCapabilityContracts,
} from "@/lib/work-protocol/catalog";
import { buildWorkProtocolExecutorAdapterRegistrySummary } from "@/lib/work-protocol/executor-adapters";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const catalog = await buildWorkProtocolCapabilityCatalog(user);
  const contracts = buildCapabilityContracts(catalog);

  return NextResponse.json({
    contractVersion: "capability-contract.v1",
    catalogVersion: catalog.catalogVersion,
    catalogHash: catalog.catalogHash,
    generatedAt: catalog.generatedAt,
    contracts,
    counts: summarizeCapabilityContracts(contracts),
    adapterRegistry: buildWorkProtocolExecutorAdapterRegistrySummary(),
  });
}

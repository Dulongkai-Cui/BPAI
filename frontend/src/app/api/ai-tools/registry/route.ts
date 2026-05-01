import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { getAiToolRegistrySnapshot } from "@/lib/ai-tools/gateway";

export const runtime = "nodejs";

function countBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const value = String(item[key] ?? "unknown");
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const registry = getAiToolRegistrySnapshot();

  return NextResponse.json({
    ...registry,
    counts: {
      resources: registry.resources.length,
      capabilities: registry.capabilities.length,
      bySourceKind: countBy(registry.capabilities, "sourceKind"),
      byDomain: countBy(registry.capabilities, "domain"),
      byRiskLevel: countBy(registry.capabilities, "riskLevel"),
    },
  });
}

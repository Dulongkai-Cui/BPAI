import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import {
  getAiProductionApiKeyRecords,
  saveAiProductionApiKeyRecords,
  type AiProductionApiKeyDraft,
} from "@/lib/ai-dorm/production-assets";

export const runtime = "nodejs";

type ApiKeyPayload = {
  providers?: AiProductionApiKeyDraft[];
};

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const apiKeys = await getAiProductionApiKeyRecords();
  return NextResponse.json({ apiKeys });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as ApiKeyPayload | null;
  const providers = Array.isArray(payload?.providers) ? payload.providers : [];

  const apiKeys = await saveAiProductionApiKeyRecords(providers);
  return NextResponse.json({ apiKeys });
}

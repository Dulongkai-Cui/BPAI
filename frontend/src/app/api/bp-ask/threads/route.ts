import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import {
  createConversationThreadForUser,
  listConversationThreadsForUser,
} from "@/lib/bp-ask/server";

export const runtime = "nodejs";

type CreateThreadPayload = {
  title?: string;
};

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const threads = await listConversationThreadsForUser(user);
  return NextResponse.json({ threads });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as CreateThreadPayload | null;
  const result = await createConversationThreadForUser(user, payload?.title);

  return NextResponse.json(result, { status: 201 });
}

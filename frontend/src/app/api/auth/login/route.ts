import { NextResponse } from "next/server";
import {
  authenticateUser,
  AUTH_COOKIE_NAME,
  buildAuthCookie,
} from "@/lib/auth/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (
    !body ||
    typeof body !== "object" ||
    typeof body.email !== "string" ||
    typeof body.password !== "string"
  ) {
    return NextResponse.json(
      { message: "请输入账号和密码。" },
      { status: 400 },
    );
  }

  const session = await authenticateUser(body.email, body.password);

  if (!session) {
    return NextResponse.json(
      { message: "账号或密码不正确。" },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ user: session.user });
  response.cookies.set(AUTH_COOKIE_NAME, session.token, buildAuthCookie(session.expiresAt));
  return response;
}

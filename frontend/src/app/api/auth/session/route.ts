import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, getCurrentUserFromToken } from "@/lib/auth/server";

export const runtime = "nodejs";

function extractTokenFromCookieHeader(cookieHeader: string) {
  const tokenMatch = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));

  return tokenMatch
    ? tokenMatch.slice(`${AUTH_COOKIE_NAME}=`.length)
    : undefined;
}

export async function GET(request: Request) {
  const token = extractTokenFromCookieHeader(
    request.headers.get("cookie") ?? "",
  );
  const user = await getCurrentUserFromToken(token);

  if (!user) {
    return NextResponse.json({ message: "未登录。" }, { status: 401 });
  }

  return NextResponse.json({ user });
}

import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  buildAuthCookie,
  deleteSession,
} from "@/lib/auth/server";

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

export async function POST(request: Request) {
  const token = extractTokenFromCookieHeader(
    request.headers.get("cookie") ?? "",
  );

  await deleteSession(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    AUTH_COOKIE_NAME,
    "",
    {
      ...buildAuthCookie(new Date(0).toISOString()),
      maxAge: 0,
    },
  );
  return response;
}

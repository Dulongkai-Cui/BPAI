import type { NextConfig } from "next";

const onlyOfficeHost = process.env.NEXT_PUBLIC_ONLYOFFICE_SERVER_URL
  ? new URL(process.env.NEXT_PUBLIC_ONLYOFFICE_SERVER_URL).hostname
  : "localhost";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  allowedDevOrigins: ["dev.bpai.local"],
  async rewrites() {
    return [
      {
        source: "/api/bp-ask/threads/:threadId/messages",
        destination: "/api/bp-ask/thread-actions/:threadId/messages",
      },
      {
        source: "/api/bp-ask/threads/:threadId/confirmations",
        destination: "/api/bp-ask/thread-actions/:threadId/confirmations",
      },
      {
        source: "/api/bp-ask/threads/:threadId/continuations",
        destination: "/api/bp-ask/thread-actions/:threadId/continuations",
      },
      {
        source: "/api/bp-ask/threads/:threadId/writeback-drafts",
        destination: "/api/bp-ask/thread-actions/:threadId/writeback-drafts",
      },
      {
        source: "/api/bp-ask/threads/:threadId/openclaw",
        destination: "/api/bp-ask/thread-actions/:threadId/openclaw",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/onlyoffice/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: `http://${onlyOfficeHost}:8080` },
          { key: "Access-Control-Allow-Methods", value: "GET,HEAD,OPTIONS" },
        ],
      },
    ];
  },
};

export default nextConfig;

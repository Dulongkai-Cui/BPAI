import type { NextConfig } from "next";

const onlyOfficeHost = process.env.NEXT_PUBLIC_ONLYOFFICE_SERVER_URL
  ? new URL(process.env.NEXT_PUBLIC_ONLYOFFICE_SERVER_URL).hostname
  : "localhost";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  allowedDevOrigins: ["dev.bpai.local"],
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

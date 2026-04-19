type OpenClawSidecarConfig = {
  agentId: string;
  agentName: string;
  launchHref: string;
  baseUrlEnvNames: readonly string[];
  tokenEnvNames: readonly string[];
  defaultBaseUrl: string;
  defaultToken: string;
};

const OPENCLAW_SIDECARS: Record<string, OpenClawSidecarConfig> = {
  "work-order-longxia": {
    agentId: "work-order-longxia",
    agentName: "工单龙虾",
    launchHref: "/api/ai-dorm/openclaw/work-order-longxia/launch",
    baseUrlEnvNames: [
      "OPENCLAW_WORK_ORDER_CONSOLE_URL",
      "OPENCLAW_CONSOLE_URL",
      "NEXT_PUBLIC_OPENCLAW_CONSOLE_URL",
    ],
    tokenEnvNames: [
      "OPENCLAW_WORK_ORDER_GATEWAY_TOKEN",
      "OPENCLAW_GATEWAY_TOKEN",
    ],
    defaultBaseUrl: "http://127.0.0.1:18889/",
    defaultToken: "bpai-sidecar-openclaw-token",
  },
  "document-longxia": {
    agentId: "document-longxia",
    agentName: "文档龙虾",
    launchHref: "/api/ai-dorm/openclaw/document-longxia/launch",
    baseUrlEnvNames: ["OPENCLAW_DOCUMENT_CONSOLE_URL"],
    tokenEnvNames: ["OPENCLAW_DOCUMENT_GATEWAY_TOKEN"],
    defaultBaseUrl: "http://127.0.0.1:18989/",
    defaultToken: "bpai-document-openclaw-token",
  },
  "drawing-longxia": {
    agentId: "drawing-longxia",
    agentName: "图纸龙虾",
    launchHref: "/api/ai-dorm/openclaw/drawing-longxia/launch",
    baseUrlEnvNames: ["OPENCLAW_DRAWING_CONSOLE_URL"],
    tokenEnvNames: ["OPENCLAW_DRAWING_GATEWAY_TOKEN"],
    defaultBaseUrl: "http://127.0.0.1:19089/",
    defaultToken: "bpai-drawing-openclaw-token",
  },
  "alert-longxia": {
    agentId: "alert-longxia",
    agentName: "预警龙虾",
    launchHref: "/api/ai-dorm/openclaw/alert-longxia/launch",
    baseUrlEnvNames: ["OPENCLAW_ALERT_CONSOLE_URL"],
    tokenEnvNames: ["OPENCLAW_ALERT_GATEWAY_TOKEN"],
    defaultBaseUrl: "http://127.0.0.1:19189/",
    defaultToken: "bpai-alert-openclaw-token",
  },
  "report-longxia": {
    agentId: "report-longxia",
    agentName: "报表龙虾",
    launchHref: "/api/ai-dorm/openclaw/report-longxia/launch",
    baseUrlEnvNames: ["OPENCLAW_REPORT_CONSOLE_URL"],
    tokenEnvNames: ["OPENCLAW_REPORT_GATEWAY_TOKEN"],
    defaultBaseUrl: "http://127.0.0.1:19289/",
    defaultToken: "bpai-report-openclaw-token",
  },
};

function readEnvValue(names: readonly string[], fallback: string) {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }

  return fallback;
}

export function getOpenClawSidecarConfig(agentId: string) {
  return OPENCLAW_SIDECARS[agentId] ?? null;
}

export function getOpenClawConsoleEntryForAgent(agentId: string) {
  const config = getOpenClawSidecarConfig(agentId);

  if (!config) {
    return null;
  }

  return {
    href: config.launchHref,
    label: "OpenClaw 控制台",
    note: `${config.agentName} sidecar`,
  };
}

export function buildOpenClawLaunchUrl(agentId: string) {
  const config = getOpenClawSidecarConfig(agentId);

  if (!config) {
    return null;
  }

  const target = new URL(
    readEnvValue(config.baseUrlEnvNames, config.defaultBaseUrl),
  );
  target.hash = new URLSearchParams({
    token: readEnvValue(config.tokenEnvNames, config.defaultToken),
  }).toString();

  return target;
}

import "server-only";

import { createPublicKey, randomBytes, sign as signPayload } from "node:crypto";
import { readFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";

import { getOpenClawGatewayConnection } from "@/lib/ai-dorm/openclaw";

export type OpenClawAgentId = "work-order-longxia";
export type OpenClawRunStatus = "completed" | "failed" | "not_found";

export type OpenClawRunRequest = {
  agentId: OpenClawAgentId;
  taskId: string;
  resultId: string;
  workOrderNo: string;
  workflowId: string;
  payload: Record<string, unknown>;
};

export type OpenClawRunRecord = {
  agentId: OpenClawAgentId;
  status: OpenClawRunStatus;
  summaryText: string;
  input: Record<string, unknown>;
  structuredPayload: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string;
  errorCode?: string;
};

type OpenClawGatewayRequest = {
  method: string;
  params: Record<string, unknown>;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type GatewaySocket = {
  send: (message: string) => void;
  close: () => void;
};

type GatewayCallResult = {
  hello: Record<string, unknown>;
  health: Record<string, unknown>;
  submission: Record<string, unknown> | null;
  submitEnabled: boolean;
};

const OPENCLAW_OPERATOR_SCOPES = [
  "operator.read",
  "operator.write",
];

type OpenClawDeviceAuth = {
  deviceId: string;
  deviceToken: string;
  publicKey: string;
  privateKeyPem: string;
};

function readSubmitEnabled(agentId: OpenClawAgentId) {
  const specificName =
    agentId === "work-order-longxia"
      ? "OPENCLAW_WORK_ORDER_SUBMIT_ENABLED"
      : "";
  const specificValue = specificName ? process.env[specificName] : undefined;
  const value = specificValue ?? process.env.OPENCLAW_SUBMIT_ENABLED;

  return value === "true" || value === "1";
}

function buildId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
}

function base64Url(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function readJsonFile(pathname: string) {
  return JSON.parse(readFileSync(pathname, "utf8").replace(/^\uFEFF/, "")) as
    | Record<string, unknown>
    | null;
}

function readOpenClawDeviceAuth(agentId: OpenClawAgentId) {
  const specificName =
    agentId === "work-order-longxia"
      ? "OPENCLAW_WORK_ORDER_DEVICE_AUTH_DIR"
      : "";
  const authDir =
    (specificName ? process.env[specificName] : undefined) ??
    process.env.OPENCLAW_DEVICE_AUTH_DIR;

  if (!authDir) {
    return null;
  }

  try {
    const device = readJsonFile(join(authDir, "device.json"));
    const auth = readJsonFile(join(authDir, "device-auth.json"));
    const deviceId = typeof device?.deviceId === "string" ? device.deviceId : "";
    const publicKeyPem =
      typeof device?.publicKeyPem === "string" ? device.publicKeyPem : "";
    const privateKeyPem =
      typeof device?.privateKeyPem === "string" ? device.privateKeyPem : "";
    const tokens = toRecord(auth?.tokens);
    const operatorToken = toRecord(tokens.operator);
    const deviceToken =
      typeof operatorToken.token === "string" ? operatorToken.token : "";

    if (!deviceId || !publicKeyPem || !privateKeyPem || !deviceToken) {
      return null;
    }

    const publicDer = Buffer.from(
      createPublicKey(publicKeyPem).export({
        format: "der",
        type: "spki",
      }),
    );

    return {
      deviceId,
      deviceToken,
      publicKey: base64Url(publicDer.subarray(-32)),
      privateKeyPem,
    } satisfies OpenClawDeviceAuth;
  } catch {
    return null;
  }
}

function buildOpenClawDeviceSignature(params: {
  auth: OpenClawDeviceAuth;
  gatewayToken: string;
  nonce: string;
}) {
  const signedAt = Date.now();
  const signatureBase = [
    "v2",
    params.auth.deviceId,
    "gateway-client",
    "backend",
    "operator",
    OPENCLAW_OPERATOR_SCOPES.join(","),
    String(signedAt),
    params.gatewayToken,
    params.nonce,
  ].join("|");
  const signature = signPayload(
    null,
    Buffer.from(signatureBase),
    params.auth.privateKeyPem,
  );

  return {
    id: params.auth.deviceId,
    publicKey: params.auth.publicKey,
    signature: base64Url(signature),
    signedAt,
    nonce: params.nonce,
  };
}

function normalizeGatewayError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = record.message;
    const code = record.code;

    if (typeof message === "string") {
      return typeof code === "string" ? `${code}: ${message}` : message;
    }
  }

  return "OpenClaw gateway request failed";
}

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function encodeWebSocketFrame(message: string) {
  const payload = Buffer.from(message, "utf8");
  const mask = randomBytes(4);
  let header: Buffer;

  if (payload.length < 126) {
    header = Buffer.from([0x81, 0x80 | payload.length]);
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }

  const masked = Buffer.alloc(payload.length);

  for (let index = 0; index < payload.length; index += 1) {
    masked[index] = payload[index] ^ mask[index % 4];
  }

  return Buffer.concat([header, mask, masked]);
}

function decodeWebSocketFrames(buffer: Buffer) {
  const messages: string[] = [];
  let offset = 0;

  while (buffer.length - offset >= 2) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    const masked = Boolean(secondByte & 0x80);
    let payloadLength = secondByte & 0x7f;
    let headerLength = 2;

    if (payloadLength === 126) {
      if (buffer.length - offset < 4) {
        break;
      }

      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      if (buffer.length - offset < 10) {
        break;
      }

      const bigLength = buffer.readBigUInt64BE(offset + 2);

      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("OPENCLAW_GATEWAY_FRAME_TOO_LARGE");
      }

      payloadLength = Number(bigLength);
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + payloadLength;

    if (buffer.length - offset < frameLength) {
      break;
    }

    const mask = masked
      ? buffer.subarray(offset + headerLength, offset + headerLength + 4)
      : null;
    const payloadStart = offset + headerLength + maskLength;
    const payload = Buffer.from(
      buffer.subarray(payloadStart, payloadStart + payloadLength),
    );

    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] = payload[index] ^ mask[index % 4];
      }
    }

    if (opcode === 0x1) {
      messages.push(payload.toString("utf8"));
    }

    offset += frameLength;
  }

  return {
    messages,
    remaining: buffer.subarray(offset),
  };
}

function connectGatewaySocket(params: {
  gatewayUrl: string;
  timeoutMs: number;
  onMessage: (message: string) => void;
  onError: (error: Error) => void;
}) {
  const target = new URL(params.gatewayUrl);

  if (target.protocol !== "ws:") {
    throw new Error("OPENCLAW_GATEWAY_WS_ONLY");
  }

  const port = target.port ? Number(target.port) : 80;
  const path = `${target.pathname || "/"}${target.search}`;
  const key = randomBytes(16).toString("base64");
  const socket = net.createConnection({
    host: target.hostname,
    port,
  });
  let handshakeDone = false;
  let handshakeBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let frameBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let closed = false;

  socket.setTimeout(params.timeoutMs);
  socket.on("connect", () => {
    socket.write(
      [
        `GET ${path} HTTP/1.1`,
        `Host: ${target.host}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        "",
        "",
      ].join("\r\n"),
    );
  });
  socket.on("data", (chunk) => {
    try {
      let nextChunk: Buffer<ArrayBufferLike> = chunk;

      if (!handshakeDone) {
        handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
        const headerEnd = handshakeBuffer.indexOf("\r\n\r\n");

        if (headerEnd === -1) {
          return;
        }

        const header = handshakeBuffer.subarray(0, headerEnd).toString("utf8");

        if (!header.includes(" 101 ")) {
          throw new Error("OPENCLAW_GATEWAY_HANDSHAKE_FAILED");
        }

        handshakeDone = true;
        nextChunk = handshakeBuffer.subarray(headerEnd + 4);
        handshakeBuffer = Buffer.alloc(0);
      }

      if (nextChunk.length === 0) {
        return;
      }

      frameBuffer = Buffer.concat([frameBuffer, nextChunk]);
      const decoded = decodeWebSocketFrames(frameBuffer);
      frameBuffer = decoded.remaining;
      decoded.messages.forEach(params.onMessage);
    } catch (error) {
      params.onError(error instanceof Error ? error : new Error(String(error)));
    }
  });
  socket.on("error", (error) => {
    params.onError(error);
  });
  socket.on("timeout", () => {
    params.onError(new Error("OPENCLAW_GATEWAY_TIMEOUT"));
    socket.destroy();
  });
  socket.on("close", () => {
    closed = true;
  });

  return {
    send(message: string) {
      if (closed) {
        throw new Error("OPENCLAW_GATEWAY_SOCKET_CLOSED");
      }

      socket.write(encodeWebSocketFrame(message));
    },
    close() {
      closed = true;
      socket.end();
    },
  } satisfies GatewaySocket;
}

function buildOpenClawMessage(request: OpenClawRunRequest) {
  return [
    "[BPAI_OPENCLAW_WORK_ORDER_EXECUTION]",
    "",
    `任务来源：BPAI / BP问问 / ${request.workflowId}`,
    `工单编号：${request.workOrderNo}`,
    `executionTaskId：${request.taskId}`,
    `executionResultId：${request.resultId}`,
    "",
    "安全要求：",
    "- 先按 dry-run / 预案方式执行。",
    "- 不要直接修改 BPAI 业务数据库。",
    "- 如需写回业务字段，只输出候选写回建议，由 BP问问进入草案审阅和白名单写回。",
    "",
    "结构化 payload：",
    "```json",
    JSON.stringify(request.payload, null, 2),
    "```",
  ].join("\n");
}

async function callOpenClawGateway(params: {
  gatewayUrl: string;
  token: string;
  deviceAuth?: OpenClawDeviceAuth | null;
  requests: OpenClawGatewayRequest[];
  timeoutMs?: number;
}) {
  const timeoutMs = params.timeoutMs ?? 12_000;
  const pending = new Map<string, PendingRequest>();
  let sequence = 0;

  return new Promise<unknown[]>((resolve, reject) => {
    let settled = false;
    let connected = false;
    let gatewaySocket: GatewaySocket | null = null;
    const results: unknown[] = [];
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      gatewaySocket?.close();
      reject(new Error("OPENCLAW_GATEWAY_TIMEOUT"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      pending.clear();
    }

    function fail(error: unknown) {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      gatewaySocket?.close();
      reject(error instanceof Error ? error : new Error(normalizeGatewayError(error)));
    }

    function sendRequest(method: string, requestParams: Record<string, unknown>) {
      if (!gatewaySocket) {
        return Promise.reject(new Error("OPENCLAW_GATEWAY_NOT_CONNECTED"));
      }

      const id = String(++sequence);
      const payload = {
        type: "req",
        id,
        method,
        params: requestParams,
      };

      gatewaySocket.send(JSON.stringify(payload));

      return new Promise<unknown>((resolveRequest, rejectRequest) => {
        pending.set(id, {
          resolve: resolveRequest,
          reject: rejectRequest,
        });
      });
    }

    async function sendConnect(nonce: string) {
      const auth: Record<string, string> = {
        token: params.token,
      };
      const device = params.deviceAuth
        ? buildOpenClawDeviceSignature({
            auth: params.deviceAuth,
            gatewayToken: params.token,
            nonce,
          })
        : null;

      if (params.deviceAuth) {
        auth.deviceToken = params.deviceAuth.deviceToken;
      }

      const hello = await sendRequest("connect", {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: "gateway-client",
          version: "bpai-openclaw-adapter",
          platform: "node",
          mode: "backend",
          instanceId: buildId("bpai-openclaw"),
        },
        role: "operator",
        scopes: OPENCLAW_OPERATOR_SCOPES,
        caps: ["tool-events"],
        auth,
        ...(device ? { device } : {}),
        userAgent: "BPAI OpenClaw Adapter",
        locale: "zh-CN",
      });
      connected = true;
      results.push(hello);

      for (const request of params.requests) {
        results.push(await sendRequest(request.method, request.params));
      }

      if (!settled) {
        settled = true;
        cleanup();
        gatewaySocket?.close();
        resolve(results);
      }
    }

    function handleGatewayMessage(rawMessage: string) {
      let message: unknown;

      try {
        message = JSON.parse(rawMessage);
      } catch {
        return;
      }

      const record = toRecord(message);

      if (record.type === "event" && record.event === "connect.challenge") {
        const payload = toRecord(record.payload);
        const nonce = typeof payload.nonce === "string" ? payload.nonce : "";

        void sendConnect(nonce).catch(fail);
        return;
      }

      if (record.type !== "res") {
        return;
      }

      const id = typeof record.id === "string" ? record.id : "";
      const request = pending.get(id);

      if (!request) {
        return;
      }

      pending.delete(id);

      if (record.ok === true) {
        request.resolve(record.payload);
        return;
      }

      const error = toRecord(record.error);
      request.reject(
        new Error(
          typeof error.message === "string"
            ? error.message
            : "OpenClaw gateway request failed",
        ),
      );
    }

    try {
      gatewaySocket = connectGatewaySocket({
        gatewayUrl: params.gatewayUrl,
        timeoutMs,
        onMessage: handleGatewayMessage,
        onError(error) {
          if (!settled && !connected) {
            fail(error);
            return;
          }

          if (!settled) {
            fail(error);
          }
        },
      });
    } catch (error) {
      fail(error);
    }
  });
}

async function runGatewayCall(
  request: OpenClawRunRequest,
): Promise<GatewayCallResult> {
  const connection = getOpenClawGatewayConnection(request.agentId);

  if (!connection) {
    throw new Error("OPENCLAW_AGENT_NOT_FOUND");
  }

  const submitEnabled = readSubmitEnabled(request.agentId);
  const requests: OpenClawGatewayRequest[] = [
    {
      method: "health",
      params: {},
    },
  ];

  if (submitEnabled) {
    requests.push({
      method: "chat.send",
      params: {
        sessionKey: "agent:main:main",
        message: buildOpenClawMessage(request),
        deliver: false,
        idempotencyKey: buildId(`bpai-${request.resultId}`),
      },
    });
  }

  const [hello, health, submission] = await callOpenClawGateway({
    gatewayUrl: connection.gatewayUrl,
    token: connection.token,
    deviceAuth: readOpenClawDeviceAuth(request.agentId),
    requests,
  });

  return {
    hello: toRecord(hello),
    health: toRecord(health),
    submission: submission ? toRecord(submission) : null,
    submitEnabled,
  };
}

export async function runOpenClawWorkOrderExecution(
  request: OpenClawRunRequest,
): Promise<OpenClawRunRecord> {
  const startedAt = new Date().toISOString();
  const input = {
    agentId: request.agentId,
    taskId: request.taskId,
    resultId: request.resultId,
    workOrderNo: request.workOrderNo,
    workflowId: request.workflowId,
    payload: request.payload,
  };

  try {
    const result = await runGatewayCall(request);
    const modeText = result.submitEnabled
      ? "已向 OpenClaw sidecar 下发任务。"
      : "已连通 OpenClaw sidecar 并完成 health 探测；当前处于 probe_only，未下发 chat.send。";

    return {
      agentId: request.agentId,
      status: "completed",
      summaryText: `OpenClaw ${request.agentId} ${modeText}`,
      input,
      structuredPayload: {
        submitEnabled: result.submitEnabled,
        gatewayHealth: result.health,
        gatewayHello: result.hello,
        submission: result.submission,
        artifacts: [
          result.submitEnabled
            ? "OpenClaw sidecar 任务下发记录"
            : "OpenClaw sidecar health 探测记录",
        ],
        changedObjects: [],
        businessWritebackApplied: false,
      },
      startedAt,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = normalizeGatewayError(error);

    return {
      agentId: request.agentId,
      status: message === "OPENCLAW_AGENT_NOT_FOUND" ? "not_found" : "failed",
      summaryText: `OpenClaw ${request.agentId} 执行未完成：${message}`,
      input,
      structuredPayload: {
        submitEnabled: readSubmitEnabled(request.agentId),
        error: message,
        changedObjects: [],
        businessWritebackApplied: false,
      },
      errorCode:
        message.includes("missing scope") || message.includes("operator.write")
          ? "OPENCLAW_GATEWAY_SCOPE_MISSING"
          : message,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}

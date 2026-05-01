import assert from "node:assert/strict";

const baseUrl = process.env.BPAI_BASE_URL ?? "http://localhost:3001";
const seed = Date.now().toString(36);

function invariant(condition, message) {
  assert.equal(Boolean(condition), true, message);
}

async function request(path, init = {}, cookie = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers ?? {}),
    },
  });

  return response;
}

async function requestJson(path, init = {}, cookie = "") {
  const response = await request(
    path,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    },
    cookie,
  );
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${path}: ${json?.message ?? text}`);
  }

  return { json, response };
}

async function runTool(cookieHeader, toolName, input) {
  const { json } = await requestJson(
    "/api/ai-tools/run",
    {
      method: "POST",
      body: JSON.stringify({ toolName, input }),
    },
    cookieHeader,
  );
  const toolRun = json?.toolRun;

  invariant(toolRun, `${toolName}: missing toolRun`);
  invariant(
    toolRun.status === "completed",
    `${toolName}: expected completed, got ${toolRun.status}: ${toolRun.summaryText}`,
  );

  return toolRun;
}

async function main() {
  const login = await requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "dulongkai.cui@akane.waseda.jp",
      password: "bpai-local-001",
    }),
  });
  const sessionCookie = login.response.headers.get("set-cookie");
  invariant(sessionCookie, "login: missing session cookie");
  const cookieHeader = sessionCookie.split(";")[0];

  const title = `BPAI direct document smoke ${seed}`;
  const content = `BPAI direct write smoke content ${seed}\n`;

  const createdDocumentRun = await runTool(cookieHeader, "document.create", {
    kind: "document",
    title,
    sampleAssetId: "doc-weekly-001",
  });
  const document = createdDocumentRun.structuredPayload?.document;
  const documentId = document?.id;

  invariant(documentId, "document.create: missing document id");
  invariant(
    createdDocumentRun.structuredPayload?.changedObjects?.length > 0,
    "document.create: missing changedObjects",
  );

  const searchDocumentRun = await runTool(cookieHeader, "document.search", {
    kind: "document",
    query: title,
    limit: 5,
  });
  const documentCandidates = searchDocumentRun.structuredPayload?.candidates ?? [];
  invariant(
    documentCandidates.some((candidate) => candidate.documentId === documentId),
    "document.search: created document was not found",
  );

  const readDocumentRun = await runTool(cookieHeader, "document.read", {
    kind: "document",
    documentId,
  });
  invariant(
    readDocumentRun.structuredPayload?.document?.id === documentId,
    "document.read: returned wrong document",
  );

  const writeDocumentRun = await runTool(cookieHeader, "document.write_content", {
    kind: "document",
    documentId,
    content,
  });
  invariant(
    writeDocumentRun.structuredPayload?.changedObjects?.some((item) =>
      item.includes(`${documentId}/content`),
    ),
    "document.write_content: missing content changedObject",
  );

  const contentResponse = await request(`/api/assets/document/${documentId}/content`);
  const persistedContent = await contentResponse.text();
  invariant(contentResponse.ok, "document content route failed");
  invariant(persistedContent === content, "document.write_content: persisted content mismatch");

  const workOrderTitle = `BPAI direct work order smoke ${seed}`;
  const createdWorkOrderRun = await runTool(cookieHeader, "work_order.create", {
    title: workOrderTitle,
    sourceSummary: `Created by direct AI tool smoke ${seed}`,
    projectName: "BPAI direct smoke",
    siteName: "Tool Gateway",
    nextAction: "Verify direct work order creation",
    priority: "normal",
    stage: "registration",
  });
  const workOrderNo = createdWorkOrderRun.structuredPayload?.workOrder?.workOrderNo;

  invariant(workOrderNo, "work_order.create: missing workOrderNo");
  invariant(
    createdWorkOrderRun.structuredPayload?.changedObjects?.length > 0,
    "work_order.create: missing changedObjects",
  );

  const searchWorkOrderRun = await runTool(cookieHeader, "work_order.search", {
    query: workOrderTitle,
    limit: 5,
  });
  const workOrderCandidates = searchWorkOrderRun.structuredPayload?.candidates ?? [];
  invariant(
    workOrderCandidates.some((candidate) => candidate.workOrderNo === workOrderNo),
    "work_order.search: created work order was not found",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        documentId,
        workOrderNo,
        tested: [
          "document.create",
          "document.search",
          "document.read",
          "document.write_content",
          "work_order.create",
          "work_order.search",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

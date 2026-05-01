import assert from "node:assert/strict";

const baseUrl = process.env.BPAI_BASE_URL ?? "http://localhost:3001";

function invariant(condition, message) {
  assert.equal(Boolean(condition), true, message);
}

async function requestJson(path, init = {}, cookie = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${path}: ${json?.message ?? text}`);
  }

  return { json, response };
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

  const { json } = await requestJson(
    "/api/ai-tools/registry",
    {},
    sessionCookie.split(";")[0],
  );
  const capabilityNames = new Set(json.capabilities?.map((item) => item.name));
  const resourceTypes = new Set(json.resources?.map((item) => item.type));

  invariant(resourceTypes.has("work_order"), "registry: missing work_order resource");
  invariant(resourceTypes.has("document"), "registry: missing document resource");
  invariant(capabilityNames.has("work_order.read"), "registry: missing work_order.read capability");
  invariant(capabilityNames.has("work_order.search"), "registry: missing work_order.search capability");
  invariant(capabilityNames.has("document.create"), "registry: missing document.create capability");
  invariant(
    capabilityNames.has("openclaw.work_order.execute"),
    "registry: missing openclaw.work_order.execute capability",
  );
  invariant(
    json.counts?.capabilities === json.capabilities.length,
    "registry: capability count mismatch",
  );
  invariant(
    json.counts?.resources === json.resources.length,
    "registry: resource count mismatch",
  );
  invariant(json.counts?.byDomain?.work_order >= 1, "registry: missing work_order domain count");
  invariant(json.counts?.bySourceKind?.internal >= 1, "registry: missing internal source count");
  invariant(json.counts?.byRiskLevel?.read >= 1, "registry: missing read risk count");

  console.log(
    JSON.stringify(
      {
        ok: true,
        resourceCount: json.counts.resources,
        capabilityCount: json.counts.capabilities,
        bySourceKind: json.counts.bySourceKind,
        byDomain: json.counts.byDomain,
        byRiskLevel: json.counts.byRiskLevel,
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

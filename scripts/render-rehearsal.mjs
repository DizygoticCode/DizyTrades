import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const API_ORIGIN = "https://api.render.com/v1";
const terminalFailureStatuses = new Set([
  "build_failed",
  "update_failed",
  "canceled",
  "cancelled",
  "deactivated",
]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function sanitiseMessage(reason) {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message
    .replace(/rnd_[A-Za-z0-9_-]+/g, "[REDACTED_RENDER_KEY]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

export function normaliseCollection(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray(payload[key])) {
    return payload[key];
  }
  return [];
}

function unwrap(item, key) {
  if (item && typeof item === "object" && item[key]) return item[key];
  return item;
}

export function flattenService(payload) {
  const service = unwrap(payload, "service") ?? payload;
  if (!service || typeof service !== "object") return service;
  const details = service.serviceDetails;
  return details && typeof details === "object"
    ? { ...service, ...details, serviceDetails: details }
    : service;
}

export function deployCommitId(deploy) {
  return String(
    deploy?.commit?.id ??
      deploy?.commit?.sha ??
      deploy?.commitId ??
      deploy?.commit_id ??
      "",
  );
}

export function findExpectedDeploy(deploys, expectedCommit) {
  const expected = String(expectedCommit ?? "").trim().toLowerCase();
  if (!expected) {
    return deploys.find((deploy) => String(deploy?.status) === "live") ?? null;
  }
  return (
    deploys.find((deploy) => {
      const actual = deployCommitId(deploy).toLowerCase();
      return actual && (actual.startsWith(expected) || expected.startsWith(actual));
    }) ?? null
  );
}

export function buildHealthUrl(input) {
  const service = flattenService(input);
  const slug = typeof service?.slug === "string" ? service.slug.trim() : "";
  const fallbackUrl = slug ? `https://${slug}.onrender.com` : "";
  const base = required(service?.url ?? fallbackUrl, "Render service URL");
  const healthPath =
    typeof service?.healthCheckPath === "string" && service.healthCheckPath.trim()
      ? service.healthCheckPath.trim()
      : "/api/health";
  return new URL(healthPath, base.endsWith("/") ? base : `${base}/`).toString();
}

function serviceSummary(input) {
  const service = flattenService(input);
  return {
    id: String(service?.id ?? "unknown"),
    name: String(service?.name ?? "unknown"),
    type: String(service?.type ?? "unknown"),
    branch: String(service?.branch ?? "unknown"),
    repo: String(service?.repo ?? "unknown"),
    region: String(service?.region ?? "unknown"),
    plan: String(service?.plan ?? "unknown"),
    suspended: String(service?.suspended ?? "unknown"),
    autoDeploy: String(service?.autoDeploy ?? "unknown"),
    url: String(service?.url ?? "unknown"),
    healthCheckPath: String(service?.healthCheckPath ?? "/api/health"),
    persistentDiskDeclared: Boolean(service?.disk),
  };
}

function deploySummary(deploy) {
  return {
    id: String(deploy?.id ?? "unknown"),
    status: String(deploy?.status ?? "unknown"),
    commit: deployCommitId(deploy) || "unknown",
    createdAt: String(deploy?.createdAt ?? deploy?.created_at ?? "unknown"),
    finishedAt: String(deploy?.finishedAt ?? deploy?.finished_at ?? "unknown"),
  };
}

function eventSummary(item) {
  const event = unwrap(item, "event") ?? {};
  return {
    id: String(event.id ?? "unknown"),
    type: String(event.type ?? "unknown"),
    timestamp: String(
      event.timestamp ?? event.createdAt ?? event.created_at ?? "unknown",
    ),
  };
}

async function requestJson(url, apiKey) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Render API ${response.status} for ${new URL(url).pathname}.`);
  }
  return text ? JSON.parse(text) : null;
}

async function fetchHealth(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { parseError: true };
  }
  if (!response.ok) throw new Error(`Production health returned HTTP ${response.status}.`);
  if (
    body?.ok !== true ||
    body?.service !== "dizytrades" ||
    body?.mode !== "test" ||
    body?.liveTradingEnabled !== false
  ) {
    throw new Error("Production health contract is not the expected simulation-only DizyTrades service.");
  }
  return {
    status: response.status,
    ok: body.ok,
    service: body.service,
    mode: body.mode,
    liveTradingEnabled: body.liveTradingEnabled,
    checkedAt: String(body.checkedAt ?? "unknown"),
  };
}

export async function waitForHealth(
  url,
  {
    timeoutMs = 90_000,
    intervalMs = 5_000,
    readHealth = fetchHealth,
    pause = delay,
  } = {},
) {
  const startedAt = Date.now();
  let lastError = null;
  do {
    try {
      return await readHealth(url);
    } catch (reason) {
      lastError = reason;
    }
    if (Date.now() - startedAt >= timeoutMs) break;
    await pause(intervalMs);
  } while (Date.now() - startedAt < timeoutMs);
  throw lastError ?? new Error("Production health did not become available.");
}

async function listDeploys(serviceId, apiKey) {
  const payload = await requestJson(
    `${API_ORIGIN}/services/${encodeURIComponent(serviceId)}/deploys?limit=20`,
    apiKey,
  );
  return normaliseCollection(payload, "deploys").map((item) => unwrap(item, "deploy"));
}

async function waitForDeploy({ serviceId, apiKey, expectedCommit, timeoutMs }) {
  const startedAt = Date.now();
  let lastSeen = null;
  while (Date.now() - startedAt < timeoutMs) {
    const deploys = await listDeploys(serviceId, apiKey);
    const candidate = findExpectedDeploy(deploys, expectedCommit);
    if (candidate) {
      lastSeen = candidate;
      const status = String(candidate.status ?? "unknown");
      if (status === "live") return candidate;
      if (terminalFailureStatuses.has(status)) {
        throw new Error(`Expected Render deploy ended with status ${status}.`);
      }
    }
    await delay(15_000);
  }
  const last = lastSeen ? ` Last observed status: ${String(lastSeen.status)}.` : "";
  throw new Error(`Timed out waiting for the expected Render deploy.${last}`);
}

export async function runRenderRehearsal(environment = process.env) {
  const apiKey = required(environment.RENDER_API_KEY, "RENDER_API_KEY");
  const serviceId = required(environment.RENDER_SERVICE_ID, "RENDER_SERVICE_ID");
  const expectedCommit = String(environment.EXPECTED_COMMIT ?? "").trim();
  const timeoutMinutes = Math.max(
    1,
    Math.min(30, Number(environment.RENDER_WAIT_MINUTES ?? 20) || 20),
  );

  const servicePayload = await requestJson(
    `${API_ORIGIN}/services/${encodeURIComponent(serviceId)}`,
    apiKey,
  );
  const service = flattenService(servicePayload);
  if (String(service?.id) !== serviceId) {
    throw new Error("Render returned a different service than RENDER_SERVICE_ID.");
  }

  const deploy = await waitForDeploy({
    serviceId,
    apiKey,
    expectedCommit,
    timeoutMs: timeoutMinutes * 60_000,
  });
  const health = await waitForHealth(buildHealthUrl(service));
  const eventsPayload = await requestJson(
    `${API_ORIGIN}/services/${encodeURIComponent(serviceId)}/events?limit=20`,
    apiKey,
  );
  const events = normaliseCollection(eventsPayload, "events")
    .slice(0, 20)
    .map(eventSummary);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    rehearsal: "read-only-production-observation",
    expectedCommit: expectedCommit || null,
    service: serviceSummary(service),
    deploy: deploySummary(deploy),
    health,
    recentEvents: events,
    assertions: {
      renderAuthenticationSucceeded: true,
      configuredServiceResolved: true,
      expectedDeployIsLive: true,
      productionHealthPassed: true,
      simulationOnlyBoundaryPassed: true,
      renderConfigurationWasNotModified: true,
    },
    boundaries: [
      "No deploy, rollback, suspend, resume, environment, disk or service configuration write was requested.",
      "The report intentionally excludes environment variables, secret values, build logs and request logs.",
      "This observation does not by itself prove persistent-disk restoration; that requires a controlled restore exercise.",
    ],
  };
}

async function main() {
  const outputDirectory = path.resolve(process.env.REHEARSAL_OUTPUT_DIR ?? "artifacts/render-rehearsal");
  try {
    const report = await runRenderRehearsal();
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      path.join(outputDirectory, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    console.log("Render rehearsal passed.");
    console.log(`Service: ${report.service.name} (${report.service.id})`);
    console.log(`Deploy: ${report.deploy.status} ${report.deploy.commit}`);
    console.log(`Health: ${report.health.service} ${report.health.mode} liveTrading=${report.health.liveTradingEnabled}`);
  } catch (reason) {
    const message = sanitiseMessage(reason);
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      path.join(outputDirectory, "failure.json"),
      `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), error: message }, null, 2)}\n`,
      "utf8",
    );
    console.error(`Render rehearsal failed: ${message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

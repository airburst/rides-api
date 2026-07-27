import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const idx = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[idx];
}

function summarizeDurations(durationsMs) {
  const sorted = [...durationsMs].sort((a, b) => a - b);
  return {
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    avgMs:
      durationsMs.length > 0
        ? durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length
        : 0,
  };
}

function loadScenarioConfig(configPath) {
  const raw = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw);

  if (!parsed || !Array.isArray(parsed.scenarios)) {
    throw new Error("Invalid scenario config: missing scenarios array");
  }

  return parsed;
}

function expandPath(pathTemplate, vars) {
  return pathTemplate.replaceAll("{rideId}", vars.rideId);
}

function buildHeaders(scenario, env) {
  const headers = {
    "Content-Type": "application/json",
    "X-Club-Id": env.clubId,
  };

  if (scenario.auth === "bearer") {
    if (!env.bearerToken) {
      throw new Error(
        `Scenario ${scenario.name} requires BENCH_BEARER_TOKEN but it is not set`,
      );
    }
    headers.Authorization = `Bearer ${env.bearerToken}`;
  }

  if (scenario.auth === "apiKey") {
    if (!env.apiKey) {
      throw new Error(
        `Scenario ${scenario.name} requires BENCH_API_KEY but it is not set`,
      );
    }
    headers.Authorization = `Bearer ${env.apiKey}`;
  }

  return headers;
}

function canRunScenario(scenario, env) {
  if (scenario.auth === "bearer" && !env.bearerToken) return false;
  if (scenario.auth === "apiKey" && !env.apiKey) return false;
  return true;
}

async function executeRequests({
  scenario,
  count,
  concurrency,
  env,
  timeoutMs,
}) {
  let next = 0;
  const durationsMs = [];
  const statusCounts = {};
  let failures = 0;

  const worker = async () => {
    while (true) {
      const idx = next;
      next += 1;
      if (idx >= count) return;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const path = expandPath(scenario.path, { rideId: env.rideId });
      const url = `${env.baseUrl}${path}`;

      const started = performance.now();
      try {
        const response = await fetch(url, {
          method: scenario.method,
          headers: buildHeaders(scenario, env),
          body:
            scenario.body !== undefined && scenario.method !== "GET"
              ? JSON.stringify(scenario.body)
              : undefined,
          signal: controller.signal,
        });
        const elapsed = performance.now() - started;
        durationsMs.push(elapsed);
        const code = String(response.status);
        statusCounts[code] = (statusCounts[code] ?? 0) + 1;
        if (!response.ok) failures += 1;
      } catch {
        const elapsed = performance.now() - started;
        durationsMs.push(elapsed);
        failures += 1;
        statusCounts.error = (statusCounts.error ?? 0) + 1;
      } finally {
        clearTimeout(timeout);
      }
    }
  };

  const startedAt = performance.now();
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, async () => worker()),
  );
  const totalMs = performance.now() - startedAt;

  const summary = summarizeDurations(durationsMs);
  const requestsPerSecond = count > 0 ? (count / totalMs) * 1000 : 0;
  const errorRate = count > 0 ? failures / count : 0;

  return {
    scenario: scenario.name,
    method: scenario.method,
    path: scenario.path,
    requests: count,
    failures,
    errorRate,
    requestsPerSecond,
    totalMs,
    latency: summary,
    statusCounts,
  };
}

async function run() {
  const configPath =
    process.argv[2] ??
    join(process.cwd(), "scripts/bench/scenarios.default.json");

  const env = {
    baseUrl: process.env.BENCH_BASE_URL ?? "http://localhost:3001",
    clubId: process.env.BENCH_CLUB_ID ?? "bcc",
    bearerToken: process.env.BENCH_BEARER_TOKEN,
    apiKey: process.env.BENCH_API_KEY,
    rideId: process.env.BENCH_RIDE_ID ?? "replace-me",
    outputDir: process.env.BENCH_OUTPUT_DIR ?? "artifacts/bench",
    label: process.env.BENCH_LABEL ?? "bench-run",
    timeoutMs: Number(process.env.BENCH_TIMEOUT_MS ?? "10000"),
    warmupOverride: Number(process.env.BENCH_WARMUP_REQUESTS ?? "0"),
  };

  const loaded = loadScenarioConfig(configPath);
  const warmupRequests =
    env.warmupOverride > 0
      ? env.warmupOverride
      : Number(loaded.meta?.warmupRequests ?? 50);
  const measuredRequests = Number(loaded.meta?.measuredRequests ?? 300);
  const concurrency = Number(loaded.meta?.concurrency ?? 20);
  const enabledScenarios = loaded.scenarios.filter((s) => s.enabled !== false);

  if (enabledScenarios.length === 0) {
    throw new Error("No enabled scenarios in config file");
  }

  const runnableScenarios = enabledScenarios.filter((scenario) => {
    const runnable = canRunScenario(scenario, env);
    if (!runnable) {
      console.warn(
        `Skipping scenario ${scenario.name}: required auth credential is missing`,
      );
    }
    return runnable;
  });

  if (runnableScenarios.length === 0) {
    throw new Error(
      "No runnable scenarios after auth checks. Provide benchmark credentials or disable auth-required scenarios.",
    );
  }

  console.info(
    `Running ${runnableScenarios.length} scenarios from ${configPath}`,
  );
  console.info(`Base URL: ${env.baseUrl}`);
  console.info(`Warmup requests per scenario: ${warmupRequests}`);
  console.info(`Measured requests per scenario: ${measuredRequests}`);
  console.info(`Concurrency: ${concurrency}`);

  const results = [];

  for (const scenario of runnableScenarios) {
    console.info(`Warmup: ${scenario.name}`);
    await executeRequests({
      scenario,
      count: warmupRequests,
      concurrency,
      env,
      timeoutMs: env.timeoutMs,
    });

    console.info(`Measure: ${scenario.name}`);
    const measured = await executeRequests({
      scenario,
      count: measuredRequests,
      concurrency,
      env,
      timeoutMs: env.timeoutMs,
    });
    results.push(measured);
  }

  const output = {
    createdAt: new Date().toISOString(),
    label: env.label,
    configPath,
    environment: {
      baseUrl: env.baseUrl,
      clubId: env.clubId,
      timeoutMs: env.timeoutMs,
      warmupRequests,
      measuredRequests,
      concurrency,
    },
    results,
  };

  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const filePath = join(env.outputDir, `${timestamp}-${env.label}.json`);
  const latestFilePath = join(env.outputDir, `${env.label}-latest.json`);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(output, null, 2));
  writeFileSync(latestFilePath, JSON.stringify(output, null, 2));

  console.info(`Benchmark output written to ${filePath}`);
  console.info(`Latest benchmark output updated at ${latestFilePath}`);
}

void run();

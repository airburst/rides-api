import { existsSync, readFileSync } from "node:fs";

function loadResult(path) {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw);
}

function percentageDelta(base, candidate) {
  if (base === 0) {
    if (candidate === 0) return 0;
    return Number.POSITIVE_INFINITY;
  }
  return ((candidate - base) / base) * 100;
}

function fmt(value) {
  if (!Number.isFinite(value)) return "inf";
  return `${value.toFixed(2)}%`;
}

function gateForScenario(base, cand) {
  const baselineSucceeded = base.failures === 0;
  const candidateSucceeded = cand.failures === 0;
  const p50Ok = cand.latency.p50Ms <= base.latency.p50Ms;
  const p95Ok = cand.latency.p95Ms <= base.latency.p95Ms;
  const errorOk = cand.errorRate <= base.errorRate;

  const p99Delta = percentageDelta(base.latency.p99Ms, cand.latency.p99Ms);
  const p95Improved = cand.latency.p95Ms < base.latency.p95Ms;
  const p99Ok =
    cand.latency.p99Ms <= base.latency.p99Ms ||
    (p99Delta <= 5 && p95Improved && errorOk);

  const rpsOk = cand.requestsPerSecond >= base.requestsPerSecond;

  const pass =
    baselineSucceeded &&
    candidateSucceeded &&
    p50Ok &&
    p95Ok &&
    p99Ok &&
    errorOk &&
    rpsOk;

  return {
    pass,
    checks: {
      baselineSucceeded,
      candidateSucceeded,
      p50Ok,
      p95Ok,
      p99Ok,
      errorOk,
      rpsOk,
    },
    deltas: {
      p50Ms: percentageDelta(base.latency.p50Ms, cand.latency.p50Ms),
      p95Ms: percentageDelta(base.latency.p95Ms, cand.latency.p95Ms),
      p99Ms: p99Delta,
      errorRate: percentageDelta(base.errorRate, cand.errorRate),
      requestsPerSecond: percentageDelta(
        base.requestsPerSecond,
        cand.requestsPerSecond,
      ),
    },
  };
}

function main() {
  const baselinePath = process.argv[2];
  const candidatePath = process.argv[3];

  if (!baselinePath || !candidatePath) {
    throw new Error(
      "Usage: bun run bench:compare <baseline-json> <candidate-json>",
    );
  }

  if (!existsSync(baselinePath)) {
    throw new Error(
      `Baseline artifact not found: ${baselinePath}. Run bun run bench:run:postgres first.`,
    );
  }

  if (!existsSync(candidatePath)) {
    throw new Error(
      `Candidate artifact not found: ${candidatePath}. Run bun run bench:run:sqlite first.`,
    );
  }

  const baseline = loadResult(baselinePath);
  const candidate = loadResult(candidatePath);

  const candidateByName = new Map(
    candidate.results.map((r) => [r.scenario, r]),
  );

  let overallPass = true;

  for (const baseScenario of baseline.results) {
    const candScenario = candidateByName.get(baseScenario.scenario);
    if (!candScenario) {
      overallPass = false;
      console.error(`Missing scenario in candidate: ${baseScenario.scenario}`);
      continue;
    }

    const gate = gateForScenario(baseScenario, candScenario);
    if (!gate.pass) overallPass = false;

    console.info(`Scenario: ${baseScenario.scenario}`);
    console.info(`  pass: ${String(gate.pass)}`);
    console.info(
      `  baseline succeeded: ${String(gate.checks.baselineSucceeded)}`,
    );
    console.info(
      `  candidate succeeded: ${String(gate.checks.candidateSucceeded)}`,
    );
    console.info(`  p50 delta: ${fmt(gate.deltas.p50Ms)}`);
    console.info(`  p95 delta: ${fmt(gate.deltas.p95Ms)}`);
    console.info(`  p99 delta: ${fmt(gate.deltas.p99Ms)}`);
    console.info(`  error delta: ${fmt(gate.deltas.errorRate)}`);
    console.info(`  rps delta: ${fmt(gate.deltas.requestsPerSecond)}`);
  }

  console.info(`Overall gate pass: ${String(overallPass)}`);

  if (!overallPass) {
    process.exitCode = 2;
  }
}

main();

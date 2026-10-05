import type { Subprocess } from "bun";
import { existsSync } from "node:fs";
import { apiUrl, appUrl, localEnv } from "../e2e/environment.js";

const root = new URL("../", import.meta.url).pathname;
const frontendRoot = new URL("../../rides", import.meta.url).pathname;
const container = `rides-e2e-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
let activeProcess: Subprocess | undefined;
let containerCreated = false;
const cancellation = new AbortController();

async function run(command: string[], environment = process.env, cwd = root) {
  if (cancellation.signal.aborted) throw new Error("E2E run cancelled");
  activeProcess = Bun.spawn(command, {
    cwd,
    env: environment,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await activeProcess.exited;
  activeProcess = undefined;
  if (exitCode !== 0) {
    throw new Error(`${command[0] ?? "Command"} exited with code ${exitCode}`);
  }
}

const cancel = () => {
  cancellation.abort();
  activeProcess?.kill();
};
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);

try {
  for (const executable of ["bun", "node", "docker"]) {
    if (!Bun.which(executable)) throw new Error(`${executable} is required`);
  }
  if (!existsSync(`${frontendRoot}/package.json`)) {
    throw new Error("The sibling ../rides frontend checkout is required");
  }
  for (const url of [apiUrl, appUrl]) {
    try {
      const listener = Bun.listen({
        hostname: "127.0.0.1",
        port: Number(new URL(url).port),
        socket: { data: () => undefined },
      });
      listener.stop(true);
    } catch {
      throw new Error(
        `${url} is occupied; stop incident:dev or the existing server before running e2e`,
      );
    }
  }
  await run(["docker", "info", "--format", "{{.ServerVersion}}"]);
  await run(["bun", "install", "--frozen-lockfile"]);
  await run(["bun", "install", "--frozen-lockfile"], process.env, frontendRoot);
  await run(["bunx", "--no-install", "playwright", "install", "chromium"]);

  console.info(`Starting disposable database ${container}`);
  containerCreated = true;
  await run([
    "docker",
    "run",
    "--detach",
    "--name",
    container,
    "--label",
    "clubrides.e2e=true",
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_USER=postgres",
    "--env",
    "POSTGRES_PASSWORD=local-e2e-only",
    "--env",
    "POSTGRES_DB=rides_incident",
    "--health-cmd",
    "pg_isready -U postgres -d rides_incident",
    "--health-interval",
    "1s",
    "--health-timeout",
    "3s",
    "--health-retries",
    "30",
    "postgres:17",
  ]);
  const inspect = Bun.spawn(["docker", "inspect", container], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const details = JSON.parse(await new Response(inspect.stdout).text()) as {
    NetworkSettings: { Ports: Record<string, { HostPort: string }[]> };
  }[];
  if ((await inspect.exited) !== 0)
    throw new Error("Could not inspect the test database");
  const port = details[0]?.NetworkSettings.Ports["5432/tcp"]?.[0]?.HostPort;
  if (!port || !/^\d+$/.test(port))
    throw new Error("Test database port was not published");
  const databaseUrl = `postgres://postgres:local-e2e-only@127.0.0.1:${port}/rides_incident`;
  const environment = {
    ...process.env,
    ...localEnv,
    DATABASE_URL: databaseUrl,
    E2E_DATABASE_URL: databaseUrl,
  };

  const events = Bun.spawn(
    [
      "docker",
      "events",
      "--since",
      "1m",
      "--filter",
      `container=${container}`,
      "--filter",
      "event=health_status: healthy",
      "--format",
      "{{json .}}",
    ],
    { stdout: "pipe", stderr: "inherit" },
  );
  activeProcess = events;
  const timer = setTimeout(() => events.kill(), 60_000);
  try {
    const reader = events.stdout.getReader();
    const event = await reader.read();
    reader.releaseLock();
    if (event.done || cancellation.signal.aborted)
      throw new Error("Test database did not become healthy");
  } finally {
    clearTimeout(timer);
    events.kill();
    await events.exited;
    activeProcess = undefined;
  }
  await run(["bun", "run", "db:migrate"], environment);
  await run(["bun", "run", "test:e2e", ...process.argv.slice(2)], environment);
} catch (error) {
  console.error(error instanceof Error ? error.message : "E2E setup failed");
  process.exitCode = cancellation.signal.aborted ? 130 : 1;
} finally {
  if (containerCreated) {
    console.info(`Removing disposable database ${container}`);
    const cleanup = Bun.spawn(
      ["docker", "rm", "--force", "--volumes", container],
      {
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    if ((await cleanup.exited) !== 0) process.exitCode = 1;
  }
  process.off("SIGINT", cancel);
  process.off("SIGTERM", cancel);
}

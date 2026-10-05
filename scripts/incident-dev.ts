import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
import {
  apiUrl,
  appUrl,
  databaseUrl,
  localEnv,
  testPassword,
} from "../e2e/environment.js";

const environment = { ...process.env, ...localEnv };
const migration = Bun.spawn(["bun", "run", "db:migrate"], {
  env: environment,
  stdout: "inherit",
  stderr: "inherit",
});
if ((await migration.exited) !== 0)
  throw new Error("Local incident migrations failed");

const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
try {
  const password = await hashPassword(testPassword);
  await sql.begin(async (tx) => {
    const clubs = await tx<
      { id: string }[]
    >`select id from clubs where slug = 'bcc'`;
    const club = clubs.at(0);
    if (!club) throw new Error("Local BCC club missing after migrations");
    await tx`insert into users (id, email, name, mobile, emergency, email_verified, is_super_admin) values ('incident-demo-admin', 'incident-admin@example.invalid', 'Incident Admin', '07000000000', 'Test contact 07000000001', true, false) on conflict (id) do nothing`;
    await tx`insert into accounts (id, account_id, provider_id, user_id, password) values ('incident-demo-account', 'incident-demo-admin', 'credential', 'incident-demo-admin', ${password}) on conflict (id) do update set password = excluded.password`;
    await tx`insert into user_clubs (user_id, club_id, role) values ('incident-demo-admin', ${club.id}, 'ADMIN') on conflict (user_id, club_id) do update set role = 'ADMIN'`;
  });
} finally {
  await sql.end();
}

const backend = Bun.spawn(["bun", "src/index.ts"], {
  env: environment,
  stdout: "inherit",
  stderr: "inherit",
});
const frontend = Bun.spawn(
  [
    "node",
    "node_modules/vite/bin/vite.js",
    "--host",
    "localhost",
    "--port",
    "3000",
    "--strictPort",
  ],
  {
    cwd: new URL("../../rides", import.meta.url).pathname,
    env: {
      ...environment,
      VITE_API_URL: apiUrl,
      VITE_AUTH_PROVIDER: "better-auth",
      VITE_AUTH0_DOMAIN: "invalid.example",
      VITE_AUTH0_CLIENT_ID: "local-incident",
      VITE_AUTH0_AUDIENCE: "local-incident",
    },
    stdout: "inherit",
    stderr: "inherit",
  },
);
const stop = () => {
  backend.kill();
  frontend.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.info(`Local incident app: ${appUrl}; API: ${apiUrl}`);
console.info("Local-only login: incident-admin@example.invalid");
const exitCode = await Promise.race([backend.exited, frontend.exited]);
stop();
process.exitCode = exitCode;

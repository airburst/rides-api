export const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  "postgres://postgres:local-incident-only@localhost:55432/rides_incident";
const parsedDatabase = new URL(databaseUrl);
if (
  !["localhost", "127.0.0.1"].includes(parsedDatabase.hostname) ||
  parsedDatabase.pathname !== "/rides_incident"
) {
  throw new Error(
    "E2E_DATABASE_URL must point to the local rides_incident database",
  );
}

export const apiUrl = "http://localhost:3101";
export const appUrl = "http://localhost:3000";
export const testPassword = "Local-incident-test-password-123";
export const localEnv = {
  DATABASE_URL: databaseUrl,
  NODE_ENV: "development",
  PORT: "3101",
  API_KEY: "local-incident-api-key",
  BETTER_AUTH_URL: apiUrl,
  BETTER_AUTH_SECRET: "local-incident-only-secret-at-least-32-characters",
  AUTH0_DOMAIN: "invalid.example",
  AUTH0_AUDIENCE: "local-incident",
  RESEND_API_KEY: "unused-local-test",
  EMAIL_FROM: "test@example.invalid",
  EMAIL_PROVIDER: "console",
  RIDERHQ_URL: "http://localhost:3101/unused",
  RIDERHQ_ACCOUNT_ID: "unused-local-test",
  RIDERHQ_PRIVATE_KEY: "unused-local-test",
  SOURCE_URL: appUrl,
  APP_URL: appUrl,
  COOKIE_DOMAIN: "",
  CACHE_ENABLED: "false",
  STRICT_TENANCY: "false",
  DEFAULT_CLUB_SLUG: "bcc",
  DEV_SKIP_AUTH: "false",
};

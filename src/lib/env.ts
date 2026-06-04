type EnvDef =
  | { required: true }
  | { type: "number"; default: number }
  | { type: "boolean"; default: boolean }
  | { default: string }
  | Record<never, never>;

type Infer<D extends EnvDef> =
  D extends { type: "number" } ? number :
  D extends { type: "boolean" } ? boolean :
  D extends { required: true } | { default: string } ? string :
  string | undefined;

const schema = {
  // Required
  DATABASE_URL:        { required: true },
  API_KEY:             { required: true },
  BETTER_AUTH_URL:     { required: true },
  BETTER_AUTH_SECRET:  { required: true },
  AUTH0_DOMAIN:        { required: true },
  AUTH0_AUDIENCE:      { required: true },
  RESEND_API_KEY:      { required: true },
  EMAIL_FROM:          { required: true },
  RIDERHQ_URL:         { required: true },
  RIDERHQ_ACCOUNT_ID:  { required: true },
  RIDERHQ_PRIVATE_KEY: { required: true },
  SOURCE_URL:          { required: true },
  // Optional strings
  APP_URL:             {},
  COOKIE_DOMAIN:       {},
  EMAIL_PROVIDER:      {},
  DEV_SKIP_AUTH_USER:  {},
  // Optional strings with defaults
  NODE_ENV:            { default: "development" },
  DEFAULT_CLUB_SLUG:   { default: "bcc" },
  REDIS_URL:           { default: "redis://localhost:6379" },
  // Optional numbers with defaults
  PORT:                { type: "number",  default: 3001  },
  CACHE_TTL:           { type: "number",  default: 300   },
  // Optional booleans with defaults
  CACHE_ENABLED:       { type: "boolean", default: false },
  STRICT_TENANCY:      { type: "boolean", default: false },
  DEV_SKIP_AUTH:       { type: "boolean", default: false },
  DB_SEEDING:          { type: "boolean", default: false },
  ALLOW_LOCALHOST_ORIGIN_IN_PROD: { type: "boolean", default: false },
} as const satisfies Record<string, EnvDef>;

export function env<K extends keyof typeof schema>(key: K): Infer<(typeof schema)[K]> {
  const def = schema[key];
  const raw = process.env[key];

  if (raw === undefined || raw === "") {
    if ("required" in def) throw new Error(`Missing required env var: ${key}`);
    if ("default" in def) return def.default as Infer<(typeof schema)[K]>;
    return undefined as Infer<(typeof schema)[K]>;
  }

  if ("type" in def) {
    if (def.type === "number") return Number(raw) as Infer<(typeof schema)[K]>;
    return (raw === "true") as Infer<(typeof schema)[K]>;
  }

  return raw as Infer<(typeof schema)[K]>;
}

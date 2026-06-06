import { env } from "./env.js";

const includeLocalhostTrustedOrigin =
  env("NODE_ENV") === "development" || env("ALLOW_LOCALHOST_ORIGIN_IN_PROD");

const baseTrustedOrigins = [
  "https://app.fairhursts.net",
  "https://bcc-rides.vercel.app",
] as const;

// Better Auth accepts wildcard trusted origins in this format.
const wildcardTrustedOrigins = ["https://*.clubrides.app"] as const;

export const trustedOrigins = [
  ...baseTrustedOrigins,
  ...wildcardTrustedOrigins,
  ...(includeLocalhostTrustedOrigin ? ["http://localhost:3000"] : []),
];

const vercelPreviewOriginPattern =
  /^https:\/\/bcc-rides-.*-airbursts-projects\.vercel\.app$/;

const clubridesWildcardPattern =
  /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.clubrides\.app$/i;

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;

  if (trustedOrigins.includes(origin)) return true;
  if (vercelPreviewOriginPattern.test(origin)) return true;
  if (clubridesWildcardPattern.test(origin)) return true;

  if (includeLocalhostTrustedOrigin) {
    return /^http:\/\/localhost:\d+$/.test(origin);
  }

  return false;
}

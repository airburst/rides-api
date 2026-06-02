import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";
import * as schema from "../db/schema/index.js";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      account: schema.accounts,
      session: schema.sessions,
      verification: schema.verification,
    },
  }),
  trustedOrigins: [
    "http://localhost:3000",
    "https://app.fairhursts.net",
    "https://bcc-rides.vercel.app",
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: Boolean(process.env.COOKIE_DOMAIN),
      domain: process.env.COOKIE_DOMAIN,
    },
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  account: {
    accountLinking: {
      enabled: false,
    },
  },
  user: {
    additionalFields: {
      isSuperAdmin: { type: "boolean", required: false, defaultValue: false },
      mobile: { type: "string", required: false },
      emergency: { type: "string", required: false },
      preferences: { type: "string", required: false },
      membershipId: { type: "string", required: false },
      membershipStatus: { type: "string", required: false },
    },
  },
  emailVerification: {
    sendVerificationEmail: ({ user, url }) => {
      if (process.env.EMAIL_PROVIDER === "resend") {
        // TODO: wire up Resend before BCC cutover
        return Promise.reject(new Error("Resend not yet configured"));
      }
      console.info(`[AUTH:VERIFY] ${user.email} → ${url}`);
      return Promise.resolve();
    },
  },
});

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Resend } from "resend";
import { db } from "../db/index.js";
import * as schema from "../db/schema/index.js";
import { env } from "./env.js";

export const auth = betterAuth({
  baseURL: env("BETTER_AUTH_URL"),
  secret: env("BETTER_AUTH_SECRET"),
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
      enabled: Boolean(env("COOKIE_DOMAIN")),
      domain: env("COOKIE_DOMAIN"),
    },
    useSecureCookies: env("NODE_ENV") === "production",
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
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      if (env("EMAIL_PROVIDER") === "resend") {
        const resend = new Resend(env("RESEND_API_KEY"));
        const { error } = await resend.emails.send({
          from: env("EMAIL_FROM"),
          to: user.email,
          subject: "Verify your email",
          html: `<a href="${url}">Click here to verify your email</a>`,
        });
        if (error) {
          throw new Error(`Resend error: ${error.message}`);
        }
        return;
      }
      console.info(`[AUTH:VERIFY] ${user.email} → ${url}`);
    },
  },
});

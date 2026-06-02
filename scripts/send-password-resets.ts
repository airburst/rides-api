/**
 * Send batched password-reset emails to BCC users with no credential account.
 *
 * Ordering: ADMIN → LEADER → USER, then lastLoginAt DESC NULLS LAST within each role.
 * Batches of 50 with a configurable delay between batches.
 *
 * Safe to re-run: skips users who already have a credential account (password set).
 *
 * Usage:
 *   BATCH_DELAY_MS=60000 bun run scripts/send-password-resets.ts
 *
 * Monitor progress:
 *   SELECT COUNT(*) FROM accounts WHERE provider_id = 'credential' AND password IS NULL;
 */

import postgres from "postgres";
import { auth } from "../src/lib/auth.js";

const CLUB_SLUG = process.env.TARGET_CLUB_SLUG ?? "bcc";
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = parseInt(process.env.BATCH_DELAY_MS ?? "60000", 10);
const REDIRECT_TO =
  process.env.RESET_REDIRECT_URL ??
  "https://app.fairhursts.net/c/bcc/reset-password";

const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });

interface UserRow {
  id: string;
  email: string;
  name: string | null;
}

async function fetchUsersNeedingReset(): Promise<UserRow[]> {
  return sql<UserRow[]>`
    SELECT u.id, u.email, u.name
    FROM user_clubs uc
    JOIN clubs c ON c.id = uc.club_id
    JOIN users u ON u.id = uc.user_id
    WHERE c.slug = ${CLUB_SLUG}
      AND NOT EXISTS (
        SELECT 1 FROM accounts a
        WHERE a.user_id = u.id
          AND a.provider_id = 'credential'
          AND a.password IS NOT NULL
      )
    ORDER BY
      CASE uc.role WHEN 'ADMIN' THEN 0 WHEN 'LEADER' THEN 1 ELSE 2 END,
      u.last_login_at DESC NULLS LAST
  `;
}

async function sendResets(users: UserRow[]): Promise<void> {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    for (const user of batch) {
      try {
        await auth.api.requestPasswordReset({
          body: { email: user.email, redirectTo: REDIRECT_TO },
        });
        console.info(`[RESET] Sent to ${user.email} (${user.id})`);
        sent++;
      } catch (err) {
        console.error(`[RESET] Failed for ${user.email}: ${String(err)}`);
        failed++;
      }
    }

    const remaining = users.length - (i + BATCH_SIZE);
    if (remaining > 0) {
      console.info(
        `[RESET] Batch complete. ${remaining} remaining. Waiting ${BATCH_DELAY_MS}ms...`,
      );
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.info(`[RESET] Done. sent=${sent} failed=${failed}`);
}

const users = await fetchUsersNeedingReset();
console.info(
  `[RESET] Found ${users.length} users needing reset in club "${CLUB_SLUG}"`,
);

if (users.length === 0) {
  console.info("[RESET] Nothing to do.");
} else {
  await sendResets(users);
}

await sql.end();

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { clubs, memberships } from "../db/schema/index.js";
import { env } from "../lib/env.js";

export const riderhqRouter = new Hono();

// RiderHQ integration is BCC-only. Resolve once per request.
const BCC_SLUG = "bcc";

// Types
interface MemberData {
  id: string;
  handle: string;
  member_is_user_bool: boolean;
  firstnames_txt: string;
  lastname_txt: string;
  email_eml: string;
  expiry_day: string;
  user?: {
    id?: string;
    verified_bool?: boolean;
    guest_bool?: boolean;
    handle?: string;
  };
}

interface Member {
  memberId: string;
  userId?: string;
  handle?: string;
  isUser: boolean;
  firstnames: string;
  lastname: string;
  email: string | null;
  expires: string;
  isVerified?: boolean;
  isGuest?: boolean;
}

interface MembersResponse {
  data: MemberData[];
  has_more_bool: boolean;
}

// Transform member data
const transformMember = (data: MemberData): Member => ({
  memberId: data.id,
  userId: data.user?.id,
  handle: data.user?.handle,
  isUser: data.member_is_user_bool,
  firstnames: data.firstnames_txt,
  lastname: data.lastname_txt,
  email: data.email_eml,
  expires: data.expiry_day,
  isVerified: data.user?.verified_bool,
  isGuest: data.user?.guest_bool,
});

// Convert and filter members
const convertMembers = (members: MemberData[]): Member[] =>
  members.map(transformMember).filter(({ userId }) => userId);

// POST /riderhq - Sync members from RiderHQ (API_KEY auth for cron jobs)
riderhqRouter.post("/", async (c) => {
  const authHeader = c.req.header("Authorization");
  const apiKey = env("API_KEY");

  if (authHeader !== `Bearer ${apiKey}`) {
    return c.json({ success: false, message: "Unauthorized" }, 401);
  }

  const riderhqUrl = env("RIDERHQ_URL");
  const accountId = env("RIDERHQ_ACCOUNT_ID");
  const privateKey = env("RIDERHQ_PRIVATE_KEY");

  const Authorization = `Basic ${Buffer.from(
    `${accountId}:${privateKey}`,
    "utf8",
  ).toString("base64")}`;

  // Fetch members from RiderHQ API
  const fetchMembers = async (
    startAfter?: string,
  ): Promise<MembersResponse> => {
    let query = `${riderhqUrl}/api/v2/groups/grp_2ohch80/members?sort=lastname_txt,firstnames_txt`;
    if (startAfter) {
      query += `&starting_after_id=${startAfter}`;
    }

    const response = await fetch(query, {
      headers: { Authorization },
    });
    return response.json() as Promise<MembersResponse>;
  };

  // Fetch all members with pagination
  const fetchAllMembers = async (
    members: Member[] = [],
    startAfter?: string,
  ): Promise<Member[]> => {
    const results = await fetchMembers(startAfter);
    const allMembers = [...members, ...convertMembers(results.data)];

    if (results.has_more_bool) {
      const lastMemberId = results.data[results.data.length - 1]?.id;
      return fetchAllMembers(allMembers, lastMemberId);
    }
    return allMembers;
  };

  // Resolve BCC club so memberships are scoped to it
  const bcc = await db.query.clubs.findFirst({
    where: eq(clubs.slug, BCC_SLUG),
  });
  if (!bcc) {
    return c.json(
      { success: false, message: "BCC club not found in database" },
      500,
    );
  }

  try {
    const members = await fetchAllMembers();

    if (members.length > 0) {
      // Truncate and refill BCC's memberships
      const rows = members.map((m) => ({ ...m, clubId: bcc.id }));
      await db.transaction(async (tx) => {
        await tx.delete(memberships).where(eq(memberships.clubId, bcc.id));
        // @ts-expect-error - drizzle's insert type is stricter than Member shape on optional fields
        await tx.insert(memberships).values(rows);
      });
    }

    return c.json({
      success: true,
      count: members.length,
    });
  } catch (error) {
    console.error("RiderHQ sync error:", error);
    return c.json({ success: false, error: "Failed to sync members" }, 500);
  }
});

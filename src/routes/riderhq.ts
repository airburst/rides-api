import { Hono } from "hono";
import { db } from "../db/index.js";
import { memberships } from "../db/schema/index.js";

export const riderhqRouter = new Hono();

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
  const apiKey = process.env.API_KEY;

  if (authHeader !== `Bearer ${apiKey}`) {
    return c.json({ success: false, message: "Unauthorized" }, 401);
  }

  const riderhqUrl = process.env.RIDERHQ_URL;
  const accountId = process.env.RIDERHQ_ACCOUNT_ID;
  const privateKey = process.env.RIDERHQ_PRIVATE_KEY;

  if (!riderhqUrl || !accountId || !privateKey) {
    return c.json(
      { success: false, message: "RiderHQ configuration missing" },
      500,
    );
  }

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
    return response.json() as unknown as MembersResponse;
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

  try {
    const members = await fetchAllMembers();

    if (members.length > 0) {
      // Truncate and refill table
      await db.transaction(async (tx) => {
        await tx.delete(memberships);
        // @ts-expect-error - type mismatch on optional fields
        await tx.insert(memberships).values(members);
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

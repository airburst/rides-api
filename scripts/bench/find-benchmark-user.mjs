import { Database } from "bun:sqlite";

const sqlitePath =
  process.env.SQLITE_DB_PATH ?? "./data/rides-candidate.sqlite";
const clubSlug = process.env.BENCH_CLUB_ID ?? "bcc";

const db = new Database(sqlitePath, { readonly: true });

try {
  const rows = db
    .query(
      `
      select
        u.email as email,
        u.is_super_admin as isSuperAdmin,
        uc.role as role,
        c.slug as clubSlug
      from users u
      join user_clubs uc on uc.user_id = u.id
      join clubs c on c.id = uc.club_id
      where c.slug = ?
      order by
        case when u.is_super_admin = 1 then 0 else 1 end,
        case uc.role when 'ADMIN' then 0 when 'LEADER' then 1 else 2 end,
        u.email asc
      limit 20
      `,
    )
    .all(clubSlug);

  if (rows.length === 0) {
    throw new Error(`No benchmark users found for club slug: ${clubSlug}`);
  }

  console.info(`Candidate benchmark users for club=${clubSlug}`);
  for (const row of rows) {
    console.info(
      `${row.email}  role=${row.role}  superAdmin=${String(row.isSuperAdmin === 1)}`,
    );
  }

  const preferred = rows[0];
  console.info("\nSuggested DEV_SKIP_AUTH_USER:");
  console.info(preferred.email);
} finally {
  db.close();
}

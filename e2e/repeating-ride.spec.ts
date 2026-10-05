import { expect, test, type APIRequestContext } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
import { apiUrl, databaseUrl, testPassword } from "./environment.js";

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
const runId = crypto.randomUUID();
const prefix = `Incident E2E ${runId}`;
const otherClubId = crypto.randomUUID();
const roles = ["USER", "LEADER", "ADMIN", "SUPERADMIN"] as const;
type TestRole = (typeof roles)[number];
let clubId: string;
const email = (role: TestRole) =>
  `${runId}-${role.toLowerCase()}@example.invalid`;
const headers = () => ({ "X-Club-Id": clubId });
const payload = (suffix: string) => ({
  name: `${prefix} ${suffix}`,
  schedule:
    "DTSTART:20261015T181500Z\nRRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TH;UNTIL=20270330T000000Z",
  winterStartTime: "18:15",
  rideGroup: "All",
  destination: "Bath Pizza Co - Green Park Station",
  distance: 25,
  meetPoint: "Cadence, Chelsea Road",
  route:
    "https://ridewithgps.com/clubs/3960-bath-cycling-club/routes?name=hills",
  rideLimit: -1,
});

async function login(request: APIRequestContext, role: TestRole) {
  const response = await request.post(`${apiUrl}/api/auth/sign-in/email`, {
    data: { email: email(role), password: testPassword },
  });
  expect(response.status(), await response.text()).toBe(200);
}

async function createTemplate(request: APIRequestContext, suffix: string) {
  const response = await request.post(`${apiUrl}/repeating-rides`, {
    headers: headers(),
    data: payload(suffix),
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).id as string;
}

test.beforeAll(async () => {
  const password = await hashPassword(testPassword);
  await sql.begin(async (tx) => {
    const [club] = await tx`select id from clubs where slug = 'bcc'`;
    if (!club)
      throw new Error(
        "Run migrations against the local incident database first",
      );
    clubId = club.id;
    await tx`insert into clubs (id, slug, name) values (${otherClubId}, ${runId.slice(0, 20)}, 'Other E2E club')`;
    for (const role of roles) {
      const userId = `${runId}-${role}`;
      await tx`insert into users (id, email, name, mobile, emergency, email_verified, is_super_admin) values (${userId}, ${email(role)}, ${`E2E ${role}`}, '07000000000', 'Test contact 07000000001', true, ${role === "SUPERADMIN"})`;
      await tx`insert into accounts (id, account_id, provider_id, user_id, password) values (${crypto.randomUUID()}, ${userId}, 'credential', ${userId}, ${password})`;
      await tx`insert into user_clubs (user_id, club_id, role) values (${userId}, ${clubId}, ${role === "SUPERADMIN" ? "ADMIN" : role})`;
    }
  });
});

test.afterAll(async () => {
  await sql.begin(async (tx) => {
    await tx`delete from rides where club_id in (${clubId}, ${otherClubId}) and name like ${`${prefix}%`}`;
    await tx`delete from repeating_rides where club_id in (${clubId}, ${otherClubId}) and name like ${`${prefix}%`}`;
    await tx`delete from users where id in ${tx(roles.map((role) => `${runId}-${role}`))}`;
    await tx`delete from clubs where id = ${otherClubId}`;
  });
  await sql.end();
});

test("club admin generates real instances, concurrent retries are idempotent, deleted occurrences stay deleted", async ({
  request,
}) => {
  await login(request, "ADMIN");
  const id = await createTemplate(request, "API");
  const endpoint = `${apiUrl}/repeating-rides/${id}/generate`;
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      request.post(endpoint, {
        headers: headers(),
        data: { date: "2026-10-15" },
      }),
    ),
  );
  let total = 0;
  for (const response of responses) {
    expect(response.status(), await response.text()).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
    total += result.results[0].count;
  }
  expect(total).toBe(7);
  const instances =
    await sql`select * from rides where club_id = ${clubId} and schedule_id = ${id} order by ride_date`;
  expect(instances).toHaveLength(7);
  expect(
    new Set(instances.map((ride) => new Date(ride.ride_date).toISOString()))
      .size,
  ).toBe(7);
  for (const ride of instances) {
    expect(ride.name).toBe(payload("API").name);
    expect(ride.distance).toBe(25);
    expect(ride.ride_limit).toBe(-1);
    expect(ride.schedule_id).toBe(id);
    expect(ride.club_id).toBe(clubId);
    expect(ride).not.toHaveProperty("schedule");
    expect(new Date(ride.ride_date).getUTCDay()).toBe(4);
    expect(new Date(ride.ride_date).getUTCHours()).toBe(18);
    expect(new Date(ride.ride_date).getUTCMinutes()).toBe(15);
  }
  const removed = await request.delete(`${apiUrl}/rides/${instances[0].id}`, {
    headers: headers(),
  });
  expect(removed.status()).toBe(200);
  const retried = await request.post(endpoint, {
    headers: headers(),
    data: { date: "2026-10-15" },
  });
  expect((await retried.json()).results[0].count).toBe(0);
  const [counts] =
    await sql`select count(*) as total, count(*) filter (where deleted) as deleted from rides where club_id = ${clubId} and schedule_id = ${id}`;
  expect(Number(counts.total)).toBe(7);
  expect(Number(counts.deleted)).toBe(1);
});

test("authorization, club isolation, malformed requests, and global generation restrictions", async ({
  playwright,
}) => {
  const admin = await playwright.request.newContext();
  await login(admin, "ADMIN");
  const id = await createTemplate(admin, "authorization");
  const endpoint = `${apiUrl}/repeating-rides/${id}/generate`;
  for (const role of [null, ...roles] as const) {
    const client = await playwright.request.newContext();
    if (role) await login(client, role);
    const response = await client.post(endpoint, {
      headers: headers(),
      data: { date: "2026-10-15" },
    });
    expect(response.status()).toBe(
      role === null
        ? 401
        : role === "ADMIN" || role === "SUPERADMIN"
          ? 200
          : 403,
    );
    await client.dispose();
  }
  for (const data of [
    {},
    { date: "invalid" },
    { date: "2026-02-30" },
    { date: "2026-10-15", scheduleId: id },
  ]) {
    expect(
      (await admin.post(endpoint, { headers: headers(), data })).status(),
    ).toBe(400);
  }
  expect(
    (await admin.post(endpoint, { headers: headers(), data: "{" })).status(),
  ).toBe(400);
  expect(
    (
      await admin.post(
        `${apiUrl}/repeating-rides/${crypto.randomUUID()}/generate`,
        { headers: headers(), data: { date: "2026-10-15" } },
      )
    ).status(),
  ).toBe(404);
  await sql`insert into repeating_rides (id, club_id, name, schedule) values (${`${runId}-foreign`}, ${otherClubId}, ${`${prefix} foreign`}, ${payload("foreign").schedule})`;
  expect(
    (
      await admin.post(`${apiUrl}/repeating-rides/${runId}-foreign/generate`, {
        headers: headers(),
        data: { date: "2026-10-15" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await admin.post(endpoint, {
        headers: { "X-Club-Id": otherClubId },
        data: { date: "2026-10-15" },
      })
    ).status(),
  ).toBe(403);
  const global = await admin.post(`${apiUrl}/generate`, {
    data: { scheduleId: id, date: "2026-10-15" },
  });
  expect([401, 403]).toContain(global.status());
  const [foreign] =
    await sql`select count(*) from rides where club_id = ${otherClubId} and deleted = false`;
  expect(Number(foreign.count)).toBe(0);
  await admin.dispose();
});

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`browser retry keeps one template at ${viewport.width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00Z"));
    await login(context.request, "ADMIN");
    let creations = 0;
    let generations = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/repeating-rides"
      )
        creations++;
    });
    await page.route("**/repeating-rides/*/generate", async (route) => {
      generations++;
      if (generations === 1) {
        await route.fulfill({
          status: viewport.width === 390 ? 200 : 500,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: "Injected generation failure",
          }),
        });
      } else {
        await route.continue();
      }
    });
    await page.goto("/ride/new");
    const name = `${prefix} browser-${viewport.width}`;
    await page.getByLabel("Ride name *", { exact: true }).fill(name);
    await page.getByLabel("Date *", { exact: true }).fill("2026-10-15");
    await page.getByLabel("Start time *", { exact: true }).fill("18:15");
    await page.getByLabel("Distance", { exact: false }).fill("25");
    await page.getByLabel("Toggle repeating").check();
    await page.locator("#freq").selectOption("2");
    await page.locator("#byweekday").selectOption("3");
    await page.getByLabel("End Date (optional)").fill("2027-03-30");
    await page.getByRole("button", { name: "SAVE", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page
      .locator("form")
      .evaluate((form) => (form as HTMLFormElement).requestSubmit());
    await dialog.getByRole("button", { name: "YES", exact: true }).click();
    await expect(
      page.getByText(
        "Schedule saved, but rides were not added: Injected generation failure",
      ),
    ).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(
      page.getByLabel("Ride name *", { exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: test.info().outputPath(`retry-${viewport.width}.png`),
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "YES", exact: true }).click();
    await expect(page).toHaveURL("/");
    expect(creations).toBe(1);
    expect(generations).toBe(2);
    const templates =
      await sql`select id from repeating_rides where club_id = ${clubId} and name = ${name}`;
    expect(templates).toHaveLength(1);
    const instances =
      await sql`select id from rides where club_id = ${clubId} and schedule_id = ${templates[0].id} and deleted = false`;
    expect(instances).toHaveLength(7);
  });
}

test("declining generation retains one template and creates no instances", async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-05T12:00:00Z"));
  await login(context.request, "ADMIN");
  await page.goto("/ride/new");
  const name = `${prefix} decline`;
  await page.getByLabel("Ride name *", { exact: true }).fill(name);
  await page.getByLabel("Date *", { exact: true }).fill("2026-10-15");
  await page.getByLabel("Distance", { exact: false }).fill("25");
  await page.getByLabel("Toggle repeating").check();
  await page.getByRole("button", { name: "SAVE", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "NO", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  const templates =
    await sql`select id from repeating_rides where club_id = ${clubId} and name = ${name}`;
  expect(templates).toHaveLength(1);
  const instances =
    await sql`select id from rides where club_id = ${clubId} and schedule_id = ${templates[0].id} and deleted = false`;
  expect(instances).toHaveLength(0);
});

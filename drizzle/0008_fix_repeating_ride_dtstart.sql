UPDATE "bcc_repeating_rides"
SET "schedule" = regexp_replace("schedule", 'DTSTART:2099', 'DTSTART:2026')
WHERE "schedule" LIKE 'DTSTART:2099%';
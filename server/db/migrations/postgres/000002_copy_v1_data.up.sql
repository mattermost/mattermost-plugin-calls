-- One-time copy of v1 data into the v2 tables. Runs once per database (morph
-- records it in db_migrations_calls_v2 and locks across HA nodes). Only columns
-- present in plain v1 are listed, so this also works where v2 previously ran on
-- the shared tables. Not copied: calls_sessions (live calls only) and
-- calls_jobs (not read by audit).
DO $$
BEGIN
    IF to_regclass('calls_channels') IS NOT NULL THEN
        INSERT INTO calls_v2_channels (channelid, enabled, props)
        SELECT channelid, enabled, props FROM calls_channels
        ON CONFLICT (channelid) DO NOTHING;
    END IF;

    IF to_regclass('calls') IS NOT NULL THEN
        INSERT INTO calls_v2_calls (id, channelid, startat, endat, createat, deleteat, title, postid, threadid, ownerid, participants, stats, props)
        SELECT id, channelid, startat, endat, createat, deleteat, title, postid, threadid, ownerid, participants, stats, props
        FROM calls WHERE endat > 0
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

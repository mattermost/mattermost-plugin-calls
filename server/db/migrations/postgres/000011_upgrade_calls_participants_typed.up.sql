-- Upgrade a pre-typed calls_participants table (callid, userid) to the typed
-- identity schema (callid, identitytype, identity). This only fires on an
-- environment that applied an earlier build of this feature, where 000008
-- created the user-only table. On a fresh install 000008 already created the
-- typed table, so the userid column is absent and this is a no-op.
--
-- Every pre-existing row was a Mattermost user, so identitytype defaults to
-- 'user', and the old (callid, userid) uniqueness guarantees the new
-- (callid, 'user', identity) primary key stays unique. No data is lost.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'calls_participants' AND column_name = 'userid'
    ) THEN
        ALTER TABLE calls_participants ADD COLUMN IF NOT EXISTS identitytype VARCHAR(16) NOT NULL DEFAULT 'user';
        ALTER TABLE calls_participants ALTER COLUMN userid TYPE VARCHAR(255);
        ALTER TABLE calls_participants RENAME COLUMN userid TO identity;
        ALTER TABLE calls_participants DROP CONSTRAINT IF EXISTS calls_participants_pkey;
        ALTER TABLE calls_participants ADD PRIMARY KEY (callid, identitytype, identity);
        -- The typed 000008 create carries no secondary index; drop the stale one
        -- so upgraded and fresh installs converge on the same schema.
        DROP INDEX IF EXISTS idx_calls_participants_callid;
    END IF;
END $$;

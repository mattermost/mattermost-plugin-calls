CREATE TABLE IF NOT EXISTS calls_guest_sessions (
    id VARCHAR(26) PRIMARY KEY,
    linkid VARCHAR(26) NOT NULL,
    type VARCHAR(8) NOT NULL,
    channelid VARCHAR(26) NOT NULL,
    displayname VARCHAR(64) NOT NULL DEFAULT '',
    createat bigint NOT NULL,
    endat bigint NOT NULL DEFAULT 0,
    ipaddress VARCHAR(45) NOT NULL DEFAULT '',
    callernumber VARCHAR(32),
    props jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_calls_guest_sessions_link_id ON calls_guest_sessions (linkid);
CREATE INDEX IF NOT EXISTS idx_calls_guest_sessions_channel_id ON calls_guest_sessions (channelid);
CREATE INDEX IF NOT EXISTS idx_calls_guest_sessions_type ON calls_guest_sessions (type);

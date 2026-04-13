CREATE TABLE IF NOT EXISTS calls_guest_links (
    id VARCHAR(26) PRIMARY KEY,
    channelid VARCHAR(26) NOT NULL,
    type VARCHAR(8) NOT NULL,
    createdby VARCHAR(26) NOT NULL,
    createat bigint NOT NULL,
    deleteat bigint NOT NULL DEFAULT 0,
    expiresat bigint NOT NULL DEFAULT 0,
    maxuses int NOT NULL DEFAULT 0,
    usecount int NOT NULL DEFAULT 0,
    secret VARCHAR(64) NOT NULL,
    trunkid VARCHAR(64),
    dispatchruleid VARCHAR(64),
    props jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_calls_guest_links_channel_id ON calls_guest_links (channelid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_guest_links_secret ON calls_guest_links (secret);
CREATE INDEX IF NOT EXISTS idx_calls_guest_links_type ON calls_guest_links (type);

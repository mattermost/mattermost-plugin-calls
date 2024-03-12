CREATE TABLE IF NOT EXISTS calls (
    id VARCHAR(26) PRIMARY KEY,
    channelid VARCHAR(26),
    startat bigint,
    endat bigint,
    createat bigint,
    deleteat bigint,
    title VARCHAR(256),
    postid VARCHAR(26),
    threadid VARCHAR(26),
    ownerid VARCHAR(26),
    participants jsonb,
    stats jsonb,
    props jsonb
);

CREATE INDEX IF NOT EXISTS idx_calls_channel_id ON calls (channelid);

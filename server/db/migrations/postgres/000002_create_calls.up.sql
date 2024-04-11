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
    participants jsonb NOT NULL,
    stats jsonb NOT NULL,
    props jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calls_channel_id ON calls (channelid);

CREATE INDEX IF NOT EXISTS idx_calls_end_at ON calls (endat);

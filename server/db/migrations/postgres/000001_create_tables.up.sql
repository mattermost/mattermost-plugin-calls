CREATE TABLE IF NOT EXISTS calls_v2_channels (
    channelid VARCHAR(26) PRIMARY KEY,
    enabled boolean,
    props jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS calls_v2_calls (
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

CREATE INDEX IF NOT EXISTS idx_calls_v2_calls_channel_id ON calls_v2_calls (channelid);
CREATE INDEX IF NOT EXISTS idx_calls_v2_calls_end_at ON calls_v2_calls (endat);
-- Supports the /call audit report's server-wide query, which filters and orders
-- by StartAt without a channel predicate (admin --scope all).
CREATE INDEX IF NOT EXISTS idx_calls_v2_calls_start_at ON calls_v2_calls (startat);

CREATE TABLE IF NOT EXISTS calls_v2_sessions (
    id VARCHAR(26) PRIMARY KEY,
    callid VARCHAR(26),
    userid VARCHAR(26),
    joinat bigint,
    issipparticipant boolean DEFAULT FALSE,
    confirmedat bigint NOT NULL DEFAULT 0,
    sid VARCHAR(64) NOT NULL DEFAULT '',
    authsessionid VARCHAR(26) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_calls_v2_sessions_call_id ON calls_v2_sessions (callid);

CREATE TABLE IF NOT EXISTS calls_v2_jobs (
    id VARCHAR(26) PRIMARY KEY,
    callid VARCHAR(26),
    type VARCHAR(64),
    creatorid VARCHAR(26),
    initat bigint,
    startat bigint,
    endat bigint,
    props jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calls_v2_jobs_call_id ON calls_v2_jobs (callid);

CREATE TABLE IF NOT EXISTS calls_v2_participants (
    callid       VARCHAR(26) NOT NULL,
    identitytype VARCHAR(16) NOT NULL DEFAULT 'user',
    identity     VARCHAR(255) NOT NULL,
    firstjoinat  bigint NOT NULL,
    lastleaveat  bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (callid, identitytype, identity)
);

CREATE TABLE IF NOT EXISTS calls_v2_screen_shares (
    callid    VARCHAR(26) NOT NULL,
    userid    VARCHAR(26) NOT NULL,
    sessionid VARCHAR(26) NOT NULL,
    startat   bigint NOT NULL,
    stopat    bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (callid, sessionid, startat)
);

CREATE INDEX IF NOT EXISTS idx_calls_v2_screen_shares_callid ON calls_v2_screen_shares (callid);

CREATE TABLE IF NOT EXISTS calls_screen_shares (
    callid    VARCHAR(26) NOT NULL,
    userid    VARCHAR(26) NOT NULL,
    sessionid VARCHAR(26) NOT NULL,
    startat   bigint NOT NULL,
    stopat    bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (callid, sessionid, startat)
);

CREATE INDEX IF NOT EXISTS idx_calls_screen_shares_callid ON calls_screen_shares (callid);

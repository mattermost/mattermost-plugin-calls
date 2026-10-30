CREATE TABLE IF NOT EXISTS calls_participants (
    callid      VARCHAR(26) NOT NULL,
    userid      VARCHAR(26) NOT NULL,
    firstjoinat bigint NOT NULL,
    lastleaveat bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (callid, userid)
);

CREATE INDEX IF NOT EXISTS idx_calls_participants_callid ON calls_participants (callid);

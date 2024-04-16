CREATE TABLE IF NOT EXISTS calls_sessions (
    id VARCHAR(26) PRIMARY KEY,
    callid VARCHAR(26),
    userid VARCHAR(26),
    joinat bigint,
    unmuted  boolean,
    raisedhand bigint
);

CREATE INDEX IF NOT EXISTS idx_calls_sessions_call_id ON calls_sessions (callid);

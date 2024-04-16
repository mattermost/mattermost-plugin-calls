CREATE TABLE IF NOT EXISTS calls_jobs (
    id VARCHAR(26) PRIMARY KEY,
    callid VARCHAR(26),
    type VARCHAR(64),
    creatorid VARCHAR(26),
    initat bigint,
    startat bigint,
    endat bigint,
    props jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calls_jobs_call_id ON calls_jobs (callid);

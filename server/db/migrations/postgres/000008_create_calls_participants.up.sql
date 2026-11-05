CREATE TABLE IF NOT EXISTS calls_participants (
    callid       VARCHAR(26) NOT NULL,
    identitytype VARCHAR(16) NOT NULL DEFAULT 'user',
    identity     VARCHAR(255) NOT NULL,
    firstjoinat  bigint NOT NULL,
    lastleaveat  bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (callid, identitytype, identity)
);

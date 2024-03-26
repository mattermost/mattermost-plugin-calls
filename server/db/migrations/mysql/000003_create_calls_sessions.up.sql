CREATE TABLE IF NOT EXISTS calls_sessions (
    ID VARCHAR(26) PRIMARY KEY,
    CallID VARCHAR(26),
    UserID VARCHAR(26),
    JoinAt BIGINT,
    Unmuted BOOLEAN,
    RaisedHand BIGINT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_sessions'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_sessions_call_id'
    ) > 0,
    'SELECT 1',
    'CREATE INDEX idx_calls_sessions_call_id ON calls_sessions(CallID);'
));

PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

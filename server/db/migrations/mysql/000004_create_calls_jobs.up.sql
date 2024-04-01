CREATE TABLE IF NOT EXISTS calls_jobs (
    ID VARCHAR(26) PRIMARY KEY,
    CallID VARCHAR(26),
    Type VARCHAR(64),
    CreatorID VARCHAR(26),
    InitAt BIGINT,
    StartAt BIGINT,
    EndAt BIGINT,
    Props JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_jobs'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_jobs_call_id'
    ) > 0,
    'SELECT 1',
    'CREATE INDEX idx_calls_jobs_call_id ON calls_jobs(CallID);'
));

PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

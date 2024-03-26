CREATE TABLE IF NOT EXISTS calls (
    ID VARCHAR(26) PRIMARY KEY,
    ChannelID VARCHAR(26),
    StartAt BIGINT,
    EndAt BIGINT,
    CreateAt BIGINT,
    DeleteAt BIGINT,
    Title VARCHAR(256),
    PostID VARCHAR(26),
    ThreadID VARCHAR(26),
    OwnerID VARCHAR(26),
    Participants JSON,
    Stats JSON,
    Props JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_channel_id'
    ) > 0,
    'SELECT 1',
    'CREATE INDEX idx_calls_channel_id ON calls(ChannelID);'
));

PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

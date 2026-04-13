CREATE TABLE IF NOT EXISTS calls_guest_sessions (
    ID VARCHAR(26) PRIMARY KEY,
    LinkID VARCHAR(26) NOT NULL,
    Type VARCHAR(8) NOT NULL,
    ChannelID VARCHAR(26) NOT NULL,
    DisplayName VARCHAR(64) NOT NULL DEFAULT '',
    CreateAt BIGINT NOT NULL,
    EndAt BIGINT NOT NULL DEFAULT 0,
    IPAddress VARCHAR(45) NOT NULL DEFAULT '',
    CallerNumber VARCHAR(32),
    Props JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_guest_sessions'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_guest_sessions_link_id'
    ) > 0,
    'SELECT 1',
    'CREATE INDEX idx_calls_guest_sessions_link_id ON calls_guest_sessions(LinkID);'
));

PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_guest_sessions'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_guest_sessions_channel_id'
    ) > 0,
    'SELECT 1',
    'CREATE INDEX idx_calls_guest_sessions_channel_id ON calls_guest_sessions(ChannelID);'
));

PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_guest_sessions'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_guest_sessions_type'
    ) > 0,
    'SELECT 1',
    'CREATE INDEX idx_calls_guest_sessions_type ON calls_guest_sessions(Type);'
));

PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

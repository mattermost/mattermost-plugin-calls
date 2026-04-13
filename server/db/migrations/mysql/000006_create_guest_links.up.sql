CREATE TABLE IF NOT EXISTS calls_guest_links (
    ID VARCHAR(26) PRIMARY KEY,
    ChannelID VARCHAR(26) NOT NULL,
    Type VARCHAR(8) NOT NULL,
    CreatedBy VARCHAR(26) NOT NULL,
    CreateAt BIGINT NOT NULL,
    DeleteAt BIGINT NOT NULL DEFAULT 0,
    ExpiresAt BIGINT NOT NULL DEFAULT 0,
    MaxUses INT NOT NULL DEFAULT 0,
    UseCount INT NOT NULL DEFAULT 0,
    Secret VARCHAR(64) NOT NULL,
    TrunkID VARCHAR(64),
    DispatchRuleID VARCHAR(64),
    Props JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_guest_links'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_guest_links_channel_id'
    ) > 0,
    'SELECT 1',
    'CREATE INDEX idx_calls_guest_links_channel_id ON calls_guest_links(ChannelID);'
));

PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_guest_links'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_guest_links_secret'
    ) > 0,
    'SELECT 1',
    'CREATE UNIQUE INDEX idx_calls_guest_links_secret ON calls_guest_links(Secret);'
));

PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_guest_links'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_guest_links_type'
    ) > 0,
    'SELECT 1',
    'CREATE INDEX idx_calls_guest_links_type ON calls_guest_links(Type);'
));

PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

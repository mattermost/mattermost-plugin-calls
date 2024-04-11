SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_channel_id'
    ) > 0,
    'DROP INDEX idx_calls_channel_id ON calls;',
    'SELECT 1'
));

PREPARE removeIndexIfExists FROM @preparedStatement;
EXECUTE removeIndexIfExists;
DEALLOCATE PREPARE removeIndexIfExists;

SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_end_at'
    ) > 0,
    'DROP INDEX idx_calls_end_at ON calls;',
    'SELECT 1'
));

PREPARE removeIndexIfExists FROM @preparedStatement;
EXECUTE removeIndexIfExists;
DEALLOCATE PREPARE removeIndexIfExists;

DROP TABLE IF EXISTS calls;

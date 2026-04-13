SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_guest_sessions'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_guest_sessions_type'
    ) > 0,
    'DROP INDEX idx_calls_guest_sessions_type ON calls_guest_sessions;',
    'SELECT 1'
));

PREPARE removeIndexIfExists FROM @preparedStatement;
EXECUTE removeIndexIfExists;
DEALLOCATE PREPARE removeIndexIfExists;

SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_guest_sessions'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_guest_sessions_channel_id'
    ) > 0,
    'DROP INDEX idx_calls_guest_sessions_channel_id ON calls_guest_sessions;',
    'SELECT 1'
));

PREPARE removeIndexIfExists FROM @preparedStatement;
EXECUTE removeIndexIfExists;
DEALLOCATE PREPARE removeIndexIfExists;

SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_guest_sessions'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_guest_sessions_link_id'
    ) > 0,
    'DROP INDEX idx_calls_guest_sessions_link_id ON calls_guest_sessions;',
    'SELECT 1'
));

PREPARE removeIndexIfExists FROM @preparedStatement;
EXECUTE removeIndexIfExists;
DEALLOCATE PREPARE removeIndexIfExists;

DROP TABLE IF EXISTS calls_guest_sessions;

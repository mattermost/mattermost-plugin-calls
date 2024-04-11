SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_sessions'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_sessions_call_id'
    ) > 0,
    'DROP INDEX idx_calls_sessions_call_id ON calls_sessions;',
    'SELECT 1'
));

PREPARE removeIndexIfExists FROM @preparedStatement;
EXECUTE removeIndexIfExists;
DEALLOCATE PREPARE removeIndexIfExists;

DROP TABLE IF EXISTS calls_sessions;

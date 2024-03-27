SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_jobs'
        AND table_schema = DATABASE()
        AND index_name = 'idx_calls_jobs_call_id'
    ) > 0,
    'DROP INDEX idx_calls_jobs_call_id ON calls_jobs;',
    'SELECT 1'
));

PREPARE removeIndexIfExists FROM @preparedStatement;
EXECUTE removeIndexIfExists;
DEALLOCATE PREPARE removeIndexIfExists;

DROP TABLE IF EXISTS calls_jobs;

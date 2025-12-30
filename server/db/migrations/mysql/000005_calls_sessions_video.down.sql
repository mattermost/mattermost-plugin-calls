SET @preparedStatement = (SELECT IF(
    EXISTS(
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE table_name = 'calls_sessions'
        AND table_schema = DATABASE()
        AND column_name = 'Video'
    ),
    'ALTER TABLE calls_sessions DROP COLUMN Video;',
    'SELECT 1;'
));

PREPARE removeColumnIfExists FROM @preparedStatement;
EXECUTE removeColumnIfExists;
DEALLOCATE PREPARE removeColumnIfExists;

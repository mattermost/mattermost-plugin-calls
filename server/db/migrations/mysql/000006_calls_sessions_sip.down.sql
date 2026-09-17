SET @preparedStatement = (SELECT IF(
    EXISTS(
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE table_name = 'calls_sessions'
        AND table_schema = DATABASE()
        AND column_name = 'IsSIPParticipant'
    ),
    'ALTER TABLE calls_sessions DROP COLUMN IsSIPParticipant;',
    'SELECT 1;'
));

PREPARE dropColumnIfExists FROM @preparedStatement;
EXECUTE dropColumnIfExists;
DEALLOCATE PREPARE dropColumnIfExists;

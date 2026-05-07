SET @preparedStatement = (SELECT IF(
    NOT EXISTS(
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE table_name = 'calls_sessions'
        AND table_schema = DATABASE()
        AND column_name = 'IsSIPParticipant'
    ),
    'ALTER TABLE calls_sessions ADD COLUMN IsSIPParticipant BOOLEAN NOT NULL DEFAULT FALSE;',
    'SELECT 1;'
));

PREPARE addColumnIfNotExists FROM @preparedStatement;
EXECUTE addColumnIfNotExists;
DEALLOCATE PREPARE addColumnIfNotExists;

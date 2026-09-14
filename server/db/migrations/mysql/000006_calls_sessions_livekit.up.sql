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

SET @preparedStatement = (SELECT IF(
    NOT EXISTS(
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE table_name = 'calls_sessions'
        AND table_schema = DATABASE()
        AND column_name = 'ConfirmedAt'
    ),
    'ALTER TABLE calls_sessions ADD COLUMN ConfirmedAt BIGINT NOT NULL DEFAULT 0;',
    'SELECT 1;'
));

PREPARE addColumnIfNotExists FROM @preparedStatement;
EXECUTE addColumnIfNotExists;
DEALLOCATE PREPARE addColumnIfNotExists;

SET @preparedStatement = (SELECT IF(
    NOT EXISTS(
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE table_name = 'calls_sessions'
        AND table_schema = DATABASE()
        AND column_name = 'SID'
    ),
    'ALTER TABLE calls_sessions ADD COLUMN SID VARCHAR(64) NOT NULL DEFAULT '''';',
    'SELECT 1;'
));

PREPARE addColumnIfNotExists FROM @preparedStatement;
EXECUTE addColumnIfNotExists;
DEALLOCATE PREPARE addColumnIfNotExists;

SET @preparedStatement = (SELECT IF(
    NOT EXISTS(
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE table_name = 'calls_sessions'
        AND table_schema = DATABASE()
        AND column_name = 'AuthSessionID'
    ),
    'ALTER TABLE calls_sessions ADD COLUMN AuthSessionID VARCHAR(26) NOT NULL DEFAULT '''';',
    'SELECT 1;'
));

PREPARE addColumnIfNotExists FROM @preparedStatement;
EXECUTE addColumnIfNotExists;
DEALLOCATE PREPARE addColumnIfNotExists;

CREATE TABLE IF NOT EXISTS calls_channels (
    ChannelID varchar(26) NOT NULL,
    Enabled BOOLEAN,
		Props JSON,
    PRIMARY KEY (ChannelId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE PROCEDURE migrate_calls_channels ()
BEGIN DECLARE
	calls_channels_count INT;
	SELECT
		COUNT(*)
	FROM
		calls_channels INTO calls_channels_count;
	IF(calls_channels_count = 0) THEN
		INSERT INTO calls_channels (ChannelId, Enabled)
		SELECT
			PKey, JSON_EXTRACT(CONVERT(PValue using utf8mb4), "$.enabled") = true 
		FROM
			PluginKeyValueStore
		WHERE
			PluginId = 'com.mattermost.calls'
		AND
			LENGTH(PKey) = 26
		AND
			JSON_TYPE(JSON_EXTRACT(CONVERT(PValue using utf8mb4), "$.enabled")) != 'NULL';
	END IF;
END;

CALL migrate_calls_channels();

DROP PROCEDURE IF EXISTS migrate_calls_channels;


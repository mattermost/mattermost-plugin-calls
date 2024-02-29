CREATE TABLE IF NOT EXISTS CallsChannels (
    ChannelId varchar(26) NOT NULL,
    Enabled BOOLEAN,
		Props JSON,
    PRIMARY KEY (ChannelId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE PROCEDURE MigrateCallsChannels ()
BEGIN DECLARE
	CallsChannels_Count INT;
	SELECT
		COUNT(*)
	FROM
		CallsChannels INTO CallsChannels_Count;
	IF(CallsChannels_Count = 0) THEN
		INSERT INTO CallsChannels (ChannelId, Enabled)
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

CALL MigrateCallsChannels();

DROP PROCEDURE IF EXISTS MigrateCallsChannels;


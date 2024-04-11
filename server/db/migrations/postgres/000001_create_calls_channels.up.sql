CREATE TABLE IF NOT EXISTS calls_channels (
    channelid VARCHAR(26) PRIMARY KEY,
    enabled boolean,
    props jsonb NOT NULL
);

DO $$
<<migrate_calls_channels>>
BEGIN
    INSERT INTO
        calls_channels(channelid, enabled, props)
    SELECT
        pkey, (encode(pvalue, 'escape')::json->>'enabled')::boolean, 'null'
    FROM
        pluginkeyvaluestore
    WHERE
        pluginid = 'com.mattermost.calls'
    AND
        LENGTH(pkey) = 26
    AND
        encode(pvalue, 'escape')::json->>'enabled' IS NOT NULL;
END migrate_calls_channels $$;


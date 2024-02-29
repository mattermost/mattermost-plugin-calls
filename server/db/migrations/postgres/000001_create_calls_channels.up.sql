CREATE TABLE IF NOT EXISTS callschannels (
    channelid VARCHAR(26) PRIMARY KEY,
    enabled boolean,
    props jsonb
);

DO $$
<<migrate_calls_channels>>
BEGIN
    INSERT INTO
        callschannels(channelid, enabled)
    SELECT
        pkey, (encode(pvalue, 'escape')::json->>'enabled')::boolean
    FROM
        pluginkeyvaluestore
    WHERE
        pluginid = 'com.mattermost.calls'
    AND
        LENGTH(pkey) = 26
    AND
        encode(pvalue, 'escape')::json->>'enabled' IS NOT NULL;
END migrate_calls_channels $$;


-- Supports the /call audit report's server-wide query, which filters and orders
-- by StartAt without a channel predicate (admin --scope all).
CREATE INDEX IF NOT EXISTS idx_calls_start_at ON calls (startat);

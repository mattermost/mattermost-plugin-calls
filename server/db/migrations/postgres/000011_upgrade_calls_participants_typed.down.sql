-- No-op. The up migration only converts a legacy user-only table to the typed
-- schema; it never changes a fresh install (which 000008 already created typed).
-- Reversing the conversion is intentionally not attempted: it would drop phone
-- (non-user) rows, and on a fresh install there is no legacy shape to restore.
-- The typed table is dropped by 000008's own down migration when rolling back
-- past it.
SELECT 1;

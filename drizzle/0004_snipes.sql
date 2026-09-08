-- Snipes are decided in the same ledger as kills, so a row needs to say which
-- topic it came from. Existing rows are all kill decisions.
ALTER TABLE `groupme_seen` ADD `kind` text DEFAULT 'kill' NOT NULL;

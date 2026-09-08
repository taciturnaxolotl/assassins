-- Settings a person changes while the game runs. Deliberately not `dataset`:
-- the build empties that table every time it runs, and a switch somebody threw
-- should not come back on because the roster was rebuilt.
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`set_by` text,
	`set_at` integer NOT NULL,
	FOREIGN KEY (`set_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);

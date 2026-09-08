CREATE TABLE `groupme_seen` (
	`message_id` text PRIMARY KEY NOT NULL,
	`outcome` text NOT NULL,
	`decided_by` text,
	`decided_at` integer NOT NULL,
	FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);

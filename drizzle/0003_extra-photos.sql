CREATE TABLE `extra_photo` (
	`id` text PRIMARY KEY NOT NULL,
	`gm_id` text NOT NULL,
	`url` text NOT NULL,
	`source` text NOT NULL,
	`added_by` text,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);

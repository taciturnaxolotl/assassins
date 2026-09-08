CREATE TABLE `assignment` (
	`hunter_gm_id` text PRIMARY KEY NOT NULL,
	`victim_gm_id` text NOT NULL,
	`reported_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reported_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `bid` (
	`contract_id` text NOT NULL,
	`hitman_user_id` text NOT NULL,
	`hitman_gm_id` text,
	`ask` text NOT NULL,
	`pitch` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`contract_id`, `hitman_user_id`),
	FOREIGN KEY (`contract_id`) REFERENCES `contract`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hitman_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `claim` (
	`user_id` text PRIMARY KEY NOT NULL,
	`gm_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`pitch` text,
	`verdict` text,
	`decided_by` text,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contract` (
	`id` text PRIMARY KEY NOT NULL,
	`mark_gm_id` text NOT NULL,
	`poster_user_id` text NOT NULL,
	`poster_gm_id` text NOT NULL,
	`offer` text NOT NULL,
	`agreed` text,
	`held_by` text,
	`terms` text,
	`status` text DEFAULT 'open' NOT NULL,
	`taken_by_user_id` text,
	`taken_by_gm_id` text,
	`taken_at` integer,
	`poster_settled` integer DEFAULT false NOT NULL,
	`hitman_settled` integer DEFAULT false NOT NULL,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`poster_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`taken_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `dataset` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`built_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kill` (
	`victim_gm_id` text PRIMARY KEY NOT NULL,
	`killer_gm_id` text,
	`reported_by` text,
	`confirmed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reported_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `note` (
	`user_id` text NOT NULL,
	`gm_id` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `gm_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `player` (
	`gm_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatar` text,
	`photos` text NOT NULL,
	`matched` integer NOT NULL,
	`candidates` text,
	`student_id` text,
	`username` text,
	`legal_name` text,
	`class` text,
	`dorm` text,
	`room` text,
	`gender` text,
	`hometown` text,
	`directory_photo` text,
	`majors` text,
	`schedule` text
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`image` text,
	`username` text,
	`role` text DEFAULT 'player' NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`plan_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_google_sub_unique` ON `user` (`google_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
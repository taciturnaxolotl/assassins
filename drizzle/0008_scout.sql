-- Promote a player to see their own target's whole file, short of admin.
ALTER TABLE `user` ADD `scout` integer DEFAULT false NOT NULL;

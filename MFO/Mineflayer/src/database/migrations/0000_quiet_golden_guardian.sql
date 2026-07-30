CREATE TABLE `manager_status` (
	`id` integer PRIMARY KEY NOT NULL,
	`connected` integer NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`username` text NOT NULL,
	`last_connected_at` integer,
	`last_disconnected_at` integer,
	`last_disconnect_reason` text,
	`updated_at` integer NOT NULL
);

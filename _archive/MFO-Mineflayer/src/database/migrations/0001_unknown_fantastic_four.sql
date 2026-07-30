CREATE TABLE `alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` text,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`state` text NOT NULL,
	`message` text NOT NULL,
	`opened_at` integer NOT NULL,
	`acknowledged_at` integer,
	`resolved_at` integer,
	`screenshot_path` text
);
--> statement-breakpoint
CREATE INDEX `alerts_farm_id_idx` ON `alerts` (`farm_id`);--> statement-breakpoint
CREATE INDEX `alerts_state_idx` ON `alerts` (`state`);--> statement-breakpoint
CREATE TABLE `container_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` text NOT NULL,
	`container_type` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`z` integer NOT NULL,
	`capacity` integer NOT NULL,
	`occupied_slots` integer NOT NULL,
	`fill_percent` real NOT NULL,
	`total_item_count` integer NOT NULL,
	`items_json` text NOT NULL,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `container_snapshots_farm_id_idx` ON `container_snapshots` (`farm_id`);--> statement-breakpoint
CREATE INDEX `container_snapshots_occurred_at_idx` ON `container_snapshots` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`name` text NOT NULL,
	`custom_name` text,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`z` real NOT NULL,
	`expected` integer NOT NULL,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entities_farm_id_idx` ON `entities` (`farm_id`);--> statement-breakpoint
CREATE INDEX `entities_occurred_at_idx` ON `entities` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `health` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `health_farm_id_idx` ON `health` (`farm_id`);--> statement-breakpoint
CREATE INDEX `health_occurred_at_idx` ON `health` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `production` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` text NOT NULL,
	`delta_items` integer NOT NULL,
	`window_ms` integer NOT NULL,
	`items_per_minute` real NOT NULL,
	`items_per_hour` real NOT NULL,
	`rolling_average_items_per_hour` real NOT NULL,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `production_farm_id_idx` ON `production` (`farm_id`);--> statement-breakpoint
CREATE INDEX `production_occurred_at_idx` ON `production` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `screenshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farm_id` text NOT NULL,
	`camera_id` text NOT NULL,
	`file_path` text NOT NULL,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `screenshots_farm_id_idx` ON `screenshots` (`farm_id`);--> statement-breakpoint
CREATE INDEX `screenshots_occurred_at_idx` ON `screenshots` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `workers` (
	`farm_id` text PRIMARY KEY NOT NULL,
	`present` integer NOT NULL,
	`at_expected_position` integer,
	`alive` integer,
	`last_seen_at` integer,
	`updated_at` integer NOT NULL
);

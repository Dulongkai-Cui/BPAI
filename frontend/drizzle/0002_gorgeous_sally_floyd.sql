CREATE TYPE "public"."engineering_member_status" AS ENUM('available', 'assigned', 'on_site', 'leave', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."engineering_squad_member_role" AS ENUM('leader', 'member', 'reserve');--> statement-breakpoint
CREATE TYPE "public"."engineering_squad_status" AS ENUM('standby', 'assigned', 'in_transit', 'on_site', 'paused', 'archived');--> statement-breakpoint
CREATE TABLE "engineering_members" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone_number" text DEFAULT '' NOT NULL,
	"role_label" text DEFAULT '施工人员' NOT NULL,
	"status" "engineering_member_status" DEFAULT 'available' NOT NULL,
	"linked_user_id" text,
	"base_label" text DEFAULT '' NOT NULL,
	"current_location" "point",
	"note" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_by_user_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engineering_squad_members" (
	"id" text PRIMARY KEY NOT NULL,
	"squad_id" text NOT NULL,
	"member_id" text NOT NULL,
	"member_role" "engineering_squad_member_role" DEFAULT 'member' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engineering_squads" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" "engineering_squad_status" DEFAULT 'standby' NOT NULL,
	"leader_member_id" text,
	"manager_user_id" text,
	"base_label" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"current_location" "point",
	"note" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_by_user_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispatch_executions" ADD COLUMN "assigned_squad_id" text;--> statement-breakpoint
ALTER TABLE "engineering_members" ADD CONSTRAINT "engineering_members_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_members" ADD CONSTRAINT "engineering_members_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_squad_members" ADD CONSTRAINT "engineering_squad_members_squad_id_engineering_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."engineering_squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_squad_members" ADD CONSTRAINT "engineering_squad_members_member_id_engineering_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."engineering_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_squads" ADD CONSTRAINT "engineering_squads_leader_member_id_engineering_members_id_fk" FOREIGN KEY ("leader_member_id") REFERENCES "public"."engineering_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_squads" ADD CONSTRAINT "engineering_squads_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_squads" ADD CONSTRAINT "engineering_squads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "engineering_members_name_unique" ON "engineering_members" USING btree ("name");--> statement-breakpoint
CREATE INDEX "engineering_members_status_idx" ON "engineering_members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "engineering_members_linked_user_idx" ON "engineering_members" USING btree ("linked_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engineering_squad_members_pair_unique" ON "engineering_squad_members" USING btree ("squad_id","member_id");--> statement-breakpoint
CREATE INDEX "engineering_squad_members_squad_idx" ON "engineering_squad_members" USING btree ("squad_id");--> statement-breakpoint
CREATE INDEX "engineering_squad_members_member_idx" ON "engineering_squad_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "engineering_squad_members_active_idx" ON "engineering_squad_members" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "engineering_squads_code_unique" ON "engineering_squads" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "engineering_squads_name_unique" ON "engineering_squads" USING btree ("name");--> statement-breakpoint
CREATE INDEX "engineering_squads_status_idx" ON "engineering_squads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "engineering_squads_leader_idx" ON "engineering_squads" USING btree ("leader_member_id");--> statement-breakpoint
CREATE INDEX "engineering_squads_manager_idx" ON "engineering_squads" USING btree ("manager_user_id");--> statement-breakpoint
ALTER TABLE "dispatch_executions" ADD CONSTRAINT "dispatch_executions_assigned_squad_id_engineering_squads_id_fk" FOREIGN KEY ("assigned_squad_id") REFERENCES "public"."engineering_squads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dispatch_executions_assigned_squad_idx" ON "dispatch_executions" USING btree ("assigned_squad_id");
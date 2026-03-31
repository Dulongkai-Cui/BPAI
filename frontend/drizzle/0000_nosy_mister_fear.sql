CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."collaboration_tone" AS ENUM('blue', 'amber', 'emerald', 'violet');--> statement-breakpoint
CREATE TYPE "public"."content_kind" AS ENUM('document', 'sheet', 'slide');--> statement-breakpoint
CREATE TYPE "public"."folder_icon" AS ENUM('folder', 'archive', 'bookmark', 'briefcase', 'spark');--> statement-breakpoint
CREATE TYPE "public"."folder_scope" AS ENUM('personal', 'workspace');--> statement-breakpoint
CREATE TYPE "public"."folder_tone" AS ENUM('blue', 'amber', 'emerald', 'slate', 'violet', 'rose');--> statement-breakpoint
CREATE TYPE "public"."user_role_key" AS ENUM('dispatcher', 'document_editor', 'comment_reviewer', 'system_admin');--> statement-breakpoint
CREATE TYPE "public"."workspace_view_mode" AS ENUM('small', 'medium', 'large', 'list');--> statement-breakpoint
CREATE TYPE "public"."workspace_kind" AS ENUM('personal', 'collaboration');--> statement-breakpoint
CREATE TYPE "public"."workspace_member_role" AS ENUM('owner', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."workspace_visibility" AS ENUM('private', 'shared');--> statement-breakpoint
CREATE TABLE "collaboration_spaces" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"owner_user_id" text NOT NULL,
	"tone" "collaboration_tone" NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"system_form_count" integer DEFAULT 0 NOT NULL,
	"dissolved_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "content_kind" NOT NULL,
	"title" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"original_file_name" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"file_hash" text,
	"trashed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_placements" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"root_folder_id" text NOT NULL,
	"inner_folder_id" text,
	"title_override" text,
	"is_trashed" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"trashed_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folder_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_user_id" text,
	"content_kind" "content_kind" NOT NULL,
	"scope" "folder_scope" NOT NULL,
	"parent_folder_id" text,
	"system_key" text,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tone" "folder_tone" NOT NULL,
	"icon" "folder_icon" DEFAULT 'folder' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_workspace_view_states" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"content_kind" "content_kind" NOT NULL,
	"active_root_folder_id" text,
	"active_inner_folder_id" text,
	"folder_view_mode" "workspace_view_mode",
	"payload" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role_key" "user_role_key" NOT NULL,
	"role_label" text NOT NULL,
	"team_label" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"primary_workspace_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"member_role" "workspace_member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_shared_states" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"content_kind" "content_kind" NOT NULL,
	"active_root_folder_id" text,
	"active_inner_folder_id" text,
	"folder_view_mode" "workspace_view_mode",
	"payload" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "workspace_kind" NOT NULL,
	"owner_user_id" text,
	"visibility" "workspace_visibility" NOT NULL,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collaboration_spaces" ADD CONSTRAINT "collaboration_spaces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_spaces" ADD CONSTRAINT "collaboration_spaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_placements" ADD CONSTRAINT "file_placements_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_placements" ADD CONSTRAINT "file_placements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_placements" ADD CONSTRAINT "file_placements_root_folder_id_folder_nodes_id_fk" FOREIGN KEY ("root_folder_id") REFERENCES "public"."folder_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_placements" ADD CONSTRAINT "file_placements_inner_folder_id_folder_nodes_id_fk" FOREIGN KEY ("inner_folder_id") REFERENCES "public"."folder_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_nodes" ADD CONSTRAINT "folder_nodes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_nodes" ADD CONSTRAINT "folder_nodes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_nodes" ADD CONSTRAINT "folder_nodes_parent_folder_id_folder_nodes_id_fk" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."folder_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_workspace_view_states" ADD CONSTRAINT "user_workspace_view_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_workspace_view_states" ADD CONSTRAINT "user_workspace_view_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_workspace_view_states" ADD CONSTRAINT "user_workspace_view_states_active_root_folder_id_folder_nodes_id_fk" FOREIGN KEY ("active_root_folder_id") REFERENCES "public"."folder_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_workspace_view_states" ADD CONSTRAINT "user_workspace_view_states_active_inner_folder_id_folder_nodes_id_fk" FOREIGN KEY ("active_inner_folder_id") REFERENCES "public"."folder_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_primary_workspace_id_workspaces_id_fk" FOREIGN KEY ("primary_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_shared_states" ADD CONSTRAINT "workspace_shared_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_shared_states" ADD CONSTRAINT "workspace_shared_states_active_root_folder_id_folder_nodes_id_fk" FOREIGN KEY ("active_root_folder_id") REFERENCES "public"."folder_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_shared_states" ADD CONSTRAINT "workspace_shared_states_active_inner_folder_id_folder_nodes_id_fk" FOREIGN KEY ("active_inner_folder_id") REFERENCES "public"."folder_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collaboration_spaces_workspace_unique" ON "collaboration_spaces" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "collaboration_spaces_owner_idx" ON "collaboration_spaces" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "content_assets_workspace_idx" ON "content_assets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "content_assets_owner_idx" ON "content_assets" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "content_assets_kind_idx" ON "content_assets" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "file_placements_asset_unique" ON "file_placements" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "file_placements_workspace_idx" ON "file_placements" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "file_placements_root_folder_idx" ON "file_placements" USING btree ("root_folder_id");--> statement-breakpoint
CREATE INDEX "file_placements_inner_folder_idx" ON "file_placements" USING btree ("inner_folder_id");--> statement-breakpoint
CREATE INDEX "folder_nodes_workspace_idx" ON "folder_nodes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "folder_nodes_parent_idx" ON "folder_nodes" USING btree ("parent_folder_id");--> statement-breakpoint
CREATE INDEX "folder_nodes_owner_idx" ON "folder_nodes" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "folder_nodes_kind_idx" ON "folder_nodes" USING btree ("content_kind");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_workspace_view_states_scope_unique" ON "user_workspace_view_states" USING btree ("user_id","workspace_id","content_kind");--> statement-breakpoint
CREATE INDEX "user_workspace_view_states_workspace_idx" ON "user_workspace_view_states" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_primary_workspace_idx" ON "users" USING btree ("primary_workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_workspace_user_unique" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_workspace_idx" ON "workspace_members" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_shared_states_scope_unique" ON "workspace_shared_states" USING btree ("workspace_id","content_kind");--> statement-breakpoint
CREATE INDEX "workspace_shared_states_workspace_idx" ON "workspace_shared_states" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_idx" ON "workspaces" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "workspaces_kind_idx" ON "workspaces" USING btree ("kind");

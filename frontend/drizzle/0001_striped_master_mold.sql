CREATE TYPE "public"."delivery_stage_status" AS ENUM('pending', 'in_progress', 'completed', 'needs_revision', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."dispatch_execution_status" AS ENUM('pending', 'assigned', 'in_progress', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."intake_confirmation_status" AS ENUM('pending', 'confirmed', 'revised');--> statement-breakpoint
CREATE TYPE "public"."missing_item_status" AS ENUM('open', 'in_progress', 'resolved', 'waived');--> statement-breakpoint
CREATE TYPE "public"."source_channel" AS ENUM('email', 'wechat', 'phone', 'manual', 'other');--> statement-breakpoint
CREATE TYPE "public"."work_order_document_link_type" AS ENUM('source_attachment', 'dispatch_attachment', 'construction_evidence', 'return_sheet', 'drawing', 'resource', 'audit_material', 'design_package', 'other');--> statement-breakpoint
CREATE TYPE "public"."work_order_document_target_type" AS ENUM('asset', 'folder_node', 'external_ref');--> statement-breakpoint
CREATE TYPE "public"."work_order_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."work_order_stage" AS ENUM('source_intake', 'registration', 'dispatch', 'warning', 'field_construction', 'return_sheet', 'drawing_delivery', 'resource_entry', 'resource_audit', 'design_package');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('open', 'in_progress', 'waiting', 'blocked', 'completed', 'cancelled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."work_order_warning_status" AS ENUM('normal', 'warning', 'critical', 'resolved');--> statement-breakpoint
CREATE TABLE "delivery_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"work_order_id" text NOT NULL,
	"delivery_round" integer DEFAULT 1 NOT NULL,
	"return_sheet_status" "delivery_stage_status" DEFAULT 'pending' NOT NULL,
	"return_sheet_summary" text DEFAULT '' NOT NULL,
	"drawing_delivery_status" "delivery_stage_status" DEFAULT 'pending' NOT NULL,
	"drawing_delivery_list" jsonb DEFAULT 'null'::jsonb,
	"resource_entry_status" "delivery_stage_status" DEFAULT 'pending' NOT NULL,
	"resource_audit_conclusion" text DEFAULT '' NOT NULL,
	"design_package_status" "delivery_stage_status" DEFAULT 'pending' NOT NULL,
	"final_delivery_note" text DEFAULT '' NOT NULL,
	"submitted_by_user_id" text,
	"completed_at" timestamp with time zone,
	"payload" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"work_order_id" text NOT NULL,
	"dispatch_round" integer DEFAULT 1 NOT NULL,
	"dispatched_by_user_id" text,
	"assigned_team_label" text DEFAULT '' NOT NULL,
	"assigned_user_id" text,
	"planned_start_at" timestamp with time zone,
	"planned_end_at" timestamp with time zone,
	"actual_start_at" timestamp with time zone,
	"actual_end_at" timestamp with time zone,
	"execution_status" "dispatch_execution_status" DEFAULT 'pending' NOT NULL,
	"warning_status" "work_order_warning_status" DEFAULT 'normal' NOT NULL,
	"warning_reason" text DEFAULT '' NOT NULL,
	"anomaly_summary" text DEFAULT '' NOT NULL,
	"coordination_record" text DEFAULT '' NOT NULL,
	"next_action" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missing_items" (
	"id" text PRIMARY KEY NOT NULL,
	"work_order_id" text NOT NULL,
	"stage" "work_order_stage" NOT NULL,
	"item_type" text NOT NULL,
	"field_key" text DEFAULT '' NOT NULL,
	"material_label" text DEFAULT '' NOT NULL,
	"is_blocking" boolean DEFAULT false NOT NULL,
	"owner_user_id" text,
	"target_due_at" timestamp with time zone,
	"status" "missing_item_status" DEFAULT 'open' NOT NULL,
	"ai_suggested_content" text DEFAULT '' NOT NULL,
	"human_resolution" text DEFAULT '' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"payload" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_intakes" (
	"id" text PRIMARY KEY NOT NULL,
	"work_order_id" text NOT NULL,
	"source_channel" "source_channel" NOT NULL,
	"initiator_name" text DEFAULT '' NOT NULL,
	"source_account" text DEFAULT '' NOT NULL,
	"original_message_summary" text DEFAULT '' NOT NULL,
	"original_attachment_refs" jsonb DEFAULT 'null'::jsonb,
	"requirement_summary" text DEFAULT '' NOT NULL,
	"extracted_project_name" text DEFAULT '' NOT NULL,
	"extracted_site_name" text DEFAULT '' NOT NULL,
	"extraction_payload" jsonb DEFAULT 'null'::jsonb,
	"confirmation_status" "intake_confirmation_status" DEFAULT 'pending' NOT NULL,
	"confirmed_by_user_id" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_document_links" (
	"id" text PRIMARY KEY NOT NULL,
	"work_order_id" text NOT NULL,
	"link_type" "work_order_document_link_type" NOT NULL,
	"target_type" "work_order_document_target_type" NOT NULL,
	"target_id" text NOT NULL,
	"linked_workspace_id" text,
	"relation_note" text DEFAULT '' NOT NULL,
	"linked_by_user_id" text,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"work_order_no" text NOT NULL,
	"title" text NOT NULL,
	"business_type" text DEFAULT 'general' NOT NULL,
	"source_type" "source_channel" DEFAULT 'manual' NOT NULL,
	"source_summary" text DEFAULT '' NOT NULL,
	"project_name" text DEFAULT '' NOT NULL,
	"site_name" text DEFAULT '' NOT NULL,
	"site_address" text DEFAULT '' NOT NULL,
	"site_location" point,
	"construction_location" point,
	"stage" "work_order_stage" DEFAULT 'source_intake' NOT NULL,
	"status" "work_order_status" DEFAULT 'open' NOT NULL,
	"priority" "work_order_priority" DEFAULT 'normal' NOT NULL,
	"warning_status" "work_order_warning_status" DEFAULT 'normal' NOT NULL,
	"current_responsible_team" text DEFAULT '' NOT NULL,
	"current_responsible_user_id" text,
	"created_by_user_id" text NOT NULL,
	"collaboration_space_id" text,
	"next_action" text DEFAULT '' NOT NULL,
	"material_completeness" integer DEFAULT 0 NOT NULL,
	"missing_item_count" integer DEFAULT 0 NOT NULL,
	"blocking_item_count" integer DEFAULT 0 NOT NULL,
	"latest_progress_summary" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_resources" ADD CONSTRAINT "delivery_resources_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_resources" ADD CONSTRAINT "delivery_resources_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_executions" ADD CONSTRAINT "dispatch_executions_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_executions" ADD CONSTRAINT "dispatch_executions_dispatched_by_user_id_users_id_fk" FOREIGN KEY ("dispatched_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_executions" ADD CONSTRAINT "dispatch_executions_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_items" ADD CONSTRAINT "missing_items_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_items" ADD CONSTRAINT "missing_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_items" ADD CONSTRAINT "missing_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missing_items" ADD CONSTRAINT "missing_items_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_intakes" ADD CONSTRAINT "source_intakes_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_intakes" ADD CONSTRAINT "source_intakes_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_document_links" ADD CONSTRAINT "work_order_document_links_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_document_links" ADD CONSTRAINT "work_order_document_links_linked_workspace_id_workspaces_id_fk" FOREIGN KEY ("linked_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_document_links" ADD CONSTRAINT "work_order_document_links_linked_by_user_id_users_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_current_responsible_user_id_users_id_fk" FOREIGN KEY ("current_responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_collaboration_space_id_collaboration_spaces_id_fk" FOREIGN KEY ("collaboration_space_id") REFERENCES "public"."collaboration_spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_resources_work_order_idx" ON "delivery_resources" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "delivery_resources_round_idx" ON "delivery_resources" USING btree ("work_order_id","delivery_round");--> statement-breakpoint
CREATE INDEX "delivery_resources_submitted_by_idx" ON "delivery_resources" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "dispatch_executions_work_order_idx" ON "dispatch_executions" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "dispatch_executions_round_idx" ON "dispatch_executions" USING btree ("work_order_id","dispatch_round");--> statement-breakpoint
CREATE INDEX "dispatch_executions_assigned_user_idx" ON "dispatch_executions" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "dispatch_executions_status_idx" ON "dispatch_executions" USING btree ("execution_status");--> statement-breakpoint
CREATE INDEX "missing_items_work_order_idx" ON "missing_items" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "missing_items_stage_idx" ON "missing_items" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "missing_items_status_idx" ON "missing_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "missing_items_owner_idx" ON "missing_items" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "missing_items_blocking_idx" ON "missing_items" USING btree ("is_blocking");--> statement-breakpoint
CREATE INDEX "source_intakes_work_order_idx" ON "source_intakes" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "source_intakes_channel_idx" ON "source_intakes" USING btree ("source_channel");--> statement-breakpoint
CREATE INDEX "source_intakes_confirm_status_idx" ON "source_intakes" USING btree ("confirmation_status");--> statement-breakpoint
CREATE INDEX "work_order_document_links_work_order_idx" ON "work_order_document_links" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_document_links_target_idx" ON "work_order_document_links" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "work_order_document_links_workspace_idx" ON "work_order_document_links" USING btree ("linked_workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_orders_work_order_no_unique" ON "work_orders" USING btree ("work_order_no");--> statement-breakpoint
CREATE INDEX "work_orders_stage_idx" ON "work_orders" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "work_orders_status_idx" ON "work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "work_orders_priority_idx" ON "work_orders" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "work_orders_warning_status_idx" ON "work_orders" USING btree ("warning_status");--> statement-breakpoint
CREATE INDEX "work_orders_responsible_user_idx" ON "work_orders" USING btree ("current_responsible_user_id");--> statement-breakpoint
CREATE INDEX "work_orders_created_by_idx" ON "work_orders" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "work_orders_space_idx" ON "work_orders" USING btree ("collaboration_space_id");

CREATE TYPE "public"."execution_writeback_draft_status" AS ENUM('draft', 'ready', 'applied', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "execution_writeback_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"result_id" text NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"workspace_id" text,
	"object_type" text NOT NULL,
	"object_ref" text NOT NULL,
	"operation" text NOT NULL,
	"proposed_value" text NOT NULL,
	"requires_confirmation" boolean DEFAULT true NOT NULL,
	"status" "execution_writeback_draft_status" DEFAULT 'draft' NOT NULL,
	"source" text DEFAULT 'bp_ask_workflow' NOT NULL,
	"source_request_id" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "execution_writeback_drafts" ADD CONSTRAINT "execution_writeback_drafts_task_id_execution_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."execution_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_writeback_drafts" ADD CONSTRAINT "execution_writeback_drafts_result_id_execution_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."execution_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_writeback_drafts" ADD CONSTRAINT "execution_writeback_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_writeback_drafts" ADD CONSTRAINT "execution_writeback_drafts_thread_id_conversation_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."conversation_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_writeback_drafts" ADD CONSTRAINT "execution_writeback_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "execution_writeback_drafts_result_target_unique" ON "execution_writeback_drafts" USING btree ("result_id","object_type","object_ref","operation");--> statement-breakpoint
CREATE INDEX "execution_writeback_drafts_task_idx" ON "execution_writeback_drafts" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "execution_writeback_drafts_result_idx" ON "execution_writeback_drafts" USING btree ("result_id");--> statement-breakpoint
CREATE INDEX "execution_writeback_drafts_thread_idx" ON "execution_writeback_drafts" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "execution_writeback_drafts_user_idx" ON "execution_writeback_drafts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "execution_writeback_drafts_status_idx" ON "execution_writeback_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "execution_writeback_drafts_object_idx" ON "execution_writeback_drafts" USING btree ("object_type","object_ref");
CREATE TYPE "public"."execution_executor_kind" AS ENUM('bp_ask', 'kimi', 'longxia', 'system');--> statement-breakpoint
CREATE TYPE "public"."execution_result_status" AS ENUM('ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."execution_task_status" AS ENUM('pending', 'planned', 'delegated', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "execution_results" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"status" "execution_result_status" DEFAULT 'ready' NOT NULL,
	"summary_text" text NOT NULL,
	"response_text" text NOT NULL,
	"structured_payload" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"workspace_id" text,
	"source_message_id" text,
	"status" "execution_task_status" DEFAULT 'planned' NOT NULL,
	"executor_kind" "execution_executor_kind" DEFAULT 'bp_ask' NOT NULL,
	"primary_intent" text NOT NULL,
	"target_domain" text NOT NULL,
	"execution_mode" text NOT NULL,
	"goal" text NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"needs_memory" boolean DEFAULT false NOT NULL,
	"needs_tools" boolean DEFAULT false NOT NULL,
	"requires_write" boolean DEFAULT false NOT NULL,
	"requires_confirmation" boolean DEFAULT false NOT NULL,
	"target_refs" jsonb DEFAULT 'null'::jsonb,
	"constraints" jsonb DEFAULT 'null'::jsonb,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "execution_results" ADD CONSTRAINT "execution_results_task_id_execution_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."execution_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_tasks" ADD CONSTRAINT "execution_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_tasks" ADD CONSTRAINT "execution_tasks_thread_id_conversation_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."conversation_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_tasks" ADD CONSTRAINT "execution_tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_tasks" ADD CONSTRAINT "execution_tasks_source_message_id_conversation_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "execution_results_task_unique" ON "execution_results" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "execution_results_status_idx" ON "execution_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "execution_tasks_thread_idx" ON "execution_tasks" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "execution_tasks_user_idx" ON "execution_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "execution_tasks_status_idx" ON "execution_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "execution_tasks_executor_idx" ON "execution_tasks" USING btree ("executor_kind");
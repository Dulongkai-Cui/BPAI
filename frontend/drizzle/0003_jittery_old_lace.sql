CREATE TYPE "public"."conversation_message_role" AS ENUM('system', 'user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."conversation_summary_kind" AS ENUM('rolling', 'snapshot');--> statement-breakpoint
CREATE TYPE "public"."conversation_thread_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."memory_scope_kind" AS ENUM('user', 'thread', 'workspace', 'collaboration_space', 'system_form', 'document', 'work_order');--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"role" "conversation_message_role" NOT NULL,
	"sequence" integer NOT NULL,
	"content" text NOT NULL,
	"token_estimate" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"kind" "conversation_summary_kind" DEFAULT 'rolling' NOT NULL,
	"summary_text" text NOT NULL,
	"message_count" integer NOT NULL,
	"from_sequence" integer NOT NULL,
	"to_sequence" integer NOT NULL,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"title" text NOT NULL,
	"status" "conversation_thread_status" DEFAULT 'active' NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"thread_id" text,
	"workspace_id" text,
	"source_message_id" text,
	"scope_kind" "memory_scope_kind" NOT NULL,
	"scope_id" text NOT NULL,
	"fact_type" text NOT NULL,
	"fact_key" text NOT NULL,
	"fact_value" text NOT NULL,
	"confidence" integer DEFAULT 70 NOT NULL,
	"last_confirmed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_thread_id_conversation_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."conversation_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_thread_id_conversation_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."conversation_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_threads" ADD CONSTRAINT "conversation_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_threads" ADD CONSTRAINT "conversation_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_thread_id_conversation_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."conversation_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD CONSTRAINT "memory_facts_source_message_id_conversation_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_thread_sequence_unique" ON "conversation_messages" USING btree ("thread_id","sequence");--> statement-breakpoint
CREATE INDEX "conversation_messages_thread_idx" ON "conversation_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "conversation_messages_role_idx" ON "conversation_messages" USING btree ("role");--> statement-breakpoint
CREATE INDEX "conversation_messages_created_idx" ON "conversation_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversation_summaries_thread_idx" ON "conversation_summaries" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "conversation_summaries_kind_idx" ON "conversation_summaries" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "conversation_summaries_thread_to_sequence_idx" ON "conversation_summaries" USING btree ("thread_id","to_sequence");--> statement-breakpoint
CREATE INDEX "conversation_threads_user_idx" ON "conversation_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversation_threads_workspace_idx" ON "conversation_threads" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "conversation_threads_status_idx" ON "conversation_threads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conversation_threads_last_message_idx" ON "conversation_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_facts_scope_key_unique" ON "memory_facts" USING btree ("scope_kind","scope_id","fact_key");--> statement-breakpoint
CREATE INDEX "memory_facts_user_idx" ON "memory_facts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memory_facts_thread_idx" ON "memory_facts" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "memory_facts_workspace_idx" ON "memory_facts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "memory_facts_scope_idx" ON "memory_facts" USING btree ("scope_kind","scope_id");--> statement-breakpoint
CREATE INDEX "memory_facts_type_idx" ON "memory_facts" USING btree ("fact_type");
CREATE TYPE "public"."currency" AS ENUM('XCD', 'JMD', 'BBD', 'TTD', 'USD');--> statement-breakpoint
CREATE TYPE "public"."directory_key_type" AS ENUM('vpa', 'phone', 'email');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('unverified', 'pending', 'verified');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."linked_account_status" AS ENUM('active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('transfer_received', 'transfer_failed', 'transfer_reversed');--> statement-breakpoint
CREATE TYPE "public"."psp_status" AS ENUM('active', 'planned');--> statement-breakpoint
CREATE TYPE "public"."system_account_type" AS ENUM('fx_liquidity', 'settlement_clearing', 'fee_revenue', 'bank_position');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('initiated', 'debit_pending', 'debit_held', 'credit_pending', 'completed', 'failed', 'reversal_pending', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('p2p_transfer', 'deposit', 'withdrawal', 'fx_conversion');--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"contact_user_id" uuid NOT NULL,
	"saved_key" text NOT NULL,
	"display_name" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "directory_key_type" NOT NULL,
	"value_raw" text NOT NULL,
	"value_normalized" text NOT NULL,
	"skeleton" text,
	"institution_id" uuid,
	"linked_account_id" uuid,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"verification_code" text,
	"verification_expires_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "directory_keys_value_normalized_unique" UNIQUE("value_normalized"),
	CONSTRAINT "directory_keys_skeleton_unique" UNIQUE("skeleton")
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_currency" "currency" NOT NULL,
	"quote_currency" "currency" NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"key" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"currency" "currency" NOT NULL,
	"psp_handle" text,
	"psp_status" "psp_status" DEFAULT 'planned' NOT NULL,
	"supports_account_linking" boolean DEFAULT true NOT NULL,
	"is_simulated" boolean DEFAULT true NOT NULL,
	"reserved_aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_psp_handle_unique" UNIQUE("psp_handle")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"system_account_id" uuid NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_positive" CHECK ("ledger_entries"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "linked_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"account_ref" text NOT NULL,
	"account_number_masked" text NOT NULL,
	"currency" "currency" NOT NULL,
	"holder_name_verified" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" "linked_account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_cycle_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"currency" "currency" NOT NULL,
	"net_position_minor" bigint NOT NULL,
	"gross_in_minor" bigint DEFAULT 0 NOT NULL,
	"gross_out_minor" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid,
	"transfer_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "system_account_type" NOT NULL,
	"currency" "currency" NOT NULL,
	"institution_id" uuid,
	"debit_cap_minor" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "transaction_type" NOT NULL,
	"status" "transaction_status" DEFAULT 'initiated' NOT NULL,
	"idempotency_key" text NOT NULL,
	"sender_user_id" uuid,
	"recipient_user_id" uuid,
	"payer_account_id" uuid,
	"payee_account_id" uuid,
	"source_currency" "currency" NOT NULL,
	"dest_currency" "currency" NOT NULL,
	"source_amount_minor" bigint NOT NULL,
	"dest_amount_minor" bigint NOT NULL,
	"fx_rate_used" numeric(18, 8),
	"note" text,
	"recipient_key_used" text,
	"recipient_name_snapshot" text,
	"hold_ref" text,
	"debit_ref" text,
	"credit_ref" text,
	"deadline_at" timestamp with time zone,
	"failure_reason" text,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"kyc_status" "kyc_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_contact_user_id_users_id_fk" FOREIGN KEY ("contact_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_keys" ADD CONSTRAINT "directory_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_keys" ADD CONSTRAINT "directory_keys_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_keys" ADD CONSTRAINT "directory_keys_linked_account_id_linked_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."linked_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_system_account_id_system_accounts_id_fk" FOREIGN KEY ("system_account_id") REFERENCES "public"."system_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_cycle_entries" ADD CONSTRAINT "settlement_cycle_entries_cycle_id_settlement_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."settlement_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_cycle_entries" ADD CONSTRAINT "settlement_cycle_entries_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_cycles" ADD CONSTRAINT "settlement_cycles_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_accounts" ADD CONSTRAINT "system_accounts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payer_account_id_linked_accounts_id_fk" FOREIGN KEY ("payer_account_id") REFERENCES "public"."linked_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payee_account_id_linked_accounts_id_fk" FOREIGN KEY ("payee_account_id") REFERENCES "public"."linked_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_owner_contact_uq" ON "contacts" USING btree ("owner_user_id","contact_user_id");--> statement-breakpoint
CREATE INDEX "directory_keys_user_idx" ON "directory_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "directory_keys_one_primary_uq" ON "directory_keys" USING btree ("user_id") WHERE "directory_keys"."is_primary" AND "directory_keys"."released_at" IS NULL;--> statement-breakpoint
CREATE INDEX "fx_rates_pair_valid_idx" ON "fx_rates" USING btree ("base_currency","quote_currency","valid_from");--> statement-breakpoint
CREATE INDEX "institutions_country_idx" ON "institutions" USING btree ("country_code","sort_order");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("system_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linked_accounts_institution_ref_uq" ON "linked_accounts" USING btree ("institution_id","account_ref");--> statement-breakpoint
CREATE INDEX "linked_accounts_user_idx" ON "linked_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linked_accounts_one_default_uq" ON "linked_accounts" USING btree ("user_id") WHERE "linked_accounts"."is_default" AND "linked_accounts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_entries_cycle_inst_ccy_uq" ON "settlement_cycle_entries" USING btree ("cycle_id","institution_id","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "system_accounts_global_type_currency_uq" ON "system_accounts" USING btree ("type","currency") WHERE "system_accounts"."institution_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "system_accounts_bank_position_uq" ON "system_accounts" USING btree ("type","currency","institution_id") WHERE "system_accounts"."institution_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_sender_idx" ON "transactions" USING btree ("sender_user_id","created_at");--> statement-breakpoint
CREATE INDEX "transactions_recipient_idx" ON "transactions" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "transactions_status_deadline_idx" ON "transactions" USING btree ("status","deadline_at");
CREATE TYPE "public"."bank_account_status" AS ENUM('active', 'frozen', 'closed');--> statement-breakpoint
CREATE TYPE "public"."bank_currency" AS ENUM('XCD', 'JMD', 'BBD', 'TTD', 'USD');--> statement-breakpoint
CREATE TYPE "public"."hold_status" AS ENUM('outstanding', 'confirmed', 'released', 'expired');--> statement-breakpoint
CREATE TABLE "accounts" (
	"account_ref" text PRIMARY KEY NOT NULL,
	"institution_handle" text NOT NULL,
	"holder_name" text NOT NULL,
	"currency" "bank_currency" NOT NULL,
	"balance_minor" bigint DEFAULT 0 NOT NULL,
	"status" "bank_account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_balance_non_negative" CHECK ("accounts"."balance_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bank_idempotency_records" (
	"key" text PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"credit_ref" text PRIMARY KEY NOT NULL,
	"account_ref" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "bank_currency" NOT NULL,
	"reference" text NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debits" (
	"debit_ref" text PRIMARY KEY NOT NULL,
	"hold_ref" text NOT NULL,
	"account_ref" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "bank_currency" NOT NULL,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holds" (
	"hold_ref" text PRIMARY KEY NOT NULL,
	"account_ref" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "bank_currency" NOT NULL,
	"reference" text NOT NULL,
	"status" "hold_status" DEFAULT 'outstanding' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holds_amount_positive" CHECK ("holds"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_account_ref_accounts_account_ref_fk" FOREIGN KEY ("account_ref") REFERENCES "public"."accounts"("account_ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debits" ADD CONSTRAINT "debits_hold_ref_holds_hold_ref_fk" FOREIGN KEY ("hold_ref") REFERENCES "public"."holds"("hold_ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debits" ADD CONSTRAINT "debits_account_ref_accounts_account_ref_fk" FOREIGN KEY ("account_ref") REFERENCES "public"."accounts"("account_ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_account_ref_accounts_account_ref_fk" FOREIGN KEY ("account_ref") REFERENCES "public"."accounts"("account_ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_institution_idx" ON "accounts" USING btree ("institution_handle");--> statement-breakpoint
CREATE INDEX "credits_reference_idx" ON "credits" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "debits_hold_uq" ON "debits" USING btree ("hold_ref");--> statement-breakpoint
CREATE INDEX "holds_account_status_idx" ON "holds" USING btree ("account_ref","status");--> statement-breakpoint
CREATE INDEX "holds_reference_idx" ON "holds" USING btree ("reference");
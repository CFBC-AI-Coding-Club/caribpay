import { and, eq } from "drizzle-orm";
import {
  maskName,
  type AccountBalance,
  type Institution,
  type LinkAccountRequest,
  type LinkedAccount,
} from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { institutions, linkedAccounts } from "../db/schema";
import { ApiError } from "../lib/errors";
import { isUniqueViolation } from "../lib/pg-errors";
import { connectorForInstitution } from "../banks/http-connector";
import { BankUnknownError } from "../banks/connector";

type AccountRow = typeof linkedAccounts.$inferSelect;

function toPublicAccount(
  row: AccountRow,
  institution: { displayName: string; countryCode: string },
): LinkedAccount {
  return {
    id: row.id,
    institutionId: row.institutionId,
    institutionDisplayName: institution.displayName,
    countryCode: institution.countryCode,
    accountNumberMasked: row.accountNumberMasked,
    currency: row.currency,
    holderNameVerified: row.holderNameVerified,
    isDefault: row.isDefault,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listInstitutions(dbh: DbHandle): Promise<Institution[]> {
  const rows = await dbh.select().from(institutions).orderBy(institutions.sortOrder);
  return rows.map((row) => ({
    id: row.id,
    legalName: row.legalName,
    displayName: row.displayName,
    countryCode: row.countryCode,
    currency: row.currency,
    pspHandle: row.pspHandle,
    pspStatus: row.pspStatus,
    supportsAccountLinking: row.supportsAccountLinking,
    isSimulated: row.isSimulated,
    sortOrder: row.sortOrder,
  }));
}

export async function listAccounts(dbh: DbHandle, userId: string): Promise<LinkedAccount[]> {
  const rows = await dbh
    .select({ account: linkedAccounts, institution: institutions })
    .from(linkedAccounts)
    .innerJoin(institutions, eq(institutions.id, linkedAccounts.institutionId))
    .where(eq(linkedAccounts.userId, userId))
    .orderBy(linkedAccounts.createdAt);
  return rows.map((r) => toPublicAccount(r.account, r.institution));
}

/**
 * Link a bank account.
 *
 * The account is verified through the connector before anything is stored, and
 * only the reference and a mask are kept. The holder's name is stored masked —
 * it is shown back to the payer at confirmation, and a full legal name is more
 * than that moment needs.
 */
export async function linkAccount(
  dbh: DbHandle,
  userId: string,
  input: LinkAccountRequest,
): Promise<LinkedAccount> {
  const [institution] = await dbh
    .select()
    .from(institutions)
    .where(eq(institutions.id, input.institutionId));
  if (institution === undefined) {
    throw new ApiError(404, "INSTITUTION_NOT_FOUND", "No such institution");
  }
  if (!institution.supportsAccountLinking) {
    throw new ApiError(422, "LINKING_UNSUPPORTED", "You cannot hold an account there");
  }

  const connector = connectorForInstitution(institution.pspHandle);
  let verified;
  try {
    verified = await connector.verifyAccount(input.accountRef);
  } catch (error) {
    if (error instanceof BankUnknownError) {
      throw new ApiError(503, "BANK_UNREACHABLE", "We could not reach that bank just now");
    }
    throw error;
  }

  if (!verified.exists || verified.currency === null || verified.holderName === null) {
    throw new ApiError(404, "ACCOUNT_NOT_FOUND", "That account does not exist at this bank");
  }
  if (verified.status !== "active") {
    throw new ApiError(422, "ACCOUNT_INACTIVE", `That account is ${verified.status}`);
  }
  if (verified.currency !== institution.currency) {
    throw new ApiError(
      422,
      "CURRENCY_MISMATCH",
      `That account holds ${verified.currency}, not ${institution.currency}`,
    );
  }

  const existing = await listAccounts(dbh, userId);
  const makeDefault = input.makeDefault || existing.length === 0;

  try {
    return await dbh.transaction(async (tx) => {
      if (makeDefault) {
        await tx
          .update(linkedAccounts)
          .set({ isDefault: false })
          .where(and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.isDefault, true)));
      }
      const [row] = await tx
        .insert(linkedAccounts)
        .values({
          userId,
          institutionId: institution.id,
          accountRef: input.accountRef,
          accountNumberMasked: verified.accountNumberMasked ?? "••••",
          currency: verified.currency!,
          holderNameVerified: maskName(verified.holderName!),
          isDefault: makeDefault,
        })
        .returning();
      return toPublicAccount(row!, institution);
    });
  } catch (error) {
    if (isUniqueViolation(error, "linked_accounts_institution_ref_uq")) {
      throw new ApiError(409, "ACCOUNT_ALREADY_LINKED", "That account is already linked");
    }
    throw error;
  }
}

export async function requireOwnedAccount(
  dbh: DbHandle,
  userId: string,
  accountId: string,
): Promise<AccountRow> {
  const [row] = await dbh
    .select()
    .from(linkedAccounts)
    .where(and(eq(linkedAccounts.id, accountId), eq(linkedAccounts.userId, userId)));
  if (row === undefined) {
    throw new ApiError(404, "ACCOUNT_NOT_FOUND", "That is not one of your accounts");
  }
  return row;
}

/**
 * A balance, read live from the bank and cached nowhere.
 *
 * The switch has no opinion about what someone holds; it asks, and reports the
 * answer with the time it was true. `asOf` exists so the UI can say "as reported
 * by your bank just now" honestly.
 */
export async function accountBalance(
  dbh: DbHandle,
  userId: string,
  accountId: string,
): Promise<AccountBalance> {
  const account = await requireOwnedAccount(dbh, userId, accountId);
  const [institution] = await dbh
    .select({ pspHandle: institutions.pspHandle })
    .from(institutions)
    .where(eq(institutions.id, account.institutionId));

  const connector = connectorForInstitution(institution?.pspHandle ?? null);
  try {
    const balance = await connector.getBalance(account.accountRef);
    return {
      accountId: account.id,
      currency: balance.currency,
      balanceMinor: balance.balanceMinor,
      availableMinor: balance.availableMinor,
      asOf: balance.asOf,
    };
  } catch (error) {
    if (error instanceof BankUnknownError) {
      throw new ApiError(503, "BANK_UNREACHABLE", "Your bank did not answer just now");
    }
    throw error;
  }
}

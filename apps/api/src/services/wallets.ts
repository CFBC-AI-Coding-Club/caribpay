import type { Currency } from "@caribpay/shared";
import type { DbHandle } from "../db/client";
import { wallets } from "../db/schema";
import { isUniqueViolation } from "../lib/pg-errors";

// No 0/O/1/I/L so addresses stay unambiguous when read aloud or retyped.
const ADDRESS_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateWalletAddress(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => ADDRESS_ALPHABET[b % ADDRESS_ALPHABET.length]);
  const block = (start: number) => chars.slice(start, start + 4).join("");
  return `CW-${block(0)}-${block(4)}-${block(8)}-${block(12)}`;
}

export interface WalletRow {
  id: string;
  userId: string;
  currency: Currency;
  address: string;
  createdAt: Date;
}

export async function createWalletForUser(
  dbh: DbHandle,
  userId: string,
  currency: Currency,
): Promise<WalletRow> {
  for (let attempt = 0; ; attempt++) {
    try {
      const [wallet] = await dbh
        .insert(wallets)
        .values({ userId, currency, address: generateWalletAddress() })
        .returning();
      return wallet!;
    } catch (error) {
      const addressCollision = isUniqueViolation(error, "wallets_address_unique");
      if (!addressCollision || attempt >= 2) throw error;
    }
  }
}

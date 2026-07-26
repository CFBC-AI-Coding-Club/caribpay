export * from "./common";
export * from "./user";
export * from "./auth";
export * from "./wallets";
export * from "./transactions";
export * from "./transfers";
export * from "./fx";
export * from "./contacts";
export * from "./qr";

// Switch architecture. Additive for now: the wallet-era schemas above are
// deleted in the phases that rewrite their consumers, so the tree stays green.
export * from "./institutions";
export * from "./accounts";
export * from "./directory";
export * from "./notifications";
export * from "./bank";

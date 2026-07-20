import { Hono } from "hono";
import {
  contactsResponseSchema,
  createContactRequestSchema,
  createContactResponseSchema,
} from "@caribpay/shared";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { createContact, listContacts } from "../services/contacts";
import type { AppEnv } from "../app-env";

export const contactRoutes = new Hono<AppEnv>();

contactRoutes.use(requireAuth);

contactRoutes.get("/", async (c) => {
  const contacts = await listContacts(db, c.get("userId"));
  return c.json(contactsResponseSchema.parse({ contacts }), 200);
});

contactRoutes.post("/", async (c) => {
  const body = createContactRequestSchema.parse(await c.req.json());
  const contact = await createContact(db, c.get("userId"), body.walletAddress, body.displayName);
  return c.json(createContactResponseSchema.parse({ contact }), 201);
});

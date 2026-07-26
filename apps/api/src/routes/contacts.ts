import { Hono } from "hono";
import { createContactRequestSchema } from "@caribpay/shared";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { createContact, listContacts } from "../services/contacts";
import type { AppEnv } from "../app-env";

export const contactRoutes = new Hono<AppEnv>();

contactRoutes.use("*", requireAuth);

contactRoutes.get("/", async (c) => {
  return c.json({ contacts: await listContacts(db, c.get("userId")) });
});

contactRoutes.post("/", async (c) => {
  const body = createContactRequestSchema.parse(await c.req.json());
  return c.json({ contact: await createContact(db, c.get("userId"), body) }, 201);
});

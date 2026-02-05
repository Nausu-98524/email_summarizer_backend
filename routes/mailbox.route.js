import express from "express";
import {
  AddMailbox,
  DeleteMailbox,
  GetMailboxes,
  ShowDecryptedAppPassword,
  UpdateMailbox,
  VerifyImapAppPassword,
} from "../controllers/mailbox.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const routes = express.Router();

routes.post("/add-mailbox", authMiddleware, AddMailbox);
routes.patch("/update-mailbox/:mailboxId", authMiddleware, UpdateMailbox);
routes.get("/get-all-mailboxes", authMiddleware, GetMailboxes);
routes.delete("/delete-mailbox/:mailboxId", authMiddleware, DeleteMailbox);
routes.get(
  "/show-decrypted-app-password/:mailboxId",
  authMiddleware,
  ShowDecryptedAppPassword,
);
routes.post(
  "/verify-imap",
  authMiddleware,
  VerifyImapAppPassword,
);

export default routes;

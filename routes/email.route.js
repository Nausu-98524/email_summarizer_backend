import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import {
  BulkEmailsSendReply,
  GenerateAISummary,
  GetEmails,
  GetJobProgress,
  SaveEmailAsDraft,
  SendEmailReply,
  StartBulkSend,
  SyncUnreadEmails,
} from "../controllers/email.controller.js";

const routes = express.Router();

routes.get("/get-all-emails", authMiddleware, GetEmails);
routes.post("/sync-unread-emails", authMiddleware, SyncUnreadEmails);
routes.put("/saved-as-draft/:id", authMiddleware, SaveEmailAsDraft);
routes.post("/genrate-ai-summary", authMiddleware, GenerateAISummary);
routes.post("/send-email-reply/:id", authMiddleware, SendEmailReply);
routes.post("/send-email-bulk", authMiddleware, StartBulkSend);
routes.get("/get-bulk-job-progress/:jobId", authMiddleware, GetJobProgress);

export default routes;

import imaps from "imap-simple";
import { asyncHandler } from "../middlewares/error.handler.js";
import { decryptWithPin, isValidObjectId } from "../services/helper.service.js";
import Email from "../models/email.model.js";
import Mailbox from "../models/mailbox.model.js";
import { getImapConfig } from "../services/imaptest.service.js";
import axios from "axios";
import nodemailer from "nodemailer";
import { htmlToText } from "html-to-text";
import BulkJob from "../models/jobbulk.model.js";
import { runBulkSendJob } from "../services/email.service.js";

const buildEmailFilter = ({ userId, status, mailboxId, search }) => {
  const filter = { userId };
  if (status) filter.status = status;
  if (mailboxId) filter.mailBoxId = mailboxId;

  if (search) {
    filter.$or = [
      { subject: { $regex: search, $options: "i" } },
      { messageBody: { $regex: search, $options: "i" } },
      { mailboxEmailId: { $regex: search, $options: "i" } },
      { nickName: { $regex: search, $options: "i" } },
    ];
  }

  return filter;
};

// Parse IMAP message to extract subject/body/date/message-id/from
const extractEmailData = (msg) => {
  const headerPart = msg.parts?.find((p) => p.which?.includes("HEADER"))?.body;

  const textPart = msg.parts?.find((p) => p.which === "TEXT")?.body;

  const subject = headerPart?.subject?.[0] || "";

  const dateStr = headerPart?.date?.[0] || null;

  const receivedAt = dateStr ? new Date(dateStr) : new Date();

  // Message ID
  const messageIdHeader = headerPart?.["message-id"]?.[0] || null;
  const messageId = messageIdHeader || String(msg.attributes?.uid || "");

  // Message body
  const messageBody = typeof textPart === "string" ? textPart : "";

  // ✅ FROM (sender)
  const fromRaw = headerPart?.from?.[0] || "";

  // Extract email + name
  let fromEmail = "";
  let fromName = "";

  const match = fromRaw.match(/(.*)<(.+)>/);
  if (match) {
    fromName = match[1].replace(/"/g, "").trim();
    fromEmail = match[2].trim();
  } else {
    fromEmail = fromRaw;
  }

  return {
    subject,
    receivedAt,
    messageId,
    messageBody,
    fromEmail,
    fromName,
  };
};

//...........POST /Email-Sync (Manual Refresh) ...........
export const SyncUnreadEmails = asyncHandler(async (req, res) => {
  const mailboxes = await Mailbox.find({
    userId: req.user?.id,
    isActive: true,
    isDeleted: false,
  });

  if (!mailboxes?.length) {
    return res.status(400).json({
      success: false,
      message: "No active mailboxes to sync!",
      synced: 0,
      inserted: 0,
      mailboxResults: [],
    });
  }

  let totalInserted = 0;
  const mailboxResults = [];

  // Process mialbox-wise
  for (const mb of mailboxes) {
    const mailboxResult = {
      mailBoxId: mb._id,
      emailId: mb.emailId,
      nickName: mb.nickName,
      inserted: 0,
      error: null,
    };

    try {
      const appPasswordDec = decryptWithPin(
        process.env.APP_PASSWORD_ENC_DEC,
        mb.appPassword,
      );
      const connection = await imaps.connect(
        getImapConfig(mb.emailId, appPasswordDec),
      );

      await connection.openBox("INBOX");

      const searchCriteria = ["UNSEEN"];
      const fetchOptions = {
        bodies: ["HEADER", "TEXT"],
        markSeen: false,
      };
      const message = await connection.search(searchCriteria, fetchOptions);

      for (const msg of message) {
        const {
          subject,
          messageBody,
          receivedAt,
          messageId,
          fromEmail,
          fromName,
        } = extractEmailData(msg);
        const emailDocs = {
          userId: mb.userId,
          mailBoxId: mb._id,
          mailBoxEmailId: mb.emailId,
          nickName: mb.nickName,
          fromEmail: fromEmail,
          fromName: fromName,
          messageId,
          subject,
          messageBody,
          receivedAt,
          status: "Unread",
        };
        const r = await Email.updateOne(
          { mailBoxId: mb._id, messageId },
          { $setOnInsert: emailDocs },
          { upsert: true },
        );
        const inserted = r.upsertedCount && r.upsertedCount > 0 ? 1 : 0;
        mailboxResult.inserted += inserted;
        totalInserted += inserted;
      }

      connection.end();

      await Mailbox.updateOne(
        { _id: mb._id },
        {
          $set: {
            lastSyncAt: new Date(),
            lastSyncStatus: "OK",
            lastSyncError: "",
          },
        },
      );
      mailboxResults.push(mailboxResult);
    } catch (error) {
      mailboxResult.error = error?.message || "Sync failed";

      await Mailbox.updateOne(
        { _id: mb._id },
        {
          $set: {
            lastSyncAt: new Date(),
            lastSyncStatus: "FAILED",
            lastSyncError: mailboxResult.error,
          },
        },
      );
      mailboxResults.push(mailboxResult);
    }
  }
  return res.status(200).json({
    success: true,
    message: "Sync Completed",
    synced: mailboxes?.length,
    inserted: totalInserted,
    mailboxResults: mailboxResults,
  });
});

//...........GET EMAILS............
export const GetEmails = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limitRaw = parseInt(req.query.limit || "20", 10);
  const limit = Math.min(Math.max(limitRaw, 1), 100);
  const skip = (page - 1) * limit;

  const status = (req.query.status || "").toString().trim();
  const mailboxId = (req.query.mailboxId || "").toString().trim();
  const search = (req.query.search || "").toString().trim();
  const type = (req.query.type || "").toString().trim();

  if (status && !["Unread", "DraftSaved", "ReadResponded"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status filter!",
    });
  }

  if (mailboxId && !isValidObjectId(mailboxId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid mailboxId!",
    });
  }

  let statusFilter;

  if (status) {
    statusFilter = status;
  } else if (type === "execptRead") {
    statusFilter = {
      $nin: ["ReadResponded"],
    };
  } else {
    statusFilter = null;
  }

  const filter = buildEmailFilter({
    userId: req.user.id,
    status: statusFilter,
    mailboxId: mailboxId || null,
    search: search || null,
  });

  const projection =
    "userId mailboxId mailBoxEmailId aiSummary savedDraftAt fromName fromEmail  nickName messageId subject messageBody summary responseBody status receivedAt sentAt sendError createdAt updatedAt";

  const [items, total, unread, draft, responded, activeMailBox] =
    await Promise.all([
      Email.find(filter)
        .select(projection)
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Email.countDocuments(filter),
      Email.countDocuments({ status: "Unread" }),
      Email.countDocuments({ status: "DraftSaved" }),
      Email.countDocuments({ status: "ReadResponded" }),
      Mailbox.countDocuments({ isActive: true }),
    ]);

  const cardDetails = {
    Unread: unread,
    DraftSaved: draft,
    ReadResponded: responded,
    ActiveEmailBox: activeMailBox,
  };

  return res.status(200).json({
    success: true,
    message: "Emails details fetched successfully!",
    cardDetails,
    emails: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: skip + items.length < total,
      hasPrev: page > 1,
    },
    filters: {
      status: status || null,
      mailboxId: mailboxId || null,
      search: search || null,
    },
  });
});

//...........PUT-> Save as Draft..........
export const SaveEmailAsDraft = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { responseBody } = req.body;

  if (!isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid email id!",
    });
  }

  if (!responseBody || typeof responseBody !== "string") {
    return res.status(400).json({
      success: false,
      message: "responseBody is required!",
    });
  }

  const updatedEmail = await Email.findOneAndUpdate(
    {
      _id: id,
      userId: req.user?.id,
      status: { $ne: "ReadResponded" },
    },
    {
      $set: { responseBody, status: "DraftSaved", savedDraftAt: Date.now() },
    },
    {
      new: true,
    },
  ).lean();

  if (!updatedEmail) {
    return res.status(404).json({
      success: false,
      message: "Email not found or already responded!",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Draft saved successfully!",
    data: { id: updatedEmail._id, status: updatedEmail.status },
  });
});

//...........POST-> Genrate AI Response..........
export const GenerateAISummary = asyncHandler(async (req, res) => {
  try {
    const token = process.env.HF_TOKEN;
    const html = req.body?.html;
    const id = req.body?.id;

     if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "id is required" });
    }

    if (!html) {
      return res
        .status(400)
        .json({ success: false, message: "html is required" });
    }
    if (!token) {
      return res
        .status(400)
        .json({ success: false, message: "HF_TOKEN missing in env" });
    }

    // HTML -> plain text
    let text = htmlToText(html, { wordwrap: false })
      .replace(/\s+/g, " ")
      .trim();
    if (!text) {
      return res
        .status(400)
        .json({ success: false, message: "Could not extract text from html" });
    }

    const hfRes = await axios.post(
      process.env.AI_GENRATE_SUMMARY_URL,
      {
        model: "HuggingFaceTB/SmolLM3-3B:hf-inference",
        messages: [
          {
            role: "system",
            content:
              "You summarize email content. Return a concise summary around 50 words. No bullet points unless needed.",
          },
          {
            role: "user",
            content: `Summarize this in ~50 words:\n\n${text}`,
          },
        ],
        max_tokens: 120,
        temperature: 0.2,
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      },
    );

    const summary = hfRes.data?.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      return res.status(502).json({
        success: false,
        message: "Unexpected response from Hugging Face router",
        hf_response: hfRes.data,
      });
    }

    // hard cap ~50 words
    const capped = summary.split(/\s+/).filter(Boolean).slice(0, 50).join(" ");

    await Email.updateOne(
      {
        _id: id,
        userId: req?.user?.id,
      },
      {
        $set: {
          aiSummary: capped,
        },
      },
      { new: true },
    );

    return res.json({
      success: true,
      summary: capped,
      wordCount: capped.split(/\s+/).filter(Boolean).length,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to generate summary",
      hf_status: err.response?.status,
      hf_error: err.response?.data || err.message,
    });
  }
});

//...........POST-> Send Single Mail..........
export const SendEmailReply = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { to, responseBody } = req.body;

  if (!isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid email id!",
    });
  }

  if (!to) {
    return res.status(400).json({
      success: false,
      message: "Recipient (to) is required!",
    });
  }
  if (!responseBody) {
    return res.status(400).json({
      success: false,
      message: "Response Body is required!",
    });
  }
  const email = await Email.findOne({ _id: id, userId: req.user?.id });

  if (!email) {
    return res.status(404).json({
      success: false,
      message: "Email not found!",
    });
  }
  if (email.status === "ReadResponded") {
    return res.status(400).json({
      success: false,
      message: "Email already responded!",
    });
  }

  const mailbox = await Mailbox.findOne({
    _id: email.mailBoxId,
    userId: req.user?.id,
    isActive: true,
    isActive: true,
    isDeleted: { $ne: true },
  });

  if (!mailbox) {
    return res.status(404).json({
      success: false,
      message: "Mailbox not found or inactive!",
    });
  }

  try {
    const appPassword = decryptWithPin(
      process.env.APP_PASSWORD_ENC_DEC,
      mailbox.appPassword,
    );
    // Gmail SMTP with app password
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: mailbox.emailId,
        pass: appPassword,
      },
    });

    await transporter.sendMail({
      from: mailbox.emailId,
      to,
      subject: `Re: ${email.subject || ""}`,
      html: responseBody,
    });

    await Email.updateOne(
      { _id: email._id },
      { $set: { status: "ReadResponded", sentAt: new Date(), sendError: "" } },
    );

    return res.status(200).json({
      success: true,
      message: "Email sent Successfully!",
    });
  } catch (error) {
    await Email.updateOne(
      { _id: email._id },
      {
        $set: {
          sendError: error?.message || "Send failed",
        },
      },
    );
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to send email!",
    });
  }
});

//..........POST -> BULK SEND EMAIL at Once -->> Cousing Server time out when i have 2k+ email data
export const BulkEmailsSendReply = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { emailIds, responsebody: defaultResponseBody } = req.body;

  //Validation
  if (!Array.isArray(emailIds)) {
    return res.status(400).json({
      success: false,
      message: "emailsIds array is required!",
    });
  }
  if (emailIds?.length === 0) {
    return res.status(400).json({
      success: false,
      message: "emailsIds is required!",
    });
  }

  //Check only valid objectId (avoid DB Error)
  const validIds = [...new Set(emailIds)]?.filter(isValidObjectId);

  //Fetch Emails
  const emails = await Email.find({
    _id: { $in: validIds },
    userId,
    status: { $ne: "ReadResponded" },
  }).lean();

  if (!emails?.length) {
    return res.status(404).json({
      success: false,
      message: "No emails found to send (or all already responded)!",
    });
  }

  //Group by mailboxId
  const byMailbox = new Map();
  for (const e of emails) {
    const mbId = String(e.mailBoxId);
    if (!mbId) continue;
    if (!byMailbox.has(mbId)) byMailbox.set(mbId, []);
    byMailbox.get(mbId).push(e);
  }

  // Load All Eamils
  const mailboxIds = [...byMailbox.keys()]?.filter(isValidObjectId);
  const mailboxes = await Mailbox.find({
    _id: { $in: mailboxIds },
    userId,
    isActive: true,
    isDeleted: { $ne: true },
  }).lean();

  const mailboxMap = new Map(mailboxes?.map((m) => [String(m._id), m]));

  //.........results..........
  const results = [];
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  console.log(mailboxMap, "mailboxMapmailboxMap");

  for (const [mailboxId, list] of byMailbox.entries()) {
    const mailbox = mailboxMap.get(String(mailboxId));

    if (!mailbox) {
      // mailbox missing/inactive ==> fails all emials in that group
      for (const e of list) {
        results.push({
          emailId: e._id,
          ok: false,
          error: "Mailbox not found or inactive",
        });
      }
      continue;
    }

    // create taranspoter once per mailbox
    let transporter;

    try {
      const appPassword = decryptWithPin(
        process.env.APP_PASSWORD_ENC_DEC,
        mailbox.appPassword,
      );

      transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: mailbox.emailId,
          pass: appPassword,
        },
      });
    } catch (error) {
      for (const e of list) {
        results.push({ emailId: e._id, ok: false, error: "SMTP auth failed" });
        failCount++;

        await Email.updateOne(
          { _id: e._id, userId },
          {
            $set: {
              sendError: "SMPT auth failed",
            },
          },
        );
      }
      continue;
    }

    //Send Each email
    for (const e of list) {
      try {
        const to = e.fromEmail;

        if (!to) {
          results.push({
            emailId: e._id,
            ok: false,
            error: "Recipient missing in Email (fromEmail)",
          });
          failCount++;
          await Email.updateOne(
            { _id: e._id, userId },
            { $set: { sendError: "Recipient missing in Email (fromEmail)" } },
          );
          continue;
        }

        await transporter.sendMail({
          from: mailbox.emailId,
          to,
          subject: `Re: ${e.subject || ""}`,
          html: defaultResponseBody,
        });

        await Email.updateOne(
          { _id: e._id, userId },
          {
            $set: {
              status: "ReadResponded",
              sentAt: new Date(),
              sendError: "",
            },
          },
        );
        results.push({ emailId: e._id, ok: true });
        successCount++;
      } catch (err) {
        const msg = err?.message || "Send failed";

        await Email.updateOne(
          { _id: e._id, userId },
          { $set: { sendError: msg } },
        );

        results.push({ emailId: e._id, ok: false, error: msg });
        failCount++;
      }
    }
  }
  return res.status(200).json({
    success: true,
    message: "Bulk send completed.",
    summary: {
      requested: validIds.length,
      found: emails.length,
      successCount,
      failCount,
      skippedCount,
    },
    results, // per-email status (partial failure support)
  });
});

//.........POST-> BULK SEND EMAIL WITH PROGRESS BAR
export const StartBulkSend = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { emailIds, responseBody } = req.body;

  const job = await BulkJob.create({
    userId,
    type: "BULK_SEND",
    total: emailIds.length,
    status: "QUEUED",
  });

  // start asyncing...........(non-blocking)

  runBulkSendJob({
    jobId: job._id,
    userId,
    emailIds,
    responseBody,
  }).catch(() => {});

  return res.status(202).json({
    success: true,
    message: "Bulk send started",
    jobId: job._id,
  });
});

export const GetJobProgress = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user?.id;

  const job = await BulkJob.findOne({ _id: jobId, userId });
  if (!job) {
    return res.status(404).json({ success: false, message: "Job not found!" });
  }

  const percent = job.total ? Math.round((job.processed / job.total) * 100) : 0;

  return res.status(200).json({
    success: true,
    job: {
      jobId: job._id,
      status: job.status,
      total: job.total,
      processed: job.processed,
      success: job.success,
      failed: job.failed,
      percent,
      lastError: job.lastError,
    },
  });
});

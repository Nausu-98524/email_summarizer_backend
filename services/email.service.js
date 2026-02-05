import Email from "../models/email.model.js";
import BulkJob from "../models/jobbulk.model.js";
import Mailbox from "../models/mailbox.model.js";
import { decryptWithPin } from "./helper.service.js";
import nodemailer from "nodemailer";

async function sendSingleEmail(emailId, userId, defaultResponseBody) {
  const email = await Email.findOne({ _id: emailId, userId });
  if (!email) throw new Error("Email not found");

  if (email.status === "ReadResponded") {
    throw new Error("Email already responded");
  }

  const mailbox = await Mailbox.findOne({
    _id: email.mailBoxId,
    userId,
    isActive: true,
    isDeleted: { $ne: true },
  });

  if (!mailbox) {
    throw new Error("Mailbox not found or inactive");
  }

  const appPassword = decryptWithPin(
    process.env.APP_PASSWORD_ENC_DEC,
    mailbox.appPassword,
  );

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: mailbox.emailId,
      pass: appPassword,
    },
  });

  await transporter.sendMail({
    from: mailbox.emailId,
    to: email.fromEmail,
    subject: `Re: ${email.subject || ""}`,
    html: defaultResponseBody,
  });

  await Email.updateOne(
    { _id: emailId },
    {
      $set: {
        status: "ReadResponded",
        sentAt: new Date(),
        sendError: "",
      },
    },
  );
}

export async function runBulkSendJob({
  jobId,
  userId,
  emailIds,
  responseBody,
}) {
  await BulkJob.updateOne({ _id: jobId }, { $set: { status: "RUNNING" } });

  let processed = 0,
    success = 0,
    failed = 0;

  //Bulk send loop
  for (const emailId of emailIds) {
    processed++;
    try {
      //send...
      await sendSingleEmail(emailId, userId, responseBody);
      success++;
      await BulkJob.updateOne(
        { _id: jobId },
        {
          $set: { processed, success, failed },
          $push: {
            results: {
              emailId,
              ok: true,
            },
          },
        },
      );
    } catch (e) {
      failed++;
      await BulkJob.updateOne(
        { _id: jobId },
        {
          $set: { processed, success, failed, lastError: e.message || "" },
          $push: { results: { emailId, ok: false, error: e.message } },
        },
      );
    }
  }
  await BulkJob.updateOne({ _id: jobId }, { $set: { status: "DONE" } });
}

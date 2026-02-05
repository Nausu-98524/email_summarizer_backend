import mongoose from "mongoose";

const emailSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    mailBoxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mailbox",
      index: true,
      required: true,
    },
    mailBoxEmailId: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    nickName: {
      type: String,
      required: true,
      trim: true,
    },
    // IMAP UID or Message-ID to uniquely identify the email
    messageId: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      trim: true,
    },
    messageBody: {
      type: String,
      default: "",
    },
    responseBody: {
      type: String,
      default: "",
    },
    aiSummary: {
      type: String,
      default: "",
    },
    fromEmail: {
      type: String,
    },
    fromName: {
      type: String,
    },
    status: {
      type: String,
      enum: ["Unread", "DraftSaved", "ReadResponded"],
      default: "Unread",
      index: true,
    },
    savedDraftAt: {
      type: Date,
    },
    receivedAt: {
      type: Date,
      index: true,
    },
    sentAt: {
      type: Date,
    },
    sendError: {
      type: String,
    },
  },
  { timestamps: true },
);

// Prevent duplicates during repeated syncs
emailSchema.index({ mailBoxId: 1, messageId: 1 }, { unique: true });

// For Fast dashboard Queries
emailSchema.index({ userId: 1, status: 1, receivedAt: -1 });

const Email = mongoose.model("Email", emailSchema);
export default Email;

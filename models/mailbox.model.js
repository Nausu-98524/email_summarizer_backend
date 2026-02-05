import mongoose from "mongoose";

const mailboxSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    emailId: {
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
    appPassword: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    lastSyncAt: {
      type: Date,
    },
    lastSyncStatus: {
      type: String,
    },
    lastSyncError: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

mailboxSchema.index({ userId: 1, isActive: 1, updatedAt: -1 });

const Mailbox = mongoose.model("Mailbox", mailboxSchema);
export default Mailbox;

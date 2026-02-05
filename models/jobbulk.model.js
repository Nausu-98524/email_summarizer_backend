import mongoose from "mongoose";

const jobBulkSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    type: {
      type: String,
      enum: ["BULK_SEND"],
      required: true,
    },

    total: {
      type: Number,
      default: 0,
    },
    processed: {
      type: Number,
      default: 0,
    },
    success: {
      type: Number,
      default: 0,
    },
    failed: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["QUEUED", "RUNNING", "DONE", "FAILED"],
      default: "QUEUED",
    },
    lastError: {
      type: String,
      default: "",
    },

    results: [
      {
        emailId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Email",
        },
        ok: Boolean,
        error: String,
      },
    ],
  },
  { timestamps: true },
);

const BulkJob = mongoose.model("BulkJob", jobBulkSchema);
export default BulkJob;

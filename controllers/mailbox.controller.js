import mongoose from "mongoose";
import { asyncHandler } from "../middlewares/error.handler.js";
import Mailbox from "../models/mailbox.model.js";
import { decryptWithPin, encryptWithPin } from "../services/helper.service.js";
import { ImapCheck } from "../services/imaptest.service.js";

export const AddMailbox = asyncHandler(async (req, res) => {
  const {
    emailId,
    appPassword,
    nickName,
    isVerified,
    isActive = false,
  } = req.body;

  if (!emailId || emailId.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Email ID is required!",
    });
  }
  if (!appPassword || appPassword.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "App Password is required!",
    });
  }
  if (!nickName || nickName.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Nick Name is required!",
    });
  }

  const existingMailbox = await Mailbox.findOne({
    emailId: emailId.toLowerCase(),
    isDeleted : false
  });
  if (existingMailbox) {
    return res.status(409).json({
      success: false,
      message: "Mailbox with this Email ID already exists!",
    });
  }

  const checkImap = await ImapCheck(emailId, appPassword);

  if (!checkImap) {
    return res.status(400).json({
      success: false,
      message: "Invalid Email ID or App Password",
    });
  }

  const encryptAppPassword = encryptWithPin(
    process.env.APP_PASSWORD_ENC_DEC,
    appPassword,
  );

  const newMailbox = new Mailbox({
    userId: req.user.id,
    emailId: emailId.toLowerCase(),
    appPassword: encryptAppPassword,
    nickName,
    isActive,
    isVerified,
  });

  await newMailbox.save();
  const responseMailbox = newMailbox.toObject();
  delete responseMailbox.appPassword;
  return res.status(201).json({
    success: true,
    message: "Mailbox added successfully!",
    mailbox: responseMailbox,
  });
});

export const UpdateMailbox = asyncHandler(async (req, res) => {
  const { mailboxId } = req.params;
  const { emailId, nickName, isActive } = req.body;

  if (!emailId || emailId.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Email ID is required!",
    });
  }
  if (!nickName || nickName.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Nick Name is required!",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(mailboxId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid mailboxId!",
    });
  }

  const updateData = {};
  if (emailId) updateData.emailId = emailId.toLowerCase();
  // if (appPassword) updateData.appPassword = await bcrypt.hash(appPassword, 10);
  if (nickName) updateData.nickName = nickName;
  if (isActive !== undefined) updateData.isActive = isActive;

  const mailbox = await Mailbox.findOneAndUpdate(
    { _id: mailboxId, userId: req.user.id },
    updateData,
    { new: true },
  );

  if (!mailbox) {
    return res.status(404).json({
      success: false,
      message: "Mailbox not found!",
    });
  }
  const responseMailbox = mailbox.toObject();
  delete responseMailbox.appPassword;
  return res.status(200).json({
    success: true,
    message: "Mailbox updated successfully!",
    mailbox: responseMailbox,
  });
});

export const GetMailboxes = asyncHandler(async (req, res) => {
  // Query Params
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limitRaw = parseInt(req.query.limit || "20", 10);
  const limit = Math.min(Math.max(limitRaw, 1), 100);
  const skip = (page - 1) * limit;

  const search = (req.query.search || "").toString().trim();
  const isActiveParam = req.query.isActive;

  // Sorting
  const sortBy = (req.query.sortBy || "updatedAt").toString();
  const sortOrder =
    (req.query.sortOrder || "desc").toString().toLowerCase() === "asc" ? 1 : -1;

  //Filtering
  const filter = { userId: req.user.id, isDeleted: false };
  if (isActiveParam === "true") filter.isActive = true;
  if (isActiveParam === "false") filter.isActive = false;

  if (search) {
    filter.$or = [
      { nickName: { $regex: search, $options: "i" } },
      { emailId: { $regex: search, $options: "i" } },
    ];
  }

  // Allowlist sorting fields only
  const allowedSortFields = new Set([
    "createdAt",
    "updatedAt",
    "lastSyncAt",
    "nickname",
    "emailId",
  ]);
  const safeSortBy = allowedSortFields.has(sortBy) ? sortBy : "createdAt";

  const [mailboxes, total] = await Promise.all([
    Mailbox.find(filter)
      .sort({ [safeSortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    Mailbox.countDocuments(filter),
  ]);

  // Mask password for UI (10 stars)
  const maskedMailboxes = mailboxes.map((mb) => ({
    ...mb,
    appPassword: "**** **** **** *****",
  }));

  return res.status(200).json({
    success: true,
    message: "Mailboxes retrieved successfully!",
    mailboxes: maskedMailboxes,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: skip + mailboxes.length < total,
      hasPrev: page > 1,
    },
    filters: {
      search: search || null,
      isActive: isActiveParam ?? null,
      sortBy: safeSortBy,
      sortOrder: sortOrder === 1 ? "asc" : "desc",
    },
  });
});

export const DeleteMailbox = asyncHandler(async (req, res) => {
  const { mailboxId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(mailboxId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid mailboxId!",
    });
  }
  const mailbox = await Mailbox.findOneAndDelete(
    {
      _id: mailboxId,
      userId: req.user.id,
    }
  );

  if (!mailbox) {
    return res.status(404).json({
      success: false,
      message: "Mailbox not found!",
    });
  }
  return res.status(200).json({
    success: true,
    message: "Mailbox deleted successfully!",
  });
});

export const ShowDecryptedAppPassword = asyncHandler(async (req, res) => {
  const { mailboxId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(mailboxId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid mailboxId!",
    });
  }

  const mailbox = await Mailbox.findOne({
    _id: mailboxId,
    userId: req.user.id,
  }).lean();

  if (!mailbox) {
    return res.status(404).json({
      success: false,
      message: "Mailbox not found!",
    });
  }
  const appPasswordDec = decryptWithPin(
    process.env.APP_PASSWORD_ENC_DEC,
    mailbox.appPassword,
  );
  return res.status(200).json({
    success: true,
    message: "Mailbox password retrieved successfully!",
    appPassword: appPasswordDec,
  });
});

export const VerifyImapAppPassword = asyncHandler(async (req, res) => {
  const { emailId, appPassword } = req.body;

  if (!emailId || emailId.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Email ID is required!",
    });
  }
  if (!appPassword || appPassword.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "App Password is required!",
    });
  }

  const checkImap = await ImapCheck(emailId, appPassword);

  if (checkImap) {
    return res.status(200).json({
      success: true,
      message: "App Password Verify successfully",
    });
  } else {
    return res.status(400).json({
      success: false,
      message: "Invalid Email Id or App Password",
    });
  }
});

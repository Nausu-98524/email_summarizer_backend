import crypto from "crypto";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

// ..........Genrate Access Token Start............

export const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET_KEY, {
    expiresIn: "1d",
  });
};
// ..........Validate Mongodb ID............

export const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// ..........Encrypt Decrypt Text Start............

const ALGO = "aes-256-gcm";

function deriveKey(APP_PASSWORD_ENC_DEC, salt) {
  if (typeof APP_PASSWORD_ENC_DEC !== "string")
    throw new Error("PIN must be a string");
  const clean = APP_PASSWORD_ENC_DEC.trim();

  return crypto.pbkdf2Sync(clean, salt, 150000, 32, "sha256");
}

export function encryptWithPin(APP_PASSWORD_ENC_DEC, plainText) {
  if (typeof plainText !== "string" || !plainText.length) {
    throw new Error("plainText must be a non-empty string");
  }

  const salt = crypto.randomBytes(16);
  const key = deriveKey(APP_PASSWORD_ENC_DEC, salt);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    salt.toString("base64"),
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptWithPin(APP_PASSWORD_ENC_DEC, payload) {
  if (typeof payload !== "string") throw new Error("payload must be a string");

  const parts = payload.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid payload format. Expected salt:iv:tag:cipher");
  }

  const [saltB64, ivB64, tagB64, dataB64] = parts;

  const salt = Buffer.from(saltB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const key = deriveKey(APP_PASSWORD_ENC_DEC, salt);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

// ..........Encrypt Decrypt Text End............

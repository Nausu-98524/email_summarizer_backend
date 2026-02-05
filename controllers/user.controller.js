import { asyncHandler } from "../middlewares/error.handler.js";
import User from "../models/user.model.js";


export const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select("-password");
  return res.status(200).json({
    success: true,
    message: "Users retrieved successfully!",
    users,
  });
});
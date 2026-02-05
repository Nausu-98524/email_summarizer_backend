import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { asyncHandler } from "../middlewares/error.handler.js";
import User from "../models/user.model.js";
import { generateAccessToken } from "../services/helper.service.js";


export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate required fields
  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required!",
    });
  }

  if (!password) {
    return res.status(400).json({
      success: false,
      message: "Password is required!",
    });
  }

  // Find user by email
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid Credentials!",
    });
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      message: "Invalid Credentials!",
    });
  }

  // Check if user is active
  if (!user.isActive) {
    return res.status(403).json({
      success: false,
      message: "User account is not active, Please connect with admin!",
    });
  }

  // Generate token
  const token = generateAccessToken(user._id);

  // Save token to database
  user.token = token;
  await user.save();

  return res.status(200).json({
    success: true,
    message: "Login successful!",
    token,
    user: {
      id: user._id,
      userName: user.userName,
      email: user.email,
      role: user.role,
    },
  });
});

export const register = asyncHandler(async (req, res) => {
  const { userName, email, password, confirmPassword } = req.body;

  // Validate required fields
  if (!userName || !email || !password || !confirmPassword) {
    return APIResponse({
      res,
      success: false,
      status: 400,
      message: "All fields are required!",
    });
  }

  // Validate password match
  if (password !== confirmPassword) {
    return APIResponse({
      res,
      success: false,
      status: 400,
      message: "Passwords do not match!",
    });
  }

  // Validate password strength
  if (password.length < 8) {
    return APIResponse({
      res,
      success: false,
      status: 400,
      message: "Password must be at least 8 characters long!",
    });
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return APIResponse({
      res,
      success: false,
      status: 409,
      message: "Email already registered!",
    });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create new user
  const newUser = new User({
    userName,
    email,
    password: hashedPassword,
  });

  await newUser.save();

  // Generate token
  const token = generateAccessToken(newUser._id);

  return APIResponse({
    res,
    success: true,
    status: 201,
    message: "User registered successfully!",
    data: {
      token,
      user: {
        id: newUser._id,
        userName: newUser.userName,
        email: newUser.email,
        role: newUser.role,
      },
    },
  });
});

export const logout = asyncHandler(async (req, res) => {
  // Get user ID from token in request header
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No token provided!",
    });
  }

  // Find user and clear token from database
  const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
  const user = await User.findById(decoded.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found!",
    });
  }
  if (!user.token) {
    return res.status(400).json({
      success: false,
      message: "User already logged out!",
    });
  }

  // Expire token by removing it from database
  user.token = null;
  await user.save();

  return res.status(200).json({
    success: true,
    message: "Logout successfully!",
  });
});

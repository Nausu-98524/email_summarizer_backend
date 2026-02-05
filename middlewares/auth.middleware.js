import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

export default async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send({
        success: false,
        message: "No token provided or invalid format",
      });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, process.env.JWT_SECRET_KEY, async (err, decoded) => {
      if (err) {
        return res.status(401).send({
          success: false,
          message: "Token Expires",
        });
      }

      const user = await User.findById(decoded.id);
      if (!user || user.token !== token) {
        return res.status(401).json({
          success: false,
          message: "Token Expires",
        });
      }

      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    return res.status(401).send({
      success: false,
      message: "Un-Authorized",
    });
  }
};

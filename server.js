import express from "express";
import dotenv from "dotenv";
import { configureCors } from "./config/cors.config.js";
import connectDB from "./db/db.js";
import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import mailboxRoutes from "./routes/mailbox.route.js";
import emailRoutes from "./routes/email.route.js";


dotenv.config();
connectDB();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(configureCors());
app.use(express.json());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/mailbox", mailboxRoutes);
app.use("/api/v1/emails", emailRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

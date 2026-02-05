import express from "express";
import { getAllUsers } from "../controllers/user.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const routes = express.Router();

routes.post("/get-all-users",authMiddleware, getAllUsers);


export default routes;
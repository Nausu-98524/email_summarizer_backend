import express from "express";
import { login, logout, register } from "../controllers/auth.controller.js";

const routes = express.Router();

routes.post("/login", login);
routes.post("/register", register);
routes.post("/logout", logout);

export default routes;
//routess.js
const express = require("express");

const {
  signup,
  login,
  authenticate,
  getMe,
  logout,
} = require("../controller/userController");

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);

router.get("/me", authenticate, getMe);
router.post("/logout", authenticate, logout);

module.exports = router;

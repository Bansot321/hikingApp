
const express = require("express");

const {
  signup,
  login,
  authenticate,
  getMe,
  updateMe,
  changePassword,
  logout,
} = require("../controller/userController");

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);

router.get("/me", authenticate, getMe);
router.put("/me", authenticate, updateMe);
router.put("/me/password", authenticate, changePassword);

router.post("/logout", authenticate, logout);

module.exports = router;

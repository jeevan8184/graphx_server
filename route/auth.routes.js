const express = require("express");
const router = express.Router();
const passport = require("passport");
const {
  login,
  googleAuth,
  googleCallback,
  logout,
  authStatus,
} = require("../controllers/auth.controller");

// Local authentication
router.post("/login", passport.authenticate("local"), login);

// Google authentication
router.get("/google", googleAuth);
router.get("/google/callback", passport.authenticate("google"), googleCallback);

// Logout
router.post("/logout", logout);

// Auth status
router.get("/status", authStatus);

module.exports = router;

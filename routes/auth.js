import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/User.js";
dotenv.config();
const router = express.Router();

const getFrontendUrl =
  process.env?.NODE_ENV === "production"
    ? process.env?.FRONTEND_LIVE_URL ||
      "https://email-ai-chat-bot-server.vercel.app"
    : process.env?.FRONTEND_BASE_URL ||
      "https://email-ai-chat-bot-server.vercel.app";

// JWT Authentication Middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error("JWT verification failed:", err.message);
      } else {
        req.user = decoded;
        return next();
      }
    });
  }

  // Check if user is authenticated via session as fallback
  if (req.isAuthenticated()) {
    return next();
  } else {
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated" });
  }
};

// Google OAuth login route
router.get(
  "/google",
  (req, res, next) => {
    next();
  },
  passport.authenticate("google", {
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
  })
);

// Google OAuth callback route
router.get(
  "/google/callback",
  (req, res, next) => {
    next();
  },
  passport.authenticate("google", {
    failureRedirect: `${getFrontendUrl}/login`,
    session: true,
  }),
  (req, res) => {
    // Generate JWT token
    const token = jwt.sign(
      {
        id: req.user._id,
        email: req.user.email,
        hasGoogleAuth: !!req.user.googleAccessToken,
        hasMicrosoftAuth: !!req.user.microsoftAccessToken,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Redirect to frontend with token
    res.redirect(`${getFrontendUrl}/auth-callback?token=${token}`);
  }
);

// Microsoft OAuth login route
router.get(
  "/microsoft",
  (req, res, next) => {
    next();
  },
  passport.authenticate("microsoft", {
    prompt: "select_account",
  })
);

// Microsoft OAuth callback route
router.get(
  "/microsoft/callback",
  (req, res, next) => {
    next();
  },
  passport.authenticate("microsoft", {
    failureRedirect: `${getFrontendUrl}/login`,
    session: true,
  }),
  (req, res) => {
    // Generate JWT token
    const token = jwt.sign(
      { id: req.user._id, email: req.user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Redirect to frontend with token
    res.redirect(`${getFrontendUrl}/auth-callback?token=${token}`);
  }
);

// Get current user - now uses JWT authentication middleware
router.get("/me", authenticateJWT, (req, res) => {
  // If we get here, the user is authenticated either by JWT or session
  return res.status(200).json({
    success: true,
    user: {
      id: req.user._id || req.user.id,
      name: req.user.name,
      email: req.user.email,
      authProvider: req.user.authProvider,
      microsoftAccessToken: req.user?.microsoftAccessToken
        ? req.user.microsoftAccessToken.slice(0, 10)
        : "",
      googleAccessToken: req.user.googleAccessToken
        ? req.user.googleAccessToken.slice(0, 10)
        : "",
    },
  });
});

// Logout route
router.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: "Logout failed" });
    }
    res.status(200).json({ success: true, message: "Logged out successfully" });
  });
});

export default router;

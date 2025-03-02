import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

const getFrontendUrl =
  process.env?.NODE_ENV === "production"
    ? process.env?.FRONTEND_LIVE_URL
    : process.env?.FRONTEND_BASE_URL ||
      "https://email-ai-chat-bot-server.vercel.app/";

// Google OAuth login route
router.get(
  "/google",
  (req, res, next) => {
    console.log("Starting Google OAuth flow");
    console.log("Redirect URI:", process.env.GOOGLE_REDIRECT_URI);
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
    console.log("Google callback received");
    next();
  },
  passport.authenticate("google", {
    failureRedirect: `${getFrontendUrl}/login`,
    session: true,
  }),
  (req, res) => {
    console.log("Google authentication successful");
    console.log("User:", req.user ? req.user.email : "No user");
    console.log(
      "User token:",
      req.user ? req.user.microsoftAccessToken : "No user"
    );

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

// Microsoft OAuth login route
router.get(
  "/microsoft",
  (req, res, next) => {
    console.log("Starting Microsoft OAuth flow");
    console.log("Redirect URI:", process.env.MICROSOFT_REDIRECT_URI);
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
    console.log("Microsoft callback received");
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

// Get current user
router.get("/me", (req, res) => {
  console.log("Auth check - isAuthenticated:", req.isAuthenticated());
  console.log("Auth check - user:", req.user ? req.user.email : "No user");

  if (!req.user) {
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated" });
  }

  if (req.user) {
    return res.status(200).json({
      success: true,
      user: {
        id: req.user._id,
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
  }
  return res.status(401).json({ success: false, message: "Not authenticated" });
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

import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/User";

dotenv.config();
const router = express.Router();

const getFrontendUrl =
  process.env?.NODE_ENV === "production"
    ? process.env?.FRONTEND_LIVE_URL || "https://email-aichatbot.netlify.app"
    : process.env?.FRONTEND_BASE_URL || "https://email-aichatbot.netlify.app";

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
      { expiresIn: "7d" }
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
      { expiresIn: "7d" }
    );

    // Redirect to frontend with token
    res.redirect(`${getFrontendUrl}/auth-callback?token=${token}`);
  }
);

// Get current user
router.get("/me", async (req, res) => {
  console.log("Auth check - isAuthenticated:", req.isAuthenticated());

  // Check if token exists in Authorization header
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated" });
  }

  try {
    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        microsoftAccessToken: req.user?.microsoftAccessToken
          ? req.user.microsoftAccessToken.slice(0, 10)
          : "",
        googleAccessToken: req.user.googleAccessToken
          ? req.user.googleAccessToken.slice(0, 10)
          : "",
      },
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
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

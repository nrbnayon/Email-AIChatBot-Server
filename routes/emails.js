// routes\emails.js
import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";

dotenv.config();
const router = express.Router();

// Updated middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  // Check for JWT in Authorization header
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.log("JWT verification failed:", err.message);
      } else {
        console.log("JWT verification successful for user ID:", decoded.id);
        req.user = decoded;
        return next();
      }
    });
  }

  // Fallback to session authentication if JWT auth failed
  if (req.isAuthenticated()) {
    return next();
  }

  return res.status(401).json({ success: false, message: "Not authenticated" });
};

// Get Gmail emails from the last 2 months
router.get("/gmail", isAuthenticated, async (req, res) => {
  try {
    console.log("Fetching Gmail emails");
    console.log("User info:", req.user);

    // Check if user has Google authentication
    if (!req.user.googleAccessToken) {
      return res.status(400).json({
        success: false,
        message: "Google authentication required",
      });
    }

    // Rest of your existing code...
    // ...
  } catch (error) {
    console.error("Error fetching Gmail emails:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch emails",
      error: error.message,
    });
  }
});

// Get Outlook emails from the last 2 months
router.get("/outlook", isAuthenticated, async (req, res) => {
  try {
    console.log("Fetching Outlook emails");

    // Check if user has Microsoft authentication
    if (!req.user.microsoftAccessToken) {
      return res.status(400).json({
        success: false,
        message: "Microsoft authentication required",
      });
    }

    // Calculate date 2 months ago
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const formattedDate = twoMonthsAgo.toISOString();

    // Microsoft Graph API endpoint for emails
    const endpoint = `https://graph.microsoft.com/v1.0/me/messages?$filter=receivedDateTime ge ${formattedDate}&$top=100&$select=id,subject,bodyPreview,receivedDateTime,from,toRecipients,body`;

    console.log("Fetching messages from Microsoft Graph API");
    console.log("Using filter date:", formattedDate);

    // Fetch emails from Microsoft Graph API
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${req.user.microsoftAccessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Microsoft Graph API error:", errorData);
      throw new Error(
        `Microsoft API error: ${errorData.error?.message || "Unknown error"}`
      );
    }

    const data = await response.json();
    console.log(`Found ${data.value?.length || 0} messages from Outlook`);

    if (!data.value || data.value.length === 0) {
      return res.status(200).json({
        success: true,
        emails: [],
      });
    }

    // Process emails
    const emails = data.value.map((message) => {
      try {
        // Extract sender information
        const sender = message.from?.emailAddress?.name
          ? `${message.from.emailAddress.name} <${message.from.emailAddress.address}>`
          : message.from?.emailAddress?.address || "Unknown sender";

        // Extract recipient information
        const recipients =
          message.toRecipients
            ?.map(
              (recipient) =>
                recipient.emailAddress?.address || "Unknown recipient"
            )
            .join(", ") || "Unknown recipient";

        // Extract body content (prefer HTML content if available)
        const bodyContent = message.body?.content || message.bodyPreview || "";

        return {
          id: message.id,
          threadId: message.conversationId || message.id,
          date: message.receivedDateTime,
          from: sender,
          to: recipients,
          subject: message.subject || "(No Subject)",
          snippet: message.bodyPreview || "",
          body: bodyContent.substring(0, 2000), // Limit body size to prevent payload issues
        };
      } catch (error) {
        console.error(`Error processing Outlook message ${message.id}:`, error);
        return {
          id: message.id || "unknown",
          date: message.receivedDateTime || new Date().toISOString(),
          from: "Error retrieving email",
          to: "",
          subject: "Error retrieving email",
          snippet: "There was an error retrieving this email.",
          body: "",
        };
      }
    });

    console.log(`Successfully processed ${emails.length} Outlook emails`);

    return res.status(200).json({
      success: true,
      emails,
    });
  } catch (error) {
    console.error("Error fetching Outlook emails:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch emails",
      error: error.message,
    });
  }
});

export default router;

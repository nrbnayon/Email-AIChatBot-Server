// routes\emails.js
import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

dotenv.config();
const router = express.Router();

const isAuthenticated = (req, res, next) => {
  // Check for JWT in Authorization header
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Use the decoded ID to find the user
      User.findById(decoded.id)
        .then((user) => {
          if (!user) {
            return res
              .status(401)
              .json({ success: false, message: "User not found" });
          }

          // Set the complete user object with all tokens to req.user
          req.user = user;
          return next();
        })
        .catch((err) => {
          console.error("Error fetching user from database:", err);
          return res
            .status(500)
            .json({ success: false, message: "Authentication error" });
        });
    } catch (err) {
      // Check if user is authenticated via session as fallback
      if (req.isAuthenticated()) {
        return next();
      } else {
        return res
          .status(401)
          .json({ success: false, message: "Invalid authentication token" });
      }
    }
  } else {
    // No Bearer token, check session authentication
    if (req.isAuthenticated()) {
      return next();
    } else {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }
  }
};

// Get Gmail emails from the last 2 months
router.get("/gmail", isAuthenticated, async (req, res) => {
  try {
    // Check if user has Google authentication
    if (req.user.hasGoogleAuth === false) {
      return res.status(400).json({
        success: false,
        message: "Google authentication required",
      });
    }

    // Now fetch the complete user record with tokens
    const user = await User.findById(req.user.id);
    if (!user || !user.googleAccessToken) {
      return res.status(400).json({
        success: false,
        message: "Google authentication required",
      });
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Set credentials
    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
    });

    // Create Gmail API client
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Calculate date 2 months ago in the proper format for Gmail API
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    // Format the date for Gmail query (YYYY/MM/DD)
    const year = twoMonthsAgo.getFullYear();
    const month = String(twoMonthsAgo.getMonth() + 1).padStart(2, "0");
    const day = String(twoMonthsAgo.getDate()).padStart(2, "0");
    const formattedDate = `${year}/${month}/${day}`;
    const query = `after:${formattedDate}`;

    // Get list of messages
    const { data } = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 150,
    });

    if (!data.messages || data.messages.length === 0) {
      return res.status(200).json({
        success: true,
        emails: [],
      });
    }

    // Get details for each message with proper error handling
    const emails = await Promise.all(
      data.messages.map(async (message) => {
        try {
          const response = await gmail.users.messages.get({
            userId: "me",
            id: message.id,
            format: "full",
          });

          const { payload, snippet, internalDate } = response.data;

          // Extract headers
          const headers = {};
          payload.headers.forEach((header) => {
            headers[header.name.toLowerCase()] = header.value;
          });

          // Extract body content with better error handling
          let body = "";

          // Function to decode base64 content safely
          const decodeBase64 = (data) => {
            try {
              if (!data) return "";
              return Buffer.from(data, "base64").toString("utf-8");
            } catch (error) {
              console.log(
                `Error decoding base64 for message ${message.id}:`,
                error
              );
              return "";
            }
          };

          // Handle multipart messages
          if (payload.parts && payload.parts.length > 0) {
            // Try to find plain text first, then HTML
            const textPart = payload.parts.find(
              (part) => part.mimeType === "text/plain"
            );
            const htmlPart = payload.parts.find(
              (part) => part.mimeType === "text/html"
            );

            if (textPart && textPart.body && textPart.body.data) {
              body = decodeBase64(textPart.body.data);
            } else if (htmlPart && htmlPart.body && htmlPart.body.data) {
              body = decodeBase64(htmlPart.body.data);
            } else {
              // Try nested parts if available
              for (const part of payload.parts) {
                if (part.parts) {
                  const nestedTextPart = part.parts.find(
                    (p) => p.mimeType === "text/plain"
                  );
                  const nestedHtmlPart = part.parts.find(
                    (p) => p.mimeType === "text/html"
                  );

                  if (
                    nestedTextPart &&
                    nestedTextPart.body &&
                    nestedTextPart.body.data
                  ) {
                    body = decodeBase64(nestedTextPart.body.data);
                    break;
                  } else if (
                    nestedHtmlPart &&
                    nestedHtmlPart.body &&
                    nestedHtmlPart.body.data
                  ) {
                    body = decodeBase64(nestedHtmlPart.body.data);
                    break;
                  }
                }
              }
            }
          } else if (payload.body && payload.body.data) {
            body = decodeBase64(payload.body.data);
          }

          return {
            id: message.id,
            threadId: response.data.threadId,
            date: new Date(parseInt(internalDate)).toISOString(),
            from: headers.from || "",
            to: headers.to || "",
            subject: headers.subject || "(No Subject)",
            snippet,
            body: body.substring(0, 2000), // Limit body size to prevent payload issues
          };
        } catch (error) {
          console.error(`Error processing message ${message.id}:`, error);
          // Return minimal information for failed messages
          return {
            id: message.id,
            date: new Date().toISOString(),
            from: "Error retrieving email",
            to: "",
            subject: "Error retrieving email",
            snippet: "There was an error retrieving this email.",
            body: "",
          };
        }
      })
    );

    return res.status(200).json({
      success: true,
      emails,
    });
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
          body: bodyContent.substring(0, 2000), 
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

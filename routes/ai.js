import express from "express";
import { Groq } from "groq-sdk";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

dotenv.config();
const router = express.Router();

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Available AI models
const AVAILABLE_MODELS = [
  {
    id: "llama3-70b-8192",
    name: "Llama 3 70B",
    developer: "Meta",
    contextWindow: "8K tokens",
  },
  {
    id: "llama3-8b-8192",
    name: "Llama 3 8B",
    developer: "Meta",
    contextWindow: "8K tokens",
  },
  {
    id: "llama-3.1-8b-instant",
    name: "Llama 3.1 8B Instant",
    developer: "Meta",
    contextWindow: "128K tokens",
  },
  {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B Versatile",
    developer: "Meta",
    contextWindow: "128K tokens",
  },
];

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

// Get available AI models
router.get("/models", isAuthenticated, (req, res) => {
  return res.status(200).json({
    success: true,
    models: AVAILABLE_MODELS,
  });
});

// Process user query with AI
router.post("/query", isAuthenticated, async (req, res) => {
  try {
    const { query, emails, model = "llama-3.1-8b-instant" } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Query is required",
      });
    }

    // Check if model is valid
    if (!AVAILABLE_MODELS.some((m) => m.id === model)) {
      return res.status(400).json({
        success: false,
        message: "Invalid model selected",
      });
    }

    // Check if emails exist and handle empty arrays properly
    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({
        success: false,
        message: "Emails data must be an array",
      });
    }

    // Prepare email data for AI processing - only include essential information and limit size
    const emailsData = emails.map((email) => ({
      id: email.id || "unknown",
      date: email.date || new Date().toISOString(),
      from: email.from || "unknown",
      to: email.to || "unknown",
      subject: email.subject || "No subject",
      snippet: email.snippet || "",
      // Don't include full body, just use snippet to reduce payload size
    }));

    // Get details of up to 10 most recent emails for deeper context
    const recentEmailDetails = emails.slice(0, 10).map((email) => ({
      subject: email.subject || "No subject",
      from: email.from || "unknown",
      date: email.date || new Date().toISOString(),
      snippet: email.snippet || "",
      bodyExcerpt:
        (email.body || "").substring(0, 500) +
        (email.body && email.body.length > 500 ? "..." : ""),
    }));

    // Create a system message with instructions
    const systemMessage = `
      You are an AI assistant that analyzes email data to answer user queries.
      You have access to the user's emails from the past 2 months.
      Analyze the email data provided and answer the user's question accurately.
      If you cannot find the answer in the provided emails, say so clearly.
      Do not make up information.
      Be concise but thorough in your responses.
    `;

    // Create a prompt with email data - handle large datasets better
    const userMessage = `
      Here is a summary of my recent emails (${emailsData.length} total):
      ${JSON.stringify(emailsData.slice(0, 20))} ${
      emailsData.length > 20 ? "... and more" : ""
    }
      
      Here are more details on my 10 most recent emails:
      ${JSON.stringify(recentEmailDetails)}
      
      My question is: ${query}
    `;

    // Call Groq API with the selected model
    const completion = await groq.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
      temperature: 0.5,
      max_tokens: 800,
      top_p: 0.9,
    });

    const aiResponse = completion.choices[0].message.content;

    return res.status(200).json({
      success: true,
      query,
      response: aiResponse,
      model: model,
    });
  } catch (error) {
    console.error("Error processing AI query:", error.message);
    console.error("Error details:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process query",
      error: error.message,
    });
  }
});

export default router;

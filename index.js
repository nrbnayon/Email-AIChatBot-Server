// server\index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "passport";
import authRoutes from "./routes/auth.js";
import emailRoutes from "./routes/emails.js";
import aiRoutes from "./routes/ai.js";
import "./config/passport.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware - update order for better request handling
app.use(cookieParser());

// Session configuration
app.use(
  session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Configure CORS properly - this should come AFTER session middleware
app.use(
  cors({
    origin: "http://localhost:5173", // Your frontend URL
    credentials: true, // Important for cookies/sessions
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Configure body parser with increased limit for JSON
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Debug middleware for authentication
app.use((req, res, next) => {
  console.log(`Request: ${req.method} ${req.path}`);
  console.log(`Authenticated: ${req.isAuthenticated()}`);
  next();
});

app.get("/", (req, res) => {
  res.send("Hello from how can i help you!");
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/ai", aiRoutes);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB Atlas");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(
        `Google OAuth callback URL: ${process.env.GOOGLE_REDIRECT_URI}`
      );
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

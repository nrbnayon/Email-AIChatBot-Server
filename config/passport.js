import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

// Serialize user
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_REDIRECT_URI,
      scope: [
        "profile",
        "email",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("Google OAuth callback received");
        console.log("Profile:", profile.displayName, profile.emails[0].value);
        console.log("Callback URL:", process.env.GOOGLE_REDIRECT_URI);

        // Check if user already exists
        let user = await User.findOne({ email: profile.emails[0].value });

        if (user) {
          console.log("Existing user found, updating tokens");
          // Update tokens
          user.googleId = profile.id;
          user.googleAccessToken = accessToken;
          user.googleRefreshToken = refreshToken;
          await user.save();
        } else {
          console.log("Creating new user");
          // Create new user
          user = await User.create({
            email: profile.emails[0].value,
            name: profile.displayName,
            googleId: profile.id,
            googleAccessToken: accessToken,
            googleRefreshToken: refreshToken,
            authProvider: "google",
          });
        }

        return done(null, user);
      } catch (error) {
        console.error("Error in Google OAuth strategy:", error);
        return done(error, null);
      }
    }
  )
);

// Microsoft OAuth Strategy
passport.use(
  new MicrosoftStrategy(
    {
      clientID: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL: process.env.MICROSOFT_REDIRECT_URI,
      scope: ["user.read", "mail.read"],
      tenant: "common",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("Microsoft OAuth callback received");
        console.log("Profile:", profile.displayName, profile._json.mail || profile._json.userPrincipalName);
        console.log("Callback URL:", process.env.MICROSOFT_REDIRECT_URI);

        // Get email from profile
        const email = profile._json.mail || profile._json.userPrincipalName;

        // Check if user already exists
        let user = await User.findOne({ email });

        if (user) {
          console.log("Existing user found, updating tokens");
          // Update tokens
          user.microsoftId = profile.id;
          user.microsoftAccessToken = accessToken;
          user.microsoftRefreshToken = refreshToken;
          user.tokenExpiry = new Date(Date.now() + 3600 * 1000); // Token expires in 1 hour
          await user.save();
        } else {
          console.log("Creating new user");
          // Create new user
          user = await User.create({
            email,
            name: profile.displayName,
            microsoftId: profile.id,
            microsoftAccessToken: accessToken,
            microsoftRefreshToken: refreshToken,
            tokenExpiry: new Date(Date.now() + 3600 * 1000), // Token expires in 1 hour
            authProvider: "microsoft",
          });
        }

        return done(null, user);
      } catch (error) {
        console.error("Error in Microsoft OAuth strategy:", error);
        return done(error, null);
      }
    }
  )
);

export default passport;
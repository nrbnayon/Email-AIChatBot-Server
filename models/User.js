// server\models\User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  authProvider: {
    type: String,
    enum: ['google', 'microsoft'],
    required: true
  },
  googleId: {
    type: String,
    sparse: true
  },
  microsoftId: {
    type: String,
    sparse: true
  },
  googleAccessToken: String,
  googleRefreshToken: String,
  microsoftAccessToken: String,
  microsoftRefreshToken: String,
  tokenExpiry: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model('User', userSchema);

export default User;
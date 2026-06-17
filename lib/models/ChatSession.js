import mongoose from 'mongoose';

const ChatSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    history: [
      {
        role: {
          type: String,
          enum: ['user', 'model'],
          required: true,
        },
        parts: [
          {
            text: {
              type: String,
              required: true,
              trim: true,
            },
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
  }
);

const ChatSession =
  mongoose.models.ChatSession ||
  mongoose.model('ChatSession', ChatSessionSchema);

export default ChatSession;

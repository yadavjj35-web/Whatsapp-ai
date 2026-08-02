// path: models/Conversation.js
import mongoose from 'mongoose';

const MessageEntry = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  text: { type: String, required: true },
  meta: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const ConversationSchema = new mongoose.Schema(
  {
    customerPhone: { type: String, index: true, required: true },
    messages: [MessageEntry],
    context: { type: mongoose.Schema.Types.Mixed }, // saved context (cart, selectedProducts)
    lastUpdated: { type: Date, default: Date.now },
    archived: { type: Boolean, default: false }
  },
  { timestamps: true }
);

ConversationSchema.index({ customerPhone: 1, updatedAt: -1 });

export default mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);

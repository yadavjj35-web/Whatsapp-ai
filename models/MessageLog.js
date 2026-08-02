// path: models/MessageLog.js
import mongoose from 'mongoose';

const MessageLogSchema = new mongoose.Schema(
  {
    messageId: { type: String, index: true },
    from: { type: String, required: true, index: true }, // phone number
    to: { type: String },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    type: { type: String },
    body: { type: mongoose.Schema.Types.Mixed }, // store raw payload or text
    metadata: { type: mongoose.Schema.Types.Mixed },
    status: { type: String },
    error: { type: mongoose.Schema.Types.Mixed },
    receivedAt: { type: Date, default: Date.now },
    processed: { type: Boolean, default: false }
  },
  {
    timestamps: true
  }
);

MessageLogSchema.index({ from: 1, createdAt: -1 });

export default mongoose.models.MessageLog || mongoose.model('MessageLog', MessageLogSchema);

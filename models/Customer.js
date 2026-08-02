// path: models/Customer.js
import mongoose from 'mongoose';

const CustomerSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    language: { type: String, default: 'en' },
    conversationIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }],
    interestedProducts: [{ type: String }], // product ids
    purchaseHistory: [{ type: mongoose.Schema.Types.Mixed }], // minimal order references
    leadStatus: { type: String, enum: ['new', 'contacted', 'qualified', 'interested', 'purchased', 'lost'], default: 'new' },
    lastConversationAt: { type: Date },
    preferredProducts: [{ type: String }],
    notes: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

CustomerSchema.index({ phone: 1 });

export default mongoose.models.Customer || mongoose.model('Customer', CustomerSchema);

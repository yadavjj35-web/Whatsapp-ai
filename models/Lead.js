// path: models/Lead.js
import mongoose from 'mongoose';

const LeadSchema = new mongoose.Schema(
  {
    phone: { type: String, index: true, required: true },
    source: { type: String },
    status: { type: String, enum: ['new', 'contacted', 'qualified', 'converted', 'lost'], default: 'new' },
    assignedTo: { type: String },
    notes: { type: String },
    createdAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date }
  },
  { timestamps: true }
);

LeadSchema.index({ phone: 1 });

export default mongoose.models.Lead || mongoose.model('Lead', LeadSchema);

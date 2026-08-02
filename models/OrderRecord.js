// path: models/OrderRecord.js
import mongoose from 'mongoose';

const OrderRecordSchema = new mongoose.Schema(
  {
    wooOrderId: { type: Number, index: true },
    customerPhone: { type: String, index: true },
    status: { type: String },
    total: { type: Number },
    currency: { type: String },
    items: [{ type: mongoose.Schema.Types.Mixed }],
    raw: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

export default mongoose.models.OrderRecord || mongoose.model('OrderRecord', OrderRecordSchema);

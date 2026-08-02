// path: models/PaymentRecord.js
/**
 * PaymentRecord model
 *
 * Stores payment provider events and reconciliation state for accounting and audit.
 *
 * Fields:
 *  - provider: 'stripe' | 'razorpay' | 'paypal' | ...
 *  - providerEventId: provider's unique event id or payment id
 *  - orderId: optional internal order id / correlation id
 *  - amount: numeric (major units)
 *  - currency: e.g., 'USD'
 *  - status: payment status or event type
 *  - rawEvent: full object from provider (stored as Mixed)
 *  - reconciled: boolean
 *  - reconciledAt: Date
 *  - createdAt, updatedAt
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const PaymentRecordSchema = new Schema(
  {
    provider: { type: String, required: true, index: true },
    providerEventId: { type: String, required: true, index: true },
    orderId: { type: String, index: true },
    amount: { type: Number },
    currency: { type: String },
    status: { type: String },
    rawEvent: { type: Schema.Types.Mixed },
    reconciled: { type: Boolean, default: false },
    reconciledAt: { type: Date },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

PaymentRecordSchema.statics.recordEvent = async function (attrs) {
  const existing = await this.findOne({ provider: attrs.provider, providerEventId: attrs.providerEventId });
  if (existing) {
    // update status and rawEvent
    existing.status = attrs.status || existing.status;
    existing.rawEvent = attrs.rawEvent || existing.rawEvent;
    existing.orderId = attrs.orderId || existing.orderId;
    existing.amount = attrs.amount || existing.amount;
    existing.currency = attrs.currency || existing.currency;
    existing.metadata = { ...(existing.metadata || {}), ...(attrs.metadata || {}) };
    await existing.save();
    return existing;
  }
  const rec = await this.create({
    provider: attrs.provider,
    providerEventId: attrs.providerEventId,
    orderId: attrs.orderId,
    amount: attrs.amount,
    currency: attrs.currency,
    status: attrs.status,
    rawEvent: attrs.rawEvent,
    metadata: attrs.metadata || {}
  });
  return rec;
};

PaymentRecordSchema.statics.markReconciled = async function (provider, providerEventId) {
  const rec = await this.findOne({ provider, providerEventId });
  if (!rec) return null;
  rec.reconciled = true;
  rec.reconciledAt = new Date();
  await rec.save();
  return rec;
};

export default mongoose.models.PaymentRecord || mongoose.model('PaymentRecord', PaymentRecordSchema);

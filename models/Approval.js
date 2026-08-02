// path: models/Approval.js
/**
 * Approval model
 *
 * Tracks owner/human approvals required by workflows or tasks.
 *
 * Fields:
 *  - approvalId: unique id
 *  - workflowId: optional workflow correlation
 *  - taskId: optional task id within workflow
 *  - status: 'pending'|'approved'|'rejected'|'expired'
 *  - requestedBy: user identifier who requested approval
 *  - requestedAt: date
 *  - expiresAt: date
 *  - channel: 'email'|'whatsapp'|'ui'
 *  - approver: identifier who approved/rejected
 *  - decidedAt: date
 *  - decision: freeform (notes)
 *  - notificationMeta: { sentVia, messageId, etc }
 *  - signedTokenId: optional token id used in signed approval links
 *  - metadata: freeform
 *
 * Indexes:
 *  - approvalId unique
 *  - workflowId
 *  - status
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const ApprovalSchema = new Schema(
  {
    approvalId: { type: String, required: true, unique: true, index: true },
    workflowId: { type: String, index: true },
    taskId: { type: String, index: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending', index: true },
    requestedBy: { type: String },
    requestedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    channel: { type: String, enum: ['email', 'whatsapp', 'ui'], default: 'ui' },
    approver: { type: String },
    decidedAt: { type: Date },
    decision: { type: String },
    notificationMeta: { type: Schema.Types.Mixed },
    signedTokenId: { type: String },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

/**
 * Mark approval as decided
 */
ApprovalSchema.methods.markDecision = async function ({ approver, decision, status = 'approved' } = {}) {
  this.approver = approver || this.approver;
  this.decision = decision || this.decision;
  this.status = status;
  this.decidedAt = new Date();
  await this.save();
  return this;
};

/**
 * Expire approvals past expiry
 */
ApprovalSchema.statics.expireOldApprovals = async function () {
  const now = new Date();
  const res = await this.updateMany({ status: 'pending', expiresAt: { $lte: now } }, { $set: { status: 'expired', decidedAt: now } });
  return res;
};

export default mongoose.models.Approval || mongoose.model('Approval', ApprovalSchema);

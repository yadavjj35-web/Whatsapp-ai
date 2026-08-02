// path: models/AuditLog.js
/**
 * AuditLog model
 *
 * Immutable audit log entries for system actions: workflow changes, approvals, payments, critical system events.
 *
 * Fields:
 *  - id (ObjectId)
 *  - category: 'workflow'|'security'|'payment'|'approval'|'system' etc
 *  - action: short action name
 *  - actor: who performed action (user id/system)
 *  - actorType: 'user'|'system'|'agent'
 *  - message: summary message
 *  - details: freeform object with additional context
 *  - createdAt, updatedAt
 *
 * Indexes:
 *  - category + createdAt for queries
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const AuditLogSchema = new Schema(
  {
    category: { type: String, required: true, index: true },
    action: { type: String, required: true },
    actor: { type: String },
    actorType: { type: String, enum: ['user', 'system', 'agent', 'integration'], default: 'system' },
    message: { type: String },
    details: { type: Schema.Types.Mixed },
    correlationId: { type: String, index: true }
  },
  { timestamps: true }
);

/**
 * Convenience method to write an audit entry.
 */
AuditLogSchema.statics.write = async function ({ category, action, actor, actorType = 'system', message, details, correlationId } = {}) {
  const entry = await this.create({
    category,
    action,
    actor,
    actorType,
    message,
    details,
    correlationId
  });
  return entry;
};

export default mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);

// path: controllers/whatsappController.js
/**
 * WhatsApp webhook controller
 *
 * Responsibilities:
 *  - Receive inbound WhatsApp messages (webhooks) and persist to conversation memory
 *  - Create workflows or enqueue tasks based on incoming message intents
 *  - Send outgoing messages via notifications/whatsappNotifier
 *
 * Implementation notes:
 *  - This controller is generic: supports multiple webhook providers (Twilio, Meta) by inspecting payload
 *  - Use rawBody (req.rawBody) when signature verification required
 *  - Rate-limits and RBAC are applied at server level
 */

import express from 'express';
import logger from '../utils/logger.js';
import conversationMemory from '../memory/conversationMemory.js';
import orchestrator from '../agents/orchestratorAgent.js';
import queueManager from '../queue/queueManager.js';
import workflowEngine from '../workflows/durableWorkflowEngine.js';
import whatsappNotifier from '../notifications/whatsappNotifier.js';

const router = express.Router();

/**
 * Helper to normalize inbound webhook payload into { from, to, text, provider, messageId, timestamp, raw }
 */
function normalizeIncoming(req) {
  const raw = req.body || (req.rawBody ? JSON.parse(req.rawBody) : {});
  let provider = 'unknown';
  // Twilio style
  if (raw.From && raw.Body) {
    provider = 'twilio';
    return {
      from: raw.From,
      to: raw.To,
      text: raw.Body,
      provider,
      messageId: raw.MessageSid || null,
      timestamp: raw.Timestamp || Date.now(),
      raw
    };
  }
  // Meta / WhatsApp Cloud API style
  if (raw.entry && Array.isArray(raw.entry)) {
    provider = 'facebook';
    // pick first message
    try {
      const msg = raw.entry[0].changes[0].value.messages[0];
      return {
        from: msg.from,
        to: raw.entry[0].changes[0].value.metadata?.display_phone_number || null,
        text: msg.text?.body || (msg.conversation?.text) || '',
        provider,
        messageId: msg.id,
        timestamp: msg.timestamp || Date.now(),
        raw
      };
    } catch (e) {
      return { provider, raw };
    }
  }
  // Generic fallback: look for common fields
  return {
    from: raw.from || raw.sender || null,
    to: raw.to || null,
    text: raw.text || raw.message || '',
    provider,
    messageId: raw.id || null,
    timestamp: raw.timestamp || Date.now(),
    raw
  };
}

/**
 * POST /webhook/whatsapp
 * Inbound webhook handler
 */
router.post('/', async (req, res, next) => {
  try {
    const inbound = normalizeIncoming(req);
    const { from, text, messageId, provider } = inbound;
    if (!from || (!text && !inbound.raw)) {
      logger.warn('WhatsApp webhook missing payload', { inbound });
      return res.status(400).send('Bad Request');
    }

    // Persist message to conversation memory
    try {
      await conversationMemory.appendMessage(from, 'user', text || JSON.stringify(inbound.raw), { provider, messageId, raw: inbound.raw });
    } catch (err) {
      logger.warn('Failed to persist inbound message', { error: err.message, from });
    }

    // Heuristic routing: if message begins with a command (e.g., "order", "status"), create a workflow
    const normalized = (text || '').trim().toLowerCase();
    if (normalized.startsWith('order') || normalized.startsWith('status') || normalized.startsWith('buy')) {
      // create a simple workflow to handle order inquiry
      const workflow = await orchestrator.createAndStartWorkflow({
        name: `inbound:${normalized.split(' ')[0]}`,
        owner: from,
        tasks: [
          { type: 'classify-intent', agent: 'IntentClassifierAgent', input: { text } },
          { type: 'respond', agent: 'OwnerAssistantAgent', input: { text } }
        ],
        startImmediately: true
      });

      // Ack quickly to the sender
      try {
        await whatsappNotifier.sendTextMessage({ to: from, text: 'Thanks — we are processing your request. You will get a response shortly.' });
      } catch (e) {
        logger.warn('Failed to send whatsapp ack', { error: e.message, to: from });
      }

      return res.status(200).json({ ok: true, workflowId: workflow.workflowId });
    }

    // For free-form queries: enqueue quick conversational task
    try {
      const taskPayload = { id: `msg:${messageId || Date.now()}`, type: 'chat', agent: 'ConversationalAgent', input: { text, from }, workflowId: null };
      await queueManager.enqueueTask(taskPayload);
      return res.status(200).json({ ok: true, enqueued: true });
    } catch (err) {
      logger.warn('Failed to enqueue chat task', { error: err.message });
      return res.status(500).json({ ok: false, error: 'enqueue_failed' });
    }
  } catch (err) {
    logger.error('whatsapp webhook handler failure', { error: err.message });
    return next(err);
  }
});

/**
 * Outbound send helper (used by internal modules)
 * Body: { to, text, media, fallback }
 */
router.post('/send', async (req, res, next) => {
  try {
    const { to, text, media } = req.body;
    if (!to || (!text && !media)) return res.status(400).json({ success: false, error: 'to and text/media required' });
    const result = await whatsappNotifier.sendTextMessage({ to, text, media });
    return res.json({ success: true, result });
  } catch (err) {
    logger.error('Failed to send whatsapp message', { error: err.message });
    return next(err);
  }
});

export default router;

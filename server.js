import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import config from './config/index.js';
import { connectDB } from './database/mongoose.js';
import routes from './routes/index.js';
import rateLimiter from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';

// Create Express app
const app = express();

// Raw body capture to support webhook signature verification (x-hub-signature-256).
// whatsappVerifier middleware expects req.rawBody to compute HMAC.
// The verify option provides the raw buffer before parsing into JSON.
function rawBodySaver(req, res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}

// Security middlewares
app.use(helmet());

// Body parsers with raw body capture
app.use(express.json({ limit: '2mb', verify: rawBodySaver }));
app.use(express.urlencoded({ extended: true, limit: '2mb', verify: rawBodySaver }));

// CORS - allow requests from configured origins in production (adjust as needed)
app.use(cors({ origin: true }));

// Rate limiter
app.use(rateLimiter);

// Request logging
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Mount API routes under /api/v1
app.use('/api/v1', routes);

// Basic root
app.get('/', (req, res) => res.json({ success: true, message: 'AI WhatsApp Sales Assistant API' }));

// Error handler (must be last)
app.use(errorHandler);

// Start server and DB connection
const port = config.port || process.env.PORT || 3000;

async function start() {
  try {
    // Connect to MongoDB
    await connectDB();

    const server = app.listen(port, () => {
      logger.info(`Server listening on port ${port} (env=${config.nodeEnv})`);
      // Print basic startup info
      logger.info('Ready endpoints', { health: `/api/v1/health`, webhook: `/api/v1/webhook` });
    });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      server.close(() => {
        logger.info('HTTP server closed');
        // allow DB driver to close itself
        process.exit(0);
      });
      // Force exit if not closed in 30s
      setTimeout(() => {
        logger.error('Forcefully exiting process after timeout');
        process.exit(1);
      }, 30000).unref();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { message: err.message, stack: err.stack });
      shutdown();
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason });
    });

  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

start();

export default app;

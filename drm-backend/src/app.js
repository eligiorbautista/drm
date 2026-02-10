/**
 * Express Application Setup
 *
 * This module creates and configures the Express app WITHOUT starting the server.
 * - For local development: `src/index.js` imports this and calls app.listen()
 * - For Vercel serverless: `api/index.js` imports and exports this directly
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { env } = require('./config/env');
const logger = require('./middleware/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Route imports
const healthRoutes = require('./routes/health');
const callbackRoutes = require('./routes/callback');
const tokenRoutes = require('./routes/token');
const settingsRoutes = require('./routes/settings');
const broadcastRoutes = require('./routes/broadcast');

const app = express();

// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------

// Security headers
app.use(helmet());

// CORS configuration
const allowedOrigins = env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim());

/**
 * Check if origin matches allowed patterns (including wildcards)
 */
function isOriginAllowed(origin) {
  if (!origin) return true; // Allow requests with no origin (mobile apps, curl)

  for (const allowed of allowedOrigins) {
    // Exact match
    if (origin === allowed) return true;

    // Wildcard match (e.g., https://*.vercel.app)
    if (allowed.includes('*')) {
      const regexPattern = allowed
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(origin)) return true;
    }

    // Allow any subdomain match (e.g., allowed=https://vercel.app matches origin=https://my-app.vercel.app)
    try {
      const allowedUrl = new URL(allowed.startsWith('http') ? allowed : `https://${allowed}`);
      const originUrl = new URL(origin);

      // Check if origin ends with allowed hostname (for subdomains)
      if (originUrl.hostname.endsWith(allowedUrl.hostname)) {
        // Also check protocol matches
        if (allowedUrl.protocol === originUrl.protocol) {
          return true;
        }
      }
    } catch (e) {
      // Invalid URL format, skip
    }
  }
  return false;
}

app.use(
  cors({
    origin: function (origin, callback) {
      if (isOriginAllowed(origin)) {
        logger.debug('[CORS] Allowed request from origin', { origin });
        callback(null, true);
      } else {
        logger.warn('[CORS] Blocked request from origin', { origin, allowedOrigins });
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-dt-auth-token', 'x-dt-custom-data'],
  })
);

// Request logging
app.use(morgan('combined', { stream: logger.stream }));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check
app.use('/health', healthRoutes);

// DRMtoday callbacks and tokens
app.use('/api/callback', callbackRoutes);
app.use('/api/token', tokenRoutes);

// Settings (public access)
app.use('/api/settings', settingsRoutes);

// Broadcast session management (public access)
app.use('/api/broadcast', broadcastRoutes);

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

/**
 * Authentication Middleware
 *
 * Provides middleware functions to protect routes:
 * - requireAuth - Requires valid authentication
 * - optionalAuth - Optional authentication (sets req.user if valid)
 */
const userService = require('../services/userService');
const logger = require('./logger');

/**
 * Require authentication middleware
 *
 * If valid token is provided, sets req.user and req.session
 * If no token provided, returns 401
 * If invalid token, returns 401
 */
function requireAuth(req, res, next) {
  const authHeader = req.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
  }

  validateSession(token)
    .then((session) => {
      req.user = session.user;
      req.session = session;
      next();
    })
    .catch((err) => {
      logger.warn('Authentication failed', {
        error: err.message,
        path: req.path,
      });

      return res.status(401).json({
        error: err.message || 'Invalid or expired session',
        code: 'AUTH_FAILED',
      });
    });
}

/**
 * Optional authentication middleware
 *
 * If valid token is provided, sets req.user and req.session
 * If no token or invalid token, continues without user
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return next();
  }

  try {
    const session = await validateSession(token);
    req.user = session.user;
    req.session = session;
  } catch (err) {
    // Ignore errors in optional auth
    logger.debug('Optional auth failed', { error: err.message });
  }

  next();
}

/**
 * Validate a session token
 * @param {string} token - Session token
 * @returns {Promise<object>} Session with user data
 */
async function validateSession(token) {
  const session = await userService.getSessionByToken(token);

  if (!session) {
    throw new Error('Invalid session token');
  }

  if (!session.user.isActive) {
    throw new Error('Account is disabled');
  }

  if (session.expiresAt < new Date()) {
    // Clean up expired session
    await userService.logout(token);
    throw new Error('Session expired');
  }

  // Update last active timestamp
  await userService.updateSessionActivity(session.id);

  return session;
}

/**
 * Update session activity timestamp
 * @param {string} sessionId - Session ID
 */
async function updateSessionActivity(sessionId) {
  try {
    const prisma = require('../lib/prisma');
    await prisma.userSession.update({
      where: { id: sessionId },
      data: { lastActiveAt: new Date() },
    });
  } catch (err) {
    // Silent fail - activity tracking is not critical
  }
}

/**
 * Require specific role(s)
 *
 * Must be used after requireAuth middleware
 *
 * @param  {...string} roles - Required roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireRole,
  validateSession,
};
/**
 * Authentication Routes
 *
 * Provides user authentication endpoints:
 * - POST /api/auth/register - Register a new user
 * - POST /api/auth/login - User login
 * - POST /api/auth/logout - User logout
 * - POST /api/auth/refresh - Refresh access token
 * - GET /api/auth/profile - Get user profile
 * - GET /api/auth/sessions - Get user's sessions
 * - DELETE /api/auth/sessions - Logout from all sessions
 * - PUT /api/auth/profile - Update profile
 * - PUT /api/auth/password - Change password
 */
const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const logger = require('../middleware/logger');

/**
 * Get client info from request
 */
function getClientInfo(req) {
  return {
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
  };
}

/**
 * POST /api/auth/register
 *
 * Register a new user account.
 *
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "username": "johndoe",
 *   "password": "securePassword123"
 * }
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, username, password } = req.body;

    // Validate required fields
    if (!email || !username || !password) {
      return res.status(400).json({
        error: 'Email, username, and password are required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format',
      });
    }

    // Validate username format (alphanumeric and underscores, 3-20 chars)
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        error: 'Username must be 3-20 characters and contain only letters, numbers, and underscores',
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long',
      });
    }

    const user = await userService.createUser({
      email,
      username,
      password,
    });

    res.status(201).json({
      message: 'User registered successfully',
      user,
    });
  } catch (err) {
    if (err.message.includes('already exists') || err.message.includes('taken')) {
      return res.status(409).json({
        error: err.message,
      });
    }
    next(err);
  }
});

/**
 * POST /api/auth/login
 *
 * Authenticate user and create session.
 *
 * Request body:
 * {
 *   "email": "user@example.com",
 *   "password": "securePassword123"
 * }
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
      });
    }

    const clientInfo = getClientInfo(req);
    const result = await userService.authenticateUser(
      email,
      password,
      clientInfo.ipAddress,
      clientInfo.userAgent
    );

    logger.info('User logged in', { userId: result.user.id });

    res.json({
      message: 'Login successful',
      ...result,
    });
  } catch (err) {
    if (
      err.message.includes('Invalid') ||
      err.message.includes('disabled')
    ) {
      return res.status(401).json({
        error: err.message,
      });
    }
    next(err);
  }
});

/**
 * POST /api/auth/logout
 *
 * Invalidate current session.
 */
router.post('/logout', async (req, res, next) => {
  try {
    const authHeader = req.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (token) {
      await userService.logout(token);
    }

    res.json({
      message: 'Logged out successfully',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 *
 * Refresh access token using refresh token.
 *
 * Request body:
 * {
 *   "refreshToken": "..."
 * }
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Refresh token is required',
      });
    }

    const clientInfo = getClientInfo(req);
    const result = await userService.refreshSession(
      refreshToken,
      clientInfo.ipAddress,
      clientInfo.userAgent
    );

    res.json({
      message: 'Token refreshed successfully',
      ...result,
    });
  } catch (err) {
    if (err.message.includes('Invalid') || err.message.includes('expired')) {
      return res.status(401).json({
        error: err.message,
      });
    }
    next(err);
  }
});

/**
 * GET /api/auth/session
 *
 * Validate session against database (session-based auth).
 * Returns user and session info if valid, 401 if invalid/expired.
 */
router.get('/session', async (req, res, next) => {
  try {
    const authHeader = req.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    logger.debug('[session] Validating session', { tokenPrefix: token?.substring(0, 10) });

    if (!token) {
      return res.status(401).json({
        error: 'Session token required',
      });
    }

    const session = await userService.getSessionByToken(token);

    logger.debug('[session] Session lookup result', {
      found: !!session,
      userActive: session?.user?.isActive,
      expiresAt: session?.expiresAt,
    });

    if (!session || !session.user.isActive) {
      return res.status(401).json({
        error: 'Invalid session',
      });
    }

    if (session.expiresAt < new Date()) {
      // Clean up expired session
      await userService.logout(token);
      return res.status(401).json({
        error: 'Session expired',
      });
    }

    res.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        username: session.user.username,
        role: session.user.role,
        isActive: session.user.isActive,
        createdAt: session.user.createdAt,
        updatedAt: session.user.updatedAt,
      },
      session: {
        id: session.id,
        token: session.token,
        expiresAt: session.expiresAt,
        lastActiveAt: session.lastActiveAt,
        createdAt: session.createdAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      },
    });
  } catch (err) {
    if (err.message.includes('Invalid') || err.message.includes('expired')) {
      return res.status(401).json({
        error: err.message,
      });
    }
    next(err);
  }
});

/**
 * GET /api/auth/profile
 *
 * Get current user's profile.
 * Requires authentication.
 */
router.get('/profile', async (req, res, next) => {
  try {
    const authHeader = req.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const session = await userService.getSessionByToken(token);

    if (!session || !session.user.isActive) {
      return res.status(401).json({
        error: 'Invalid or expired session',
      });
    }

    if (session.expiresAt < new Date()) {
      return res.status(401).json({
        error: 'Session expired',
      });
    }

    res.json({
      user: session.user,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/sessions
 *
 * Get all sessions for current user.
 * Requires authentication.
 */
router.get('/sessions', async (req, res, next) => {
  try {
    const authHeader = req.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const session = await userService.getSessionByToken(token);

    if (!session || !session.user.isActive) {
      return res.status(401).json({
        error: 'Invalid or expired session',
      });
    }

    const sessions = await userService.getUserSessions(session.user.id);

    res.json({
      sessions: sessions.map((s) => ({
        ...s,
        token: s.token.substring(0, 8) + '...', // Partial token for display
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/auth/sessions
 *
 * Logout from all sessions.
 * Requires authentication.
 */
router.delete('/sessions', async (req, res, next) => {
  try {
    const authHeader = req.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const session = await userService.getSessionByToken(token);

    if (!session) {
      return res.status(401).json({
        error: 'Invalid session',
      });
    }

    const count = await userService.logoutAll(session.user.id);

    res.json({
      message: 'Logged out from all devices',
      count,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/auth/profile
 *
 * Update user profile.
 * Requires authentication.
 *
 * Request body:
 * {
 *   "username": "newname"
 * }
 */
router.put('/profile', async (req, res, next) => {
  try {
    const authHeader = req.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const session = await userService.getSessionByToken(token);

    if (!session || !session.user.isActive) {
      return res.status(401).json({
        error: 'Invalid or expired session',
      });
    }

    const { username } = req.body;

    // Validate username format
    if (username) {
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(username)) {
        return res.status(400).json({
          error: 'Username must be 3-20 characters and contain only letters, numbers, and underscores',
        });
      }
    }

    const user = await userService.updateUser(session.user.id, {
      username,
    });

    res.json({
      message: 'Profile updated successfully',
      user,
    });
  } catch (err) {
    if (err.message.includes('taken')) {
      return res.status(409).json({
        error: err.message,
      });
    }
    next(err);
  }
});

/**
 * PUT /api/auth/password
 *
 * Change user password.
 * Requires authentication.
 *
 * Request body:
 * {
 *   "currentPassword": "...",
 *   "newPassword": "..."
 * }
 */
router.put('/password', async (req, res, next) => {
  try {
    const authHeader = req.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const session = await userService.getSessionByToken(token);

    if (!session || !session.user.isActive) {
      return res.status(401).json({
        error: 'Invalid or expired session',
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'New password must be at least 8 characters long',
      });
    }

    await userService.changePassword(
      session.user.id,
      currentPassword,
      newPassword
    );

    res.json({
      message: 'Password changed successfully',
    });
  } catch (err) {
    if (err.message.includes('incorrect') || err.message.includes('not found')) {
      return res.status(400).json({
        error: err.message,
      });
    }
    next(err);
  }
});

module.exports = router;
/**
 * User Service
 *
 * Handles all user-related database operations including:
 * - User creation and retrieval
 * - Password hashing and verification
 * - Session management
 */
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const logger = require('../middleware/logger');

const SALT_ROUNDS = 12;

/**
 * Ensure database connection is established
 */
async function ensureConnection() {
  try {
    await prisma.$connect();
  } catch (error) {
    logger.error('Failed to connect to database', { error: error.message });
    throw error;
  }
}

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a secure random token
 * @param {number} [length=64] - Token length in bytes
 * @returns {string} Hex-encoded token
 */
function generateToken(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Create a new user
 * @param {object} data - User data
 * @param {string} data.email - User email
 * @param {string} data.username - Unique username
 * @param {string} data.password - Plain text password
 * @returns {Promise<object>} Created user (without password)
 */
async function createUser(data) {
  const { email, username, password } = data;

  // Check if email already exists
  const existingEmail = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingEmail) {
    throw new Error('User with this email already exists');
  }

  // Check if username already exists
  const existingUsername = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUsername) {
    throw new Error('Username is already taken');
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      username,
      passwordHash,
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logger.info('User created', { userId: user.id, email: user.email, username: user.username });

  return user;
}

/**
 * Authenticate a user with email and password
 * @param {string} email - User email
 * @param {string} password - Plain text password
 * @returns {Promise<object>} User session data (with tokens)
 */
async function authenticateUser(email, password, ipAddress, userAgent) {
  await ensureConnection();

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    throw new Error('Invalid email or password');
  }

  if (!user.isActive) {
    throw new Error('Account is disabled');
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  // Generate session tokens
  const token = generateToken(32);
  const refreshToken = generateToken(64);

  // Calculate expiry based on environment config (prioritize hours over days)
  const sessionExpiryHours = parseInt(process.env.AUTH_SESSION_HOURS || '0', 10);
  const sessionExpiryDays = parseInt(process.env.AUTH_SESSION_DAYS || '30', 10);
  const expiresAt = new Date(Date.now() + (sessionExpiryHours || sessionExpiryDays * 24) * 60 * 60 * 1000);

  // Create session
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      token,
      refreshToken,
      ipAddress,
      userAgent,
      expiresAt,
    },
  });

  logger.info('User authenticated', { userId: user.id, sessionId: session.id });

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    },
    token,
    refreshToken,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Find user by ID
 * @param {string} userId - User ID
 * @returns {Promise<object|null>} User data (without password)
 */
async function findUserById(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Find user by email
 * @param {string} email - User email
 * @returns {Promise<object|null>} User data (with password)
 */
async function findUserByEmail(email) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
}

/**
 * Get session by token
 * @param {string} token - Session token
 * @returns {Promise<object|null>} Session with user data
 */
async function getSessionByToken(token) {
  return prisma.userSession.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isActive: true,
        },
      },
    },
  });
}

/**
 * Refresh a session token
 * @param {string} refreshToken - Refresh token
 * @param {string} ipAddress - Client IP address
 * @param {string} userAgent - Client user agent
 * @returns {Promise<object>} New session tokens
 */
async function refreshSession(refreshToken, ipAddress, userAgent) {
  const session = await prisma.userSession.findUnique({
    where: { refreshToken },
    include: { user: true },
  });

  if (!session) {
    throw new Error('Invalid refresh token');
  }

  if (session.expiresAt < new Date()) {
    // Clean up expired session
    await prisma.userSession.delete({ where: { id: session.id } });
    throw new Error('Session expired');
  }

  if (!session.user.isActive) {
    throw new Error('Account is disabled');
  }

  // Generate new tokens
  const newToken = generateToken(32);
  const newRefreshToken = generateToken(64);

  // Calculate new expiry (prioritize hours over days)
  const sessionExpiryHours = parseInt(process.env.AUTH_SESSION_HOURS || '0', 10);
  const sessionExpiryDays = parseInt(process.env.AUTH_SESSION_DAYS || '30', 10);
  const expiresAt = new Date(Date.now() + (sessionExpiryHours || sessionExpiryDays * 24) * 60 * 60 * 1000);

  // Update session
  await prisma.userSession.update({
    where: { id: session.id },
    data: {
      token: newToken,
      refreshToken: newRefreshToken,
      expiresAt,
      lastActiveAt: new Date(),
      ipAddress,
      userAgent,
    },
  });

  logger.info('Session refreshed', { userId: session.user.id });

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      username: session.user.username,
      role: session.user.role,
    },
    token: newToken,
    refreshToken: newRefreshToken,
    expiresAt: expiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
  };
}

/**
 * Logout (invalidate session)
 * @param {string} token - Session token
 * @returns {Promise<boolean>} True if session was invalidated
 */
async function logout(token) {
  const session = await prisma.userSession.findUnique({
    where: { token },
  });

  if (!session) {
    return false;
  }

  await prisma.userSession.delete({
    where: { id: session.id },
  });

  logger.info('User logged out', { userId: session.userId });

  return true;
}

/**
 * Logout from all sessions
 * @param {string} userId - User ID
 * @returns {Promise<number>} Number of sessions invalidated
 */
async function logoutAll(userId) {
  const result = await prisma.userSession.deleteMany({
    where: { userId },
  });

  logger.info('All sessions invalidated', { userId, count: result.count });

  return result.count;
}

/**
 * Get user's all sessions
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of sessions
 */
async function getUserSessions(userId) {
  return prisma.userSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      token: true,
      ipAddress: true,
      userAgent: true,
      expiresAt: true,
      lastActiveAt: true,
      createdAt: true,
    },
  });
}

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {object} data - Update data
 * @returns {Promise<object>} Updated user
 */
async function updateUser(userId, data) {
  const { username, ...rest } = data;

  return prisma.user.update({
    where: { id: userId },
    data: {
      username,
      ...rest,
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Change user password
 * @param {string} userId - User ID
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<boolean>} True if password was changed
 */
async function changePassword(userId, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const isValid = await verifyPassword(currentPassword, user.passwordHash);

  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  const newHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  logger.info('Password changed', { userId });

  return true;
}

/**
 * Clean up expired sessions
 * @returns {Promise<number>} Number of deleted sessions
 */
async function cleanupExpiredSessions() {
  const result = await prisma.userSession.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  if (result.count > 0) {
    logger.info('Cleaned up expired sessions', { count: result.count });
  }

  return result.count;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  createUser,
  authenticateUser,
  findUserById,
  findUserByEmail,
  getSessionByToken,
  refreshSession,
  logout,
  logoutAll,
  getUserSessions,
  updateUser,
  changePassword,
  cleanupExpiredSessions,
};
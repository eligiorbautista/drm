const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const logger = require('../middleware/logger');
const { getSetting } = require('../services/settingsService');

/**
 * POST /api/broadcast/sessions
 * Create a new broadcast session
 */
router.post('/sessions', async (req, res, next) => {
  try {
    const { streamId, endpoint, merchant, userIdForDrm, encrypted, iceServers } = req.body;

    if (!streamId) {
      return res.status(400).json({ error: 'streamId is required' });
    }

    // Enforce global encryption setting
    const encryptionEnabled = await getSetting('drm.encryption.enabled', null);
    const finalEncrypted = encryptionEnabled !== null ? encryptionEnabled : (encrypted || false);

    // Check if session already exists
    const existingSession = await prisma.broadcastSession.findFirst({
      where: { streamId },
    });

    if (existingSession) {
      // Update existing session
      const updatedSession = await prisma.broadcastSession.update({
        where: { id: existingSession.id },
        data: {
          isActive: true,
          connectionState: 'creating',
          endpoint: endpoint || null,
          merchant: merchant || null,
          userIdForDrm: userIdForDrm || null,
          encrypted: finalEncrypted,
          iceServers: iceServers || null,
          updatedAt: new Date(),
        },
      });

      logger.info('Broadcast session updated', {
        sessionId: updatedSession.id,
        streamId: updatedSession.streamId,
        encrypted: finalEncrypted,
      });

      return res.json({
        success: true,
        session: updatedSession,
        isExisting: true,
        encryptionEnforced: finalEncrypted,
      });
    }

    // Create new session
    const session = await prisma.broadcastSession.create({
      data: {
        streamId,
        endpoint: endpoint || null,
        merchant: merchant || null,
        userIdForDrm: userIdForDrm || null,
        encrypted: finalEncrypted,
        iceServers: iceServers || null,
        connectionState: 'creating',
        isActive: true,
      },
    });

    logger.info('Broadcast session created', {
      sessionId: session.id,
      streamId: session.streamId,
      encrypted: finalEncrypted,
    });

    res.json({
      success: true,
      session,
      isExisting: false,
      encryptionEnforced: finalEncrypted,
    });
  } catch (error) {
    logger.error('Failed to create broadcast session', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/broadcast/sessions/:streamId
 * Get broadcast session by stream ID
 */
router.get('/sessions/:streamId', async (req, res, next) => {
  try {
    const { streamId } = req.params;

    const session = await prisma.broadcastSession.findFirst({
      where: { streamId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      session,
    });
  } catch (error) {
    logger.error('Failed to get broadcast session', { error: error.message });
    next(error);
  }
});

/**
 * PATCH /api/broadcast/sessions/:streamId/state
 * Update broadcast session state
 */
router.patch('/sessions/:streamId/state', async (req, res, next) => {
  try {
    const { streamId } = req.params;
    const { connectionState, localSdp, remoteSdp, iceCandidates } = req.body;

    const session = await prisma.broadcastSession.findFirst({
      where: { streamId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const updatedSession = await prisma.broadcastSession.update({
      where: { id: session.id },
      data: {
        connectionState: connectionState || session.connectionState,
        localSdp: localSdp !== undefined ? localSdp : session.localSdp,
        remoteSdp: remoteSdp !== undefined ? remoteSdp : session.remoteSdp,
        iceCandidates: iceCandidates !== undefined ? iceCandidates : session.iceCandidates,
        updatedAt: new Date(),
      },
    });

    logger.info('Broadcast session state updated', {
      sessionId: updatedSession.id,
      streamId: updatedSession.streamId,
      connectionState: updatedSession.connectionState,
    });

    res.json({
      success: true,
      session: updatedSession,
    });
  } catch (error) {
    logger.error('Failed to update broadcast session state', { error: error.message });
    next(error);
  }
});

/**
 * POST /api/broadcast/sessions/:streamId/ping
 * Update session last ping (keepalive)
 */
router.post('/sessions/:streamId/ping', async (req, res, next) => {
  try {
    const { streamId } = req.params;

    const session = await prisma.broadcastSession.findFirst({
      where: { streamId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const updatedSession = await prisma.broadcastSession.update({
      where: { id: session.id },
      data: {
        lastPingAt: new Date(),
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      session: updatedSession,
    });
  } catch (error) {
    logger.error('Failed to ping broadcast session', { error: error.message });
    next(error);
  }
});

/**
 * DELETE /api/broadcast/sessions/:streamId
 * Deactivate a broadcast session
 */
router.delete('/sessions/:streamId', async (req, res, next) => {
  try {
    const { streamId } = req.params;

    const session = await prisma.broadcastSession.findFirst({
      where: { streamId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const updatedSession = await prisma.broadcastSession.update({
      where: { id: session.id },
      data: {
        isActive: false,
        connectionState: 'disconnected',
        updatedAt: new Date(),
      },
    });

    logger.info('Broadcast session deactivated', {
      sessionId: updatedSession.id,
      streamId: updatedSession.streamId,
    });

    res.json({
      success: true,
      session: updatedSession,
    });
  } catch (error) {
    logger.error('Failed to deactivate broadcast session', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/broadcast/active
 * Get all active broadcast sessions
 */
router.get('/active', async (req, res, next) => {
  try {
    const sessions = await prisma.broadcastSession.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      success: true,
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    logger.error('Failed to get active broadcast sessions', { error: error.message });
    next(error);
  }
});

module.exports = router;
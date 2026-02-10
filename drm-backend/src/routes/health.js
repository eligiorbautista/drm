const express = require('express');
const router = express.Router();

/**
 * GET /health
 * Basic health check endpoint.
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'drm-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;

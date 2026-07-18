// server/middleware/auth.js
// ============================================================
// Auth Middleware — DEMO MODE
// Auto-creates and attaches a demo user to every request.
// No signup/login flow needed — just plug and play.
// Swap to full JWT auth later by uncommenting the real flow.
// ============================================================

const { User } = require('../models');
const logger = require('../utils/logger');

// Cached demo user to avoid DB lookup on every request
let cachedDemoUser = null;

/**
 * Demo Mode: Automatically provisions a demo user and attaches
 * it to req.user. No token needed.
 */
const protect = async (req, res, next) => {
  try {
    if (cachedDemoUser) {
      req.user = cachedDemoUser;
      return next();
    }

    // Find or create the demo user
    let demoUser = await User.findOne({ email: 'demo@synapse.ai' });

    if (!demoUser) {
      demoUser = await User.create({
        name: 'Sarah Chen',
        email: 'demo@synapse.ai',
        password: 'demo_password_not_used',
        role: 'admin',
        avatar: null,
      });
      logger.info('Demo user created: demo@synapse.ai');
    }

    cachedDemoUser = demoUser;
    req.user = demoUser;
    next();
  } catch (error) {
    logger.error(`Demo auth error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to initialize demo user.',
    });
  }
};

/**
 * Role authorization — passes through in demo mode
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    next();
  };
};

module.exports = { protect, authorize };

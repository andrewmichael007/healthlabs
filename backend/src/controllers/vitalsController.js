// src/routes/vitals.js
const express = require("express");

const { body, param, query, validationResult } = require("express-validator");

//axios is used to  call an external ML Service
const axios = require("axios");
const Vital = require("../models/vitals");
const { authMiddleware, roleMiddleware } = require("../middlewares/auth");
// const redis = require('../utils/redisClient');

// const router = express.Router();

//  validation of ranges
function validateRanges(data) {

  //making dictionary of errors to hold errors
  const errors = [];

  //define the request body
  const { heartRate, systolic, diastolic, spo2, temperature } = data;

  //heart rate should be between 20 and 220
  if (heartRate < 20 || heartRate > 220) errors.push("heartRate out of range (20-220)");

  //systolic reading should be between 60 and 250
  if (systolic < 60 || systolic > 250) errors.push("systolic out of range (60-250)");

  if (diastolic < 40 || diastolic > 150) errors.push('diastolic out of range (40-150)');

  if (spo2 < 50 || spo2 > 100) errors.push('spo2 out of range (50-100)');

  if (temperatureC < 30 || temperatureC > 43) errors.push('temperatureC out of range (30-43)');

  //return errors if there any
  return errors;
};

// cache helpers
function vitalsCacheKey(userId, limit) {
  return `vitals:${userId}:limit:${limit}`;
}

async function getCachedVitals(userId, limit) {
  const key = vitalsCacheKey(userId, limit);
  const cached = await redis.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { await redis.del(key); return null; }
  }
  return null;
}

async function setCachedVitals(userId, limit, data) {
  const key = vitalsCacheKey(userId, limit);
  // TTL short for freshness
  await redis.set(key, JSON.stringify(data), 'EX', 60);
}

async function invalidateVitalsCache(userId) {
  // simple approach: delete known key patterns for common limits
  // For a small MVP we can delete a set of likely keys. For production, maintain a cache key registry or use Redis SCAN with caution.
  const patterns = [
    `vitals:${userId}:limit:*`,
    `vitals:${userId}:limit:20` // common default
  ];

  // Use SCAN + DEL safely
  for (const pattern of patterns) {
    const stream = redis.scanStream({ match: pattern, count: 100 });
    stream.on('data', (resultKeys) => {
      if (resultKeys.length) {
        const pipeline = redis.pipeline();
        resultKeys.forEach((k) => pipeline.del(k));
        pipeline.exec().catch(err => console.error('redis pipeline del err', err));
      }
    });
    // note: not awaiting end to avoid blocking; it's okay for demo
  }
}

// POST /api/v1/vitals
router.post('/',
  authMiddleware,
  body('heartRate').isNumeric(),
  body('systolic').isNumeric(),
  body('diastolic').isNumeric(),
  body('spo2').isNumeric(),
  body('temperatureC').isNumeric(),
  body('notes').optional().isString(),
  body('source').optional().isIn(['web','arduino','simulator','unknown']),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      // userId derived from token unless a doctor wants to submit for another user (future)
      const userId = req.user.userId;
      const { heartRate, systolic, diastolic, spo2, temperatureC, notes='', source='web', timestamp } = req.body;

      const rangeErrs = validateRanges({ heartRate, systolic, diastolic, spo2, temperatureC });
      if (rangeErrs.length) return res.status(400).json({ message: 'Validation error', details: rangeErrs });

      const ts = timestamp ? new Date(timestamp) : new Date();
      if (isNaN(ts.getTime())) return res.status(400).json({ message: 'Invalid timestamp' });
      // prevent far-future timestamps
      if (ts - new Date() > 1000 * 60 * 60 * 24) {
        return res.status(400).json({ message: 'timestamp cannot be more than 24 hours in the future' });
      }

      const record = await Vital.create({
        userId, timestamp: ts, heartRate, systolic, diastolic, spo2, temperatureC, notes, source
      });

      // invalidate cache for this user
      await invalidateVitalsCache(userId);

      // Optionally call ML service synchronously
      let prediction = null;
      const mlUrl = process.env.ML_SERVICE_URL;
      if (mlUrl) {
        try {
          const resp = await axios.post(`${mlUrl.replace(/\/$/, '')}/predict`, {
            age: req.body.age || null,
            heartRate, systolic, diastolic, spo2, temperatureC, userId
          }, { timeout: 2000 }); // 2s timeout
          prediction = resp.data;
        } catch (err) {
          console.warn('ML service error or timeout', err.message);
          // Do not fail the request if ML fails
        }
      }

      return res.status(201).json({ success: true, record, prediction });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/vitals/:userId?limit=20
router.get('/:userId',
  authMiddleware,
  param('userId').isMongoId(),
  query('limit').optional().isInt({ min: 1, max: 500 }),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const requestedUserId = req.params.userId;
      const limit = parseInt(req.query.limit || '20', 10);

      // Access control
      if (req.user.role === 'patient' && req.user.userId !== requestedUserId) {
        return res.status(403).json({ message: 'Forbidden: patients can only access their own vitals' });
      }
      // If doctor, optionally check assignment (not implemented in this example)

      // Try cache
      const cached = await getCachedVitals(requestedUserId, limit);
      if (cached) return res.json({ vitals: cached, source: 'cache' });

      // Query DB
      const vitals = await Vital.find({ userId: requestedUserId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      // set cache
      await setCachedVitals(requestedUserId, limit, vitals);

      return res.json({ vitals, source: 'db' });
    } catch (err) {
      next(err);
    }
  }
);

// GET latest
router.get('/:userId/latest',
  authMiddleware,
  param('userId').isMongoId(),
  async (req, res, next) => {
    try {
      const requestedUserId = req.params.userId;
      if (req.user.role === 'patient' && req.user.userId !== requestedUserId) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      // small optimization: cached for limit=1
      const cached = await getCachedVitals(requestedUserId, 1);
      if (cached && cached.length > 0) return res.json({ latest: cached[0], source: 'cache' });

      const latest = await Vital.findOne({ userId: requestedUserId }).sort({ timestamp: -1 }).lean();
      if (!latest) return res.status(404).json({ message: 'No vitals found' });

      await setCachedVitals(requestedUserId, 1, [latest]);
      return res.json({ latest, source: 'db' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;

const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { signAccessToken } = require('../utils/jwt');
const { authMiddleware } = require('../middlewares/auth');

const router = express.Router();

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
const REFRESH_TTL_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);

router.post('/signup',
  body('name').isLength({ min: 2 }),
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('role').optional().isIn(['patient','doctor']),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { name, email, password, role = 'patient' } = req.body;
      const existing = await User.findOne({ email });
      if (existing) return res.status(409).json({ message: 'Email already in use' });

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await User.create({ name, email, passwordHash, role });

      // create tokens
      const accessToken = signAccessToken({ userId: user._id, role: user.role });
      const refreshTokenValue = uuidv4();
      const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

      await RefreshToken.create({
        userId: user._id,
        token: refreshTokenValue,
        expiresAt
      });

      res.status(201).json({
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
        accessToken,
        refreshToken: refreshTokenValue
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/login',
  body('email').isEmail(),
  body('password').exists(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user) return res.status(401).json({ message: 'Invalid credentials' });

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

      // update last login
      user.lastLoginAt = new Date();
      await user.save();

      const accessToken = signAccessToken({ userId: user._id, role: user.role });
      const refreshTokenValue = uuidv4();
      const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

      await RefreshToken.create({
        userId: user._id,
        token: refreshTokenValue,
        expiresAt
      });

      res.json({
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
        accessToken,
        refreshToken: refreshTokenValue
      });
    } catch (err) {
      next(err);
    }
  }
);

// refresh token endpoint (rotate token)
router.post('/refresh', body('refreshToken').exists(), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const stored = await RefreshToken.findOne({ token: refreshToken });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // rotate: create new token, revoke old one
    const newTokenValue = uuidv4();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    stored.revoked = true;
    stored.replacedByToken = newTokenValue;
    await stored.save();

    await RefreshToken.create({
      userId: stored.userId,
      token: newTokenValue,
      expiresAt
    });

    // create new access token
    const user = await User.findById(stored.userId);
    const accessToken = signAccessToken({ userId: user._id, role: user.role });

    res.json({ accessToken, refreshToken: newTokenValue });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', body('refreshToken').exists(), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const stored = await RefreshToken.findOne({ token: refreshToken });
    if (stored) {
      stored.revoked = true;
      await stored.save();
    }
    return res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

// protected endpoint example
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    // req.user set by authMiddleware
    const user = await User.findById(req.user.userId).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

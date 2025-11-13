//require libraries
const { body, validationResult } = require("express-validator");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");

//require models
const User = require("../models/user");
const RefreshToken = require("../models/tokenRefresh");

//require middlewares
const { signAccessToken } = require("../utils/jwt");
const { authMiddleware } = require("../middlewares/auth");


const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);

const REFRESH_TTL_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '15', 5);

// sign up validator
const validator = [
    body('name').trim().notEmpty().isLength({ min: 4 }).withMessage("name is required"),
    body('email').isEmail().withMessage("invalid email"),
    body('password').trim().notEmpty().isLength({ min: 8 }).withMessage("message is required"),
    body('role').optional().isIn(['patient','doctor']),
];


//sign up controller
const signUp = async (req, res, next) => {

    try {
      //first validate fields
      const errors = validationResult(req);

      //check if errors present
      if (!errors.isEmpty()) 
        return res.status(400).json({
          success: false, 
          errors: errors.array()
      });

      //no errors ? define request body
      const { name, email, password, role = 'patient' } = req.body;

      //check if user exists
      const existing = await User.findOne({ email });

      //user exists, yes
      if (existing) 
        return res.status(409).json({
          success: false,
          message: "Email already in use"
      });

      // user doesn't exist. has password for security
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      //create user now
      const user = await User.create({ 
        name, 
        email, 
        passwordHash,
        role
      });

      // creation of  tokens

      //access token first using the payload id and role
      const accessToken = signAccessToken({ 
        userId: user._id, 
        role: user.role 
      });

      //refresh token next using the unique id
      const refreshTokenValue = uuidv4();

      //log when it expires
      const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

      //create tokens here
      await RefreshToken.create({
        userId: user._id,
        token: refreshTokenValue,
        expiresAt
      });

      //return response
      res.status(201).json({
        success: true,
        user: {
          id: user._id, 
          name: user.name, 
          email: user.email, 
          role: user.role 
        },
        accessToken,
        refreshToken: refreshTokenValue
      });

    } catch (err) {
      next(err);
    }
};

//login endpoint

const login = [ body("email").isEmail(), body("password").exists(),
  
  async ( req, res, next ) => {

    try {
      const errors = validationResult(req);

      //check if errors.isEmpty is true
      if (!errors.isEmpty()) { 
        return res.status(400).json({ 
          errors: errors.array() 
        });
      }
      
      //assign email and password to the request body
      const { email, password } = req.body;

      //check if user exists by email
      const user = await User.findOne({ email });

      //if user doesn't exist
      if (!user) { 
        return res.status(401).json({ 
          success: false,
          message: "User doesn't exist"
        });
      }

      console.log('✅ User found:', user._id);

      // if user exists, compare user passwords
      const ok = await bcrypt.compare(password, user.passwordHash);

      // if ok is false, means passwords mismatch
      if (!ok) { 
        return res.status(401).json({ 
          success : false,
          message: "Invalid password"
        });
      }

      console.log('✅ Password verified');

      //if every thing checks up correctly, update last login
      // update last login
      user.lastLoginAt = new Date();

      //save
      await user.save();

      //creation of tokens; first access token, then refresh token

      const accessToken = signAccessToken({ 
        userId: user._id, 
        role: user.role 
      });

      console.log('✅ Access token generated');

      const refreshTokenValue = uuidv4();

      const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

      console.log(REFRESH_TTL_DAYS, expiresAt)

      console.log({
        userId: user._id,
        token: refreshTokenValue,
        expiresAt
      });

      //create tokens
      await RefreshToken.create({
        userId: user._id,
        token: refreshTokenValue,
        expiresAt
      });

      //return response
      res.json({
        success: true,

        message: [
          {user: { 
            id: user._id, 
            name: user.name, 
            email: user.email, 
            role: user.role 
          }},

          {accessToken : accessToken},

          {refreshToken: refreshTokenValue}
        ]
      });

    } catch (err) {
      next(err);
    }
  }
];

// refresh token endpoint (rotate token controller)
const refresh = [ body("refreshToken").exists(),
  
  async( req, res, next ) => {

    try {
      // let's set request body to refreshToken
      const { refreshToken } = req.body;

      //finding refresh token in database
      const stored = await RefreshToken.findOne({ token: refreshToken });

      // if refresh token is not stored or revoked or expired
      if (!stored || stored.revoked || stored.expiresAt < new Date()) {
        return res.status(401).json({ 
          success: false,
          message: 'Invalid refresh token' 
        });
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

      const accessToken = signAccessToken({ 
        userId: user._id, 
        role: user.role 
      });

      //return response
      res.json({ 
        success: true,
        message: [
          {accessToken : accessToken},
          {refreshToken: newTokenValue}
        ]
      });
    } catch (err) {
      next(err);
    }
  }
];

//logout endopoint
const logout = [ body("refreshToken").exists(),

  async (req, res, next) => {

    try {

      const { refreshToken } = req.body;

      const stored = await RefreshToken.findOne({ token: refreshToken });

      if (stored) {
        stored.revoked = true;
        await stored.save();
      }

      return res.json({ 
        success: true,
        message: 'Logged out' 
      });
    } catch (err) {
      next(err);
    }
  }
]

// protected endpoint example
const instance  =  [ authMiddleware, async ( req, res, next ) => {
    try {
      // req.user set by authMiddleware
      const user = await User.findById(req.user.userId).select('-passwordHash');

      if (!user) { 
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      res.json({ 
        success: true,
        message: user 
      });
      
    } catch (err) {
      next(err);
    }
  }
]


//export module
module.exports = { signUp, validator, login, refresh, logout, instance };
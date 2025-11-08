//requiring to use the json web token
const jwt = require("jsonwebtoken");

//normal function to get access token
// a function signAccessToken, takes in the payload and returns a jwt sign of it
function signAccessToken(payload) {
  const secret = process.env.JWT_ACCESS_SECRET;
  const expiresIn = process.env.JWT_ACCESS_EXPIRY || '15m';
  return jwt.sign(payload, secret, { expiresIn });
}


// a function verifyAccessToken takes in the token and verifies using the verify function
function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

//exports both functions
module.exports = { signAccessToken, verifyAccessToken };

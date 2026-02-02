const { verifyAccessToken } = require("../utils/jwt");


// the function authMiddleware is the security gatekeeper.
// it ensures that only users with a valid JWT access token can pass through to protected routes.
function authMiddleware(req, res, next) {

  const header = req.headers['authorization'];

  //first check: header available
  if (!header) { 
    return res.status(401).json({ 
      success: false,
      message: "Authorization header missing" 
    });  
  }

  //getting the token aspect from the header
  //first, split. and split lenght should be equal to 2
  const parts = header.split(' ');

  //check if split lenght is not equal to 2 or the first part is not labeled "Bearer"
  if (parts.length !== 2 || parts[0] !== "Bearer") { 
    return res.status(401).json({ 
      success: false,
      message: "Invalid auth header"
    });
  }

  //let's get the token if all checks pass
  // the token is the first part
  const token = parts[1];

  // log the token to check 
  console.log (token);
 
  try {
    const payload = verifyAccessToken(token);

    // payload should contain userId and role
    req.user = { 
      userId: payload.userId, 
      role: payload.role 
    };
    
    next();
    
    //catch and return any error
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      error: err.message()
    });
  }
}

function roleMiddleware(requiredRoles = []) {

  return (req, res, next) => {

    if (!req.user) 
      return res.status(401).json({ 
        message: "Not authenticated"
      });

    if (!requiredRoles.includes(req.user.role)) 
      return res.status(403).json({
        message: "Forbidden"
      });

    return next();
  };
}

module.exports = { authMiddleware, roleMiddleware };

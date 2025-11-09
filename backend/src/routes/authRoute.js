//THIS IS THE ROUTE

//requiring necessary modules express
const express = require("express");

const router = express.Router();

//the functions created in the controller
const { signUp , validator , login } = require("../authController.js");

//then come and make a route for them over here
//register route
router.post( "/signup", validator, signUp );

router.post("/login", login );

module.exports = router;

//requiring statements

const mongoose = require("mongoose");

//loading the environment files
require("dotenv").config();

const express = require("express");

//controlling the amount of hits to the database within a specific time
const rateLimit = require("express-rate-limit");

// allows external clients to access the API.
const cors = require("cors");

//logs HTTP requests to the console. request method, urls, status codes,  response time, 
const morgan = require("morgan");

//allows to make use of the .env file
require("dotenv").config();

//helmet for protection against click jacking, cross sitee scripting
const helmet = require("helmet");

const authRoutes = require("./routes/authRoute");

//this handles the error
const { errorHandler } = require("./middlewares/errorHandler");

//this is creating the mini app
const app = express();

app.use(helmet());

app.use(cors 
    ({ origin: true, 
        credentials: true 
    })
);

app.use(morgan("dev"));

app.use(express.json());

// "node --watch userServer.js"

// setting up basic rate limiter to protect auth endpoints
// const apiLimiter = rateLimit({
//     windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES) * 60 * 1000,
//     max: parseInt(process.env.RATE_LIMIT_MAX_REQUEST), // limit each IP to 100 requests per windowMs
//     message: "Too many requests, please try again later."
// });

//using the rate limter
// app.use(apiLimiter);


// create  server mount
app.use("/api/auth/", authRoutes);

// error handler last
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

async function start() {
  await mongoose.connect(process.env.MONGO_URI, { });
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

if (require.main === module) {
  start().catch(err => {
    console.error('Failed to start', err);
    process.exit(1);
  });
}

// module.exports = app; // for testing

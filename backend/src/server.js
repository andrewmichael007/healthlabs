//requiring statements

const mongoose = require("mongooose");

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

//using helmet for protection against click jacking, cross sitee scripting
const helmet = require("helmet");

const authRoutes = require('./routes/auth');

//this handles the error
const { errorHandler } = require('./middlewares/errorHandler');

//this is creating the mini app
const app = express();

app.use(helmet());

app.use(cors 
    ({ origin: true, 
        credentials: true 
    })
);

app.use(express.json());

// Basic rate limiter to protect auth endpoints
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60 // limit each IP to 60 requests per windowMs
});
app.use(limiter);


app.use('/api/auth', authRoutes);

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

module.exports = app; // for testing

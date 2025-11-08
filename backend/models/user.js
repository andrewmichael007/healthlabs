// this is a the user   model file. it's basically the blue print of the data to be stored

// the user should have an id , name , email, password, role, password (hashed)

// require mongoose
const mongoose = require("mongoose");

// unique id
const { v4: uuidv4 } = require("uuid");

// a blueprint to represent how mongodb should expect and represent the user
const userSchema = new mongoose.Schema({
    id:{
        type: String,
        unique: true,
        required: true,
        default: uuidv4
    },

    name:{
        type: String,
        required: true, 
        trim : true,
        minlength: 4
    },

    email: {
      type: String,
      unique: true, 
      required: true, 
      lowercase: true,
      trim: true
    },

    passwordHash: {
      type: String,
      required: true
    },

    role: {
        type: String,
        enum: ["patient", "doctor"],
        default: "patient"
    }, 

    emailVerified: { 
        type: Boolean, 
        default: false 
    },

    lastLoginAt: { 
        type: Date
    },

    createdAt:{
        type: Date,
        default: Date.now
    },

    updatedAt:{
        type: Date, 
        default: Date.now
    }
});


userSchema.index({ email: 1 });

// export module with the name of the file and name of the schema formed
module.exports = mongoose.model(/*filename*/ "user",  userSchema /*function*/);



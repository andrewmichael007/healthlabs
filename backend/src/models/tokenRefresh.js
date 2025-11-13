const mongoose = require("mongoose");

const tokenRefreshSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true, 
        ref: 'user' 
    },

    token: { 
        type: String, 
        required: true, 
        unique: true 
    },

    revoked: { 
        type: Boolean, 
        default: false 
    },

    replacedByToken: { 
        type: String, 
        default: null 
    },

    
    createdAt: { 
        type: Date, 
        default: Date.now 
    },

    expiresAt: { 
        type: Date, 
        required: true 
    }

});

// TTL index optional for cleanup (ensure expiresAt is in the future)
tokenRefreshSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('tokenRefresh', tokenRefreshSchema);

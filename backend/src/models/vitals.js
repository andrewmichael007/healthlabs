//src/models/Vital.js
const mongoose = require('mongoose');

const vitalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', index: true },
  timestamp: { type: Date, default: () => new Date(), index: true },
  heartRate: { type: Number, required: true },
  systolic: { type: Number, required: true },
  diastolic: { type: Number, required: true },
  spo2: { type: Number, required: true },
  temperatureC: { type: Number, required: true },
  notes: { type: String, default: '' },
  source: { type: String, enum: ['web','arduino','simulator','unknown'], default: 'web' },
  meta: { type: Object, default: {} }
}, { timestamps: true });

// Compound index for fast recent queries
vitalSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Vital', vitalSchema);

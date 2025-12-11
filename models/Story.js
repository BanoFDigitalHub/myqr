const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  storyId: { type: String, required: true, unique: true },
  imageData: { type: String, required: true }, // base64 image
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Story', storySchema);

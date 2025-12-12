require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const storyRoutes = require('./routes/storyRoutes');

const app = express();

// FIX 1: Correct CORS (do NOT use CORS again later)
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://qrify.site'],
  credentials: true
}));

// FIX 2: Increase JSON limit for Base64 images
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB Error:', err));

// API Routes
app.use('/api/stories', storyRoutes);

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/view/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/reveal.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server Running on ${PORT}`));

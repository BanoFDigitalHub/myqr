require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const storyRoutes = require('./routes/storyRoutes');

const app = express();

// FIX 1 — Strong CORS for Render
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://qrify.site'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// FIX 2 — Increase body size for Base64
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// FIX 3 — Avoid Render cold start timeout
app.use((req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  next();
});

// FIX 4 — Required for Render HTTPS proxy
app.set('trust proxy', 1);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

// API Routes
app.use('/api/stories', storyRoutes);

// Serve Frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Story reveal page
app.get('/view/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/reveal.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server Running on ${PORT}`));

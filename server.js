require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const storyRoutes = require('./routes/storyRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '15mb' }));

// ✅ MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB error:', err));

// ✅ API Routes
app.use('/api/stories', storyRoutes);

// ✅ Serve frontend files (index.html etc.)
app.use(express.static(path.join(__dirname, '../frontend')));

// ✅ Story reveal route
app.get('/view/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/reveal.html'));
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
// Better CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://qrify.site'],
  credentials: true
}));
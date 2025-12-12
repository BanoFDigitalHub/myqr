require('dotenv').config();

const express = require('express');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const { nanoid } = require('nanoid');
const stream = require('stream');
const cors = require('cors');

const app = express();

// CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'https://qrify.site', 'http://127.0.0.1:5500'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'qrdatabase';
const PORT = process.env.PORT || 5000;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI missing. Set it in environment variables.');
  process.exit(1);
}

let db, bucket, storiesCollection;

// Connect to MongoDB
(async () => {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    bucket = new GridFSBucket(db, { bucketName: 'storyImages' });
    storiesCollection = db.collection('stories');
    
    await storiesCollection.createIndex({ storyId: 1 }, { unique: true });
    
    console.log('✅ Connected to MongoDB');
    console.log('📦 Database:', DB_NAME);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
})();

// Health check
app.get('/', (req, res) => {
  res.json({
    status: '✅ running',
    message: 'QRify Backend API',
    version: '1.0'
  });
});

// CREATE STORY
app.post('/api/stories', async (req, res) => {
  try {
    const { imageData } = req.body;

    if (!imageData) {
      return res.status(400).json({ 
        success: false, 
        error: 'No image data provided' 
      });
    }

    const storyId = `qrs_${nanoid(10)}`;
    console.log('📤 Saving story:', storyId);

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const readStream = new stream.PassThrough();
    readStream.end(buffer);

    const uploadStream = bucket.openUploadStream(`${storyId}.png`, {
      contentType: 'image/png',
      metadata: { storyId }
    });

    await new Promise((resolve, reject) => {
      readStream.pipe(uploadStream)
        .on('error', reject)
        .on('finish', resolve);
    });

    const fileId = uploadStream.id;

    await storiesCollection.insertOne({
      storyId,
      imageId: fileId,
      createdAt: new Date(),
      views: 0,
      contentType: 'image/png',
      fileSize: buffer.length
    });

    console.log('✅ Story saved:', storyId);

    return res.status(201).json({
      success: true,
      storyId,
      imageId: fileId.toString()
    });

  } catch (err) {
    console.error('❌ Create story error:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to create story',
      details: err.message 
    });
  }
});

// GET STORY
app.get('/api/stories/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;

    const story = await storiesCollection.findOne({ storyId });

    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    await storiesCollection.updateOne(
      { storyId },
      { $inc: { views: 1 } }
    );

    return res.json({
      success: true,
      story: {
        storyId: story.storyId,
        imageId: story.imageId.toString(),
        createdAt: story.createdAt,
        views: story.views + 1
      }
    });

  } catch (err) {
    console.error('❌ Get story error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve story' });
  }
});

// STREAM IMAGE
app.get('/api/images/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;
    const fileId = new ObjectId(imageId);

    const files = await db.collection('storyImages.files').findOne({ _id: fileId });
    
    if (!files) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');

    const downloadStream = bucket.openDownloadStream(fileId);

    downloadStream.on('error', (err) => {
      console.error('❌ Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream image' });
      }
    });

    downloadStream.pipe(res);

  } catch (err) {
    console.error('❌ Get image error:', err);
    return res.status(500).json({ error: 'Failed to retrieve image' });
  }
});

// NEW ROUTE → REDIRECT TO REVEAL PAGE
app.get('/view/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;

    const story = await storiesCollection.findOne({ storyId });

    if (!story) {
      return res.status(404).send('Story not found');
    }

    const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    const siteBase = isLocal
      ? 'http://127.0.0.1:5500'
      : 'https://qrify.site';

    return res.redirect(`${siteBase}/reveal.html?img=${story.imageId}`);

  } catch (err) {
    console.error('❌ View Route Error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 http://localhost:${PORT}`);
});

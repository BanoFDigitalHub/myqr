require('dotenv').config();

const express = require('express');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const { nanoid } = require('nanoid');
const stream = require('stream');
const cors = require('cors');

const app = express();

// ✅ CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'https://qrify.site',
    'https://www.qrify.site'
  ],
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
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
})();

// Health check
app.get('/', (req, res) => {
  res.json({ status: '✅ running', message: 'QRify Backend API', version: '1.0' });
});

// CREATE STORY
app.post('/api/stories', async (req, res) => {
  try {
    const { imageData } = req.body;

    if (!imageData) return res.status(400).json({ success: false, error: 'No image data provided' });

    const storyId = `qrs_${nanoid(10)}`;
    console.log('📤 Saving story:', storyId);

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Stream to GridFS
    const readStream = new stream.PassThrough();
    readStream.end(buffer);

    const uploadStream = bucket.openUploadStream(`${storyId}.png`, {
      contentType: 'image/png',
      metadata: { storyId }
    });

    await new Promise((resolve, reject) => {
      readStream.pipe(uploadStream)
        .on('error', err => {
          console.error('❌ GridFS Upload Error:', err);
          reject(err);
        })
        .on('finish', resolve);
    });

    const fileId = uploadStream.id;

    if (!fileId) throw new Error('File upload failed, fileId null');

    // Save story in collection
    const storyDoc = {
      storyId,
      imageId: fileId,
      createdAt: new Date(),
      views: 0,
      contentType: 'image/png',
      fileSize: buffer.length
    };

    await storiesCollection.insertOne(storyDoc);

    console.log('✅ Story saved in DB:', { storyId, fileId });

    return res.status(201).json({ success: true, storyId, imageId: fileId.toString() });

  } catch (err) {
    console.error('❌ Create story error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create story', details: err.message });
  }
});

// STREAM IMAGE
app.get('/api/images/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;
    const fileId = new ObjectId(imageId);

    const file = await db.collection('storyImages.files').findOne({ _id: fileId });
    if (!file) return res.status(404).json({ error: 'Image not found' });

    res.setHeader('Content-Type', file.contentType || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000');

    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.on('error', err => {
      console.error('❌ Stream error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to stream image' });
    });

    downloadStream.pipe(res);

  } catch (err) {
    console.error('❌ Get image error:', err);
    return res.status(500).json({ error: 'Failed to retrieve image' });
  }
});

// VIEW → redirect to reveal page
app.get('/view/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;

    const story = await storiesCollection.findOne({ storyId });
    if (!story || !story.imageId) return res.status(404).send('Story or image not found');

    const siteBase = (req.hostname === 'localhost' || req.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:5500'
      : 'https://qrify.site';

    console.log('📌 Redirecting to reveal page for story:', storyId);

    return res.redirect(`${siteBase}/reveal.html?img=${story.imageId.toString()}`);

  } catch (err) {
    console.error('❌ View Route Error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

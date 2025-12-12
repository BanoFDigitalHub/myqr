require('dotenv').config();

const express = require('express');
const multer = require('multer');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const { nanoid } = require('nanoid');
const stream = require('stream');
const cors = require('cors');

const app = express();
app.use(cors()); // agar frontend domain restricted chahte ho to configure yahan

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'qrdatabase'; // tumhare connection string me database name already ho sakta hai

if (!MONGO_URI) {
  console.error('MONGO_URI missing. Set it in environment variables.');
  process.exit(1);
}

let db, bucket, imagesCollection;

// Connect to MongoDB
(async () => {
  try {
    const client = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    db = client.db(DB_NAME);
    bucket = new GridFSBucket(db, { bucketName: 'images' });
    imagesCollection = db.collection('images'); // mapping collection
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
})();

// Multer in-memory storage (we stream buffer to GridFS)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit - change if needed
});

// Upload endpoint
// frontend must send multipart/form-data with field name: "image"
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided. Use form field name "image".' });
    }

    // generate a short public id
    const publicId = nanoid(12); // example: 12-char id

    // create a readable stream from buffer
    const readStream = new stream.PassThrough();
    readStream.end(req.file.buffer);

    // open upload stream to GridFS; store publicId in file metadata as well
    const uploadStream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
      metadata: { publicId }
    });

    readStream.pipe(uploadStream)
      .on('error', (err) => {
        console.error('GridFS upload error:', err);
        return res.status(500).json({ error: 'Upload failed', details: err.message });
      })
      .on('finish', async (file) => {
        // save mapping in images collection
        await imagesCollection.insertOne({
          publicId,
          fileId: file._id, // ObjectId
          filename: req.file.originalname,
          contentType: req.file.mimetype,
          uploadDate: file.uploadDate,
          length: file.length
        });

        // return the public id and URL (relative)
        return res.json({
          id: publicId,
          url: `/image/${publicId}`
        });
      });

  } catch (err) {
    console.error('Upload endpoint error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Serve image by public id
app.get('/image/:id', async (req, res) => {
  try {
    const publicId = req.params.id;
    const doc = await imagesCollection.findOne({ publicId });

    if (!doc) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // ensure fileId is ObjectId
    const fileId = (typeof doc.fileId === 'string') ? new ObjectId(doc.fileId) : doc.fileId;

    // stream from GridFS to response
    const downloadStream = bucket.openDownloadStream(fileId);

    // set content-type if known
    if (doc.contentType) res.setHeader('Content-Type', doc.contentType);

    downloadStream.on('error', (err) => {
      console.error('Download stream error:', err);
      return res.status(500).end();
    });

    downloadStream.pipe(res);

  } catch (err) {
    console.error('GET /image/:id error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// optional: get metadata
app.get('/image/:id/meta', async (req, res) => {
  try {
    const doc = await imagesCollection.findOne({ publicId: req.params.id }, { projection: { fileId: 0 }});
    if (!doc) return res.status(404).json({ error: 'Not found' });
    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.send('QR image backend running'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

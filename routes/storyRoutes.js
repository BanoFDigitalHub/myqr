const express = require('express');
const router = express.Router();
const Story = require('../models/Story');
const { nanoid } = require('nanoid');

// Save story
router.post('/', async (req, res) => {
  try {
    console.log('📥 Received story save request');
    const { storyId, imageData } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided' });
    }
    
    // Use provided storyId or generate new one
    const finalStoryId = storyId || 'qrs_' + nanoid(8);
    
    const story = new Story({ 
      storyId: finalStoryId, 
      imageData 
    });
    
    await story.save();
    console.log('✅ Story saved:', finalStoryId);
    
    res.json({ 
      success: true,
      storyId: finalStoryId 
    });
  } catch (err) {
    console.error('❌ Save error:', err);
    res.status(500).json({ 
      error: 'Failed to save story',
      details: err.message 
    });
  }
});

// Get story by ID
router.get('/:id', async (req, res) => {
  try {
    console.log('📖 Fetching story:', req.params.id);
    const story = await Story.findOne({ storyId: req.params.id });
    
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }
    
    res.json(story);
  } catch (err) {
    console.error('❌ Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch story' });
  }
});

module.exports = router;
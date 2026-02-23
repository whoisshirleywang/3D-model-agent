require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Store task type mapping (text-to-3d vs image-to-3d) for correct polling endpoint
const taskTypes = {};

// POST /api/generate-text
app.post('/api/generate-text', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    // Step 1: Optimize prompt via DeepSeek
    const optimizedPrompt = await optimizePrompt(description);
    console.log('Optimized prompt:', optimizedPrompt);

    // Step 2: Create Meshy text-to-3d task
    const meshyRes = await fetch('https://api.meshy.ai/openapi/v2/text-to-3d', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MESHY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'preview',
        prompt: optimizedPrompt,
        art_style: 'realistic',
      }),
    });

    const meshyData = await meshyRes.json();
    if (!meshyRes.ok) {
      console.error('Meshy error:', meshyData);
      return res.status(500).json({ error: 'Failed to create 3D task', details: meshyData });
    }

    const taskId = meshyData.result;
    taskTypes[taskId] = 'text-to-3d';
    res.json({ taskId, optimizedPrompt });
  } catch (err) {
    console.error('generate-text error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/generate-image
app.post('/api/generate-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const imageUrl = `data:${mimeType};base64,${base64}`;

    const meshyRes = await fetch('https://api.meshy.ai/openapi/v2/image-to-3d', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MESHY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageUrl,
        enable_pbr: true,
      }),
    });

    const meshyData = await meshyRes.json();
    if (!meshyRes.ok) {
      console.error('Meshy image error:', meshyData);
      return res.status(500).json({ error: 'Failed to create image-to-3d task', details: meshyData });
    }

    const taskId = meshyData.result;
    taskTypes[taskId] = 'image-to-3d';
    res.json({ taskId });
  } catch (err) {
    console.error('generate-image error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/task/:id
app.get('/api/task/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const taskType = taskTypes[taskId] || 'text-to-3d';
    const endpoint = taskType === 'image-to-3d'
      ? `https://api.meshy.ai/openapi/v2/image-to-3d/${taskId}`
      : `https://api.meshy.ai/openapi/v2/text-to-3d/${taskId}`;

    const meshyRes = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${process.env.MESHY_API_KEY}`,
      },
    });

    const data = await meshyRes.json();
    if (!meshyRes.ok) {
      return res.status(500).json({ error: 'Failed to fetch task status', details: data });
    }

    res.json({
      status: data.status,
      progress: data.progress || 0,
      model_urls: data.model_urls || null,
      thumbnail_url: data.thumbnail_url || null,
    });
  } catch (err) {
    console.error('task poll error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Optimize prompt using DeepSeek
async function optimizePrompt(userInput) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at writing prompts for 3D model generation. Convert the user\'s description into a concise, detailed English prompt optimized for generating a 3D model. Focus on shape, material, color, and style. Output only the optimized prompt text, nothing else.',
        },
        {
          role: 'user',
          content: userInput,
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error('DeepSeek API error: ' + JSON.stringify(data));
  }

  return data.choices[0].message.content.trim();
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

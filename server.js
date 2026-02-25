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

    const meshyRes = await fetch('https://api.meshy.ai/openapi/v1/image-to-3d', {
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

// POST /api/generate-text-to-image
app.post('/api/generate-text-to-image', async (req, res) => {
  try {
    const { prompt, ai_model, aspect_ratio } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Optimize prompt via DeepSeek
    const optimizedPrompt = await optimizeImagePrompt(prompt);
    console.log('Optimized image prompt:', optimizedPrompt);

    const meshyRes = await fetch('https://api.meshy.ai/openapi/v1/text-to-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MESHY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ai_model: ai_model || 'nano-banana',
        prompt: optimizedPrompt,
        aspect_ratio: aspect_ratio || '1:1',
      }),
    });

    const meshyData = await meshyRes.json();
    if (!meshyRes.ok) {
      console.error('Meshy text-to-image error:', meshyData);
      return res.status(500).json({ error: 'Failed to create text-to-image task', details: meshyData });
    }

    const taskId = meshyData.result;
    taskTypes[taskId] = 'text-to-image';
    res.json({ taskId, optimizedPrompt });
  } catch (err) {
    console.error('generate-text-to-image error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/task/:id
app.get('/api/task/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const taskType = taskTypes[taskId] || 'text-to-3d';
    let endpoint;
    if (taskType === 'image-to-3d') {
      endpoint = `https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`;
    } else if (taskType === 'text-to-image') {
      endpoint = `https://api.meshy.ai/openapi/v1/text-to-image/${taskId}`;
    } else {
      endpoint = `https://api.meshy.ai/openapi/v2/text-to-3d/${taskId}`;
    }

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
      image_urls: data.image_urls || null,
      task_type: taskType,
    });
  } catch (err) {
    console.error('task poll error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proxy-model — proxy GLB file to avoid CORS issues
app.get('/api/proxy-model', async (req, res) => {
  try {
    const modelUrl = req.query.url;
    if (!modelUrl) {
      return res.status(400).json({ error: 'url parameter is required' });
    }

    const modelRes = await fetch(modelUrl);
    if (!modelRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch model file' });
    }

    res.set({
      'Content-Type': modelRes.headers.get('content-type') || 'model/gltf-binary',
      'Access-Control-Allow-Origin': '*',
    });
    modelRes.body.pipe(res);
  } catch (err) {
    console.error('proxy-model error:', err);
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

// Optimize prompt for image generation using DeepSeek
async function optimizeImagePrompt(userInput) {
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
          content: 'You are an expert at writing prompts for AI image generation. Convert the user\'s description into a concise, detailed English prompt optimized for generating a high-quality image. Focus on composition, lighting, colors, style, and details. Output only the optimized prompt text, nothing else.',
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

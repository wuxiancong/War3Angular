import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import {GoogleGenAI} from '@google/genai';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json());

function getGeminiKeys(): string[] {
  const rawKeys = process.env['GEMINI_API_KEYS'] || process.env['GEMINI_API_KEY'] || '';
  if (!rawKeys) return [];
  return rawKeys
    .split(',')
    .map(k => k.trim().replace(/^["']|["']$/g, ''))
    .filter(k => k.length > 10);
}

async function handleGeminiGeneration(prompt: string): Promise<string> {
  const keys = getGeminiKeys();
  if (keys.length === 0) {
    throw new Error('Gemini API key not configured');
  }

  let lastError: Error | null = null;
  for (const key of keys) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      if (response.text) {
        return response.text;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error('Gemini attempt failed with key, trying next if available:', lastError.message);
    }
  }

  throw lastError || new Error('All Gemini API keys failed');
}

async function handleDeepSeekGeneration(prompt: string): Promise<string> {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `DeepSeek API Error (HTTP ${response.status})`);
  }

  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error('Empty response from DeepSeek API');
  }

  return reply;
}

/**
 * Gemini API Proxy
 */
app.post('/api/gemini', async (req, res) => {
  const prompt = req.body.prompt || req.body.contents;
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt in request body' });
  }

  try {
    const reply = await handleGeminiGeneration(prompt);
    return res.json({ reply, text: reply });
  } catch (error) {
    console.error('Gemini Proxy Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

/**
 * DeepSeek API Proxy
 */
app.post('/api/deepseek', async (req, res) => {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) {
    return res.status(500).json({ error: 'DEEPSEEK_API_KEY not configured' });
  }

  const prompt = req.body.prompt;
  if (prompt) {
    try {
      const reply = await handleDeepSeekGeneration(prompt);
      return res.json({ reply, choices: [{ message: { content: reply } }] });
    } catch (error) {
      console.error('DeepSeek Proxy Error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: msg });
    }
  }

  // Fallback to forwarding raw OpenAI format payload if messages array was provided
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'DeepSeek API Error' });
    }
    return res.json(data);
  } catch (error) {
    console.error('DeepSeek Proxy Error:', error);
    return res.status(500).json({ error: 'Failed to call DeepSeek API' });
  }
});

/**
 * Unified Chat Endpoint (supports both /api/chat and legacy /api/chat.php)
 */
const chatHandler: express.RequestHandler = async (req, res) => {
  const model = req.body.model || 'gemini';
  const prompt = req.body.prompt || req.body.message;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt in request body' });
  }

  try {
    let reply = '';
    if (model === 'deepseek') {
      reply = await handleDeepSeekGeneration(prompt);
    } else {
      reply = await handleGeminiGeneration(prompt);
    }
    return res.json({ success: true, reply, text: reply });
  } catch (error) {
    console.error(`Chat API (${model}) Error:`, error);
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg, success: false });
  }
};

app.post('/api/chat', chatHandler);
app.post('/api/chat.php', chatHandler);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

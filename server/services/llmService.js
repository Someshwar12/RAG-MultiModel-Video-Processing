// server/services/llmService.js
// Local mode: Ollama REST API (free, local)
// API mode: OpenAI GPT-4o
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../utils/logger');

const USE_LOCAL = (process.env.USE_LOCAL_MODE || 'true').toLowerCase() === 'true';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';

const PROVIDERS = { OPENAI: 'openai', LLAMA: 'llama' };

const getDefaultProvider = () => {
  if (USE_LOCAL) return PROVIDERS.LLAMA;
  const env = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
  return env === 'llama' ? PROVIDERS.LLAMA : PROVIDERS.OPENAI;
};

// --- Ollama (local, free) ---
const generateOllama = async (systemPrompt, messages, options = {}) => {
  const { temperature = 0.3, maxTokens = 2048 } = options;

  const chatMessages = [{ role: 'system', content: systemPrompt }];
  messages.forEach((m) => chatMessages.push({ role: m.role, content: m.content }));

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: chatMessages,
        stream: false,
        options: { temperature, num_predict: maxTokens },
      }),
    });

    if (!response.ok) throw new Error(`Ollama ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return data.message?.content || '';
  } catch (error) {
    logger.error(`Ollama failed: ${error.message}`);
    throw error;
  }
};

// --- OpenAI GPT-4o (paid API) ---
const generateOpenAI = async (systemPrompt, messages, options = {}) => {
  const { temperature = 0.3, maxTokens = 2048 } = options;
  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature, max_tokens: maxTokens,
  });
  return completion.choices[0]?.message?.content || '';
};

// --- Llama via Python worker (GPU) ---
const generateLlama = async (systemPrompt, messages, options = {}) => {
  const { temperature = 0.3, maxTokens = 2048 } = options;

  return new Promise((resolve, reject) => {
    const pythonExe = process.env.PYTHON_EXECUTABLE || 'python3';
    const scriptPath = path.join(__dirname, '..', 'python-workers', 'agents', 'llama_inference.py');
    const proc = spawn(pythonExe, [scriptPath], { env: { ...process.env } });

    let stdout = '', stderr = '';
    proc.stdin.write(JSON.stringify({
      system_prompt: systemPrompt, messages, temperature, max_tokens: maxTokens,
      model_path: process.env.LLAMA_MODEL_PATH || 'meta-llama/Meta-Llama-3-8B-Instruct',
    }));
    proc.stdin.end();
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Llama failed: ${stderr.slice(0, 500)}`));
      try { resolve(JSON.parse(stdout.trim()).response || ''); }
      catch (e) { resolve(stdout.trim()); }
    });
    proc.on('error', (e) => reject(e));
  });
};

// --- Unified generate ---
const generate = async (systemPrompt, messages, options = {}) => {
  const provider = options.provider || getDefaultProvider();
  logger.debug(`LLM generation via: ${provider} (local_mode=${USE_LOCAL})`);

  if (USE_LOCAL && provider !== PROVIDERS.OPENAI) {
    // Try Ollama first, then Python Llama worker, then OpenAI fallback
    try {
      return await generateOllama(systemPrompt, messages, options);
    } catch (ollamaErr) {
      logger.warn(`Ollama unavailable (${ollamaErr.message}), trying Python Llama...`);
      try {
        return await generateLlama(systemPrompt, messages, options);
      } catch (llamaErr) {
        logger.warn(`Llama failed (${llamaErr.message}), falling back to OpenAI...`);
        if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('PASTE')) {
          return await generateOpenAI(systemPrompt, messages, options);
        }
        throw new Error('No LLM available. Install Ollama (https://ollama.com) and run: ollama pull llama3.1:8b');
      }
    }
  }

  if (provider === PROVIDERS.LLAMA) {
    return generateLlama(systemPrompt, messages, options);
  }
  return generateOpenAI(systemPrompt, messages, options);
};

const formatTimestamp = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const buildRAGSystemPrompt = (transcriptChunks = [], visualChunks = [], sentimentData = null, personaConfig = null) => {
  let prompt = '';
  if (personaConfig) {
    prompt += `<persona>\nYou are ${personaConfig.speakerLabel || personaConfig.speakerId}.\nRole: ${personaConfig.role || 'Meeting Participant'}\nBehavioral Profile: ${personaConfig.behavioralProfile || 'Professional and direct.'}\nIMPORTANT: You must ONLY answer using the provided context below. Stay in character.\n</persona>\n\n`;
  } else {
    prompt += `<s>
You are the Zeta AI Analysis Brain — an expert multimodal meeting assistant.
You answer questions about the uploaded video using ONLY the transcript and visual context provided below.

CRITICAL RULES:
1. You MUST include exact timestamps in [MM:SS] format for EVERY claim you make. Reference the timestamps from the transcript context.
2. Format timestamps exactly like this: [00:14] or [02:45] — always in square brackets.
3. Start your answer by citing the most relevant timestamp first.
4. If multiple parts of the video are relevant, cite each one with its timestamp.
5. Be honest if the answer is not in the provided context.

Example format:
"At [00:14], the speaker explains that AI is built using complex algorithms. They further elaborate at [00:29] that AI is used in smartphones, cars, and social media feeds."

Now answer the user's question using ONLY the context below, always citing [MM:SS] timestamps.
</s>\n\n`;
  }
  if (transcriptChunks.length > 0) {
    prompt += '<transcript_context>\n';
    transcriptChunks.forEach((c) => {
      const t = formatTimestamp(c.startTime || c.start_time || 0);
      const s = c.speakerLabel || c.speakerId || c.speaker_id || 'Unknown';
      prompt += `[${t}] ${s}: ${c.text || c.text_preview || ''}\n`;
    });
    prompt += '</transcript_context>\n\n';
  }
  if (visualChunks.length > 0) {
    prompt += '<visual_context>\n';
    visualChunks.forEach((f) => {
      prompt += `[${formatTimestamp(f.timestamp || 0)}] VISUAL: ${f.description || f.text_preview || ''}\n`;
    });
    prompt += '</visual_context>\n\n';
  }
  if (sentimentData) {
    prompt += `<sentiment_context>\nMood: ${sentimentData.dominantEmotion || 'neutral'}\nScore: ${sentimentData.compositeScore || 50}/100\n${sentimentData.isSpike ? `Spike: ${sentimentData.spikeDescription || 'N/A'}` : ''}\n</sentiment_context>\n\n`;
  }
  return prompt;
};

module.exports = { generate, generateOpenAI, generateOllama, generateLlama, buildRAGSystemPrompt, getDefaultProvider, PROVIDERS };

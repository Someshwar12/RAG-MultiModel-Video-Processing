// server/services/embeddingService.js
// Local mode: calls Python sentence-transformers worker
// API mode: calls OpenAI text-embedding-3-small
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../utils/logger');

const USE_LOCAL = (process.env.USE_LOCAL_MODE || 'true').toLowerCase() === 'true';
const PYTHON_EXE = process.env.PYTHON_EXECUTABLE || 'python3';

const EMBEDDING_DIMENSION = USE_LOCAL
  ? parseInt(process.env.LOCAL_EMBEDDING_DIMENSION || '384')
  : 1536;
const EMBEDDING_MODEL = USE_LOCAL
  ? (process.env.LOCAL_EMBEDDING_MODEL || 'all-MiniLM-L6-v2')
  : 'text-embedding-3-small';

const embedTextLocal = async (text) => {
  const results = await embedBatchLocal([text]);
  return results[0];
};

const embedBatchLocal = async (texts) => {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', 'python-workers', 'agents', 'local_embedder.py');
    const proc = spawn(PYTHON_EXE, ['-u', script], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      cwd: path.join(__dirname, '..', 'python-workers'),
    });

    let stdout = '';
    let stderr = '';
    proc.stdin.write(JSON.stringify({ texts }));
    proc.stdin.end();
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        logger.error(`Local embedder failed: ${stderr.slice(0, 500)}`);
        return reject(new Error(`Embedding worker failed (exit ${code})`));
      }
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result.embeddings);
      } catch (e) {
        reject(new Error(`Failed to parse embedding output: ${e.message}`));
      }
    });
    proc.on('error', (e) => reject(e));
  });
};

const embedTextOpenAI = async (text) => {
  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8191),
  });
  return response.data[0].embedding;
};

const embedBatchOpenAI = async (texts) => {
  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const allEmbeddings = [];
  const BATCH = 100;

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => t.slice(0, 8191));
    const response = await openai.embeddings.create({ model: 'text-embedding-3-small', input: batch });
    const sorted = response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
    allEmbeddings.push(...sorted);
    logger.debug(`Embedded batch ${Math.floor(i / BATCH) + 1}`);
  }
  return allEmbeddings;
};

const embedText = USE_LOCAL ? embedTextLocal : embedTextOpenAI;
const embedBatch = USE_LOCAL ? embedBatchLocal : embedBatchOpenAI;

module.exports = { embedText, embedBatch, EMBEDDING_MODEL, EMBEDDING_DIMENSION };

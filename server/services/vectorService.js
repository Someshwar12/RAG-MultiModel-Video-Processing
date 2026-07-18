// server/services/vectorService.js
// Local mode: ChromaDB (in-process, persistent)
// API mode: Pinecone (cloud)
const path = require('path');
const { spawn } = require('child_process');
const { embedText } = require('./embeddingService');
const logger = require('../utils/logger');

const USE_LOCAL = (process.env.USE_LOCAL_MODE || 'true').toLowerCase() === 'true';
const PYTHON_EXE = process.env.PYTHON_EXECUTABLE || 'python3';
const NAMESPACE_TRANSCRIPTS = 'transcripts';
const NAMESPACE_VISUALS = 'visuals';

// ============================================================
// LOCAL: ChromaDB via Python subprocess
// ============================================================
const runChromaWorker = (action, payload) => {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', 'python-workers', 'agents', 'chroma_worker.py');
    const proc = spawn(PYTHON_EXE, ['-u', script], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      cwd: path.join(__dirname, '..', 'python-workers'),
    });
    let stdout = '', stderr = '';
    proc.stdin.write(JSON.stringify({ action, ...payload }));
    proc.stdin.end();
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) { logger.error(`ChromaDB worker error: ${stderr.slice(0, 500)}`); return reject(new Error(stderr.slice(0, 500))); }
      try { resolve(JSON.parse(stdout.trim())); } catch (e) { resolve({}); }
    });
    proc.on('error', (e) => reject(e));
  });
};

// ============================================================
// UPSERT
// ============================================================
const upsertTranscriptVectors = async (chunks, embeddings) => {
  if (USE_LOCAL) {
    return runChromaWorker('upsert', {
      collection: NAMESPACE_TRANSCRIPTS,
      ids: chunks.map((c) => c.id),
      embeddings,
      documents: chunks.map((c) => c.text || ''),
      metadatas: chunks.map((c) => ({
        ...c.metadata, vector_type: 'transcript', text_preview: (c.text || '').slice(0, 200),
      })),
    });
  }
  // Pinecone path
  const { getPineconeIndex } = require('../config/pinecone');
  const ns = getPineconeIndex().namespace(NAMESPACE_TRANSCRIPTS);
  const BATCH = 100;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const vectors = chunks.slice(i, i + BATCH).map((c, j) => ({
      id: c.id, values: embeddings[i + j],
      metadata: { ...c.metadata, vector_type: 'transcript', text_preview: (c.text || '').slice(0, 200) },
    }));
    await ns.upsert(vectors);
  }
};

const upsertVisualVectors = async (frames, embeddings) => {
  if (USE_LOCAL) {
    return runChromaWorker('upsert', {
      collection: NAMESPACE_VISUALS,
      ids: frames.map((f) => f.id),
      embeddings,
      documents: frames.map((f) => f.text || ''),
      metadatas: frames.map((f) => ({
        ...f.metadata, vector_type: 'visual', text_preview: (f.text || '').slice(0, 200),
      })),
    });
  }
  const { getPineconeIndex } = require('../config/pinecone');
  const ns = getPineconeIndex().namespace(NAMESPACE_VISUALS);
  const BATCH = 100;
  for (let i = 0; i < frames.length; i += BATCH) {
    const vectors = frames.slice(i, i + BATCH).map((f, j) => ({
      id: f.id, values: embeddings[i + j],
      metadata: { ...f.metadata, vector_type: 'visual', text_preview: (f.text || '').slice(0, 200) },
    }));
    await ns.upsert(vectors);
  }
};

// ============================================================
// SEARCH
// ============================================================
const searchTranscripts = async (queryText, videoId, options = {}) => {
  const { topK = 10, speakerId } = options;
  const queryVector = await embedText(queryText);

  if (USE_LOCAL) {
    const filter = { video_id: videoId };
    if (speakerId) filter.speaker_id = speakerId;
    const result = await runChromaWorker('query', {
      collection: NAMESPACE_TRANSCRIPTS, query_embedding: queryVector, n_results: topK, where: filter,
    });
    return (result.matches || []).map((m) => ({ ...m, score: m.score || 0.5 }));
  }

  const { getPineconeIndex } = require('../config/pinecone');
  const ns = getPineconeIndex().namespace(NAMESPACE_TRANSCRIPTS);
  const filter = { video_id: { $eq: videoId } };
  if (speakerId) filter.speaker_id = { $eq: speakerId };
  const results = await ns.query({ vector: queryVector, topK, filter, includeMetadata: true });
  return results.matches || [];
};

const searchVisuals = async (queryText, videoId, options = {}) => {
  const { topK = 5, diagramsOnly = false } = options;
  const queryVector = await embedText(queryText);

  if (USE_LOCAL) {
    const filter = { video_id: videoId };
    const result = await runChromaWorker('query', {
      collection: NAMESPACE_VISUALS, query_embedding: queryVector, n_results: topK, where: filter,
    });
    return (result.matches || []).map((m) => ({ ...m, score: m.score || 0.5 }));
  }

  const { getPineconeIndex } = require('../config/pinecone');
  const ns = getPineconeIndex().namespace(NAMESPACE_VISUALS);
  const filter = { video_id: { $eq: videoId } };
  const results = await ns.query({ vector: queryVector, topK, filter, includeMetadata: true });
  return results.matches || [];
};

const multimodalSearch = async (queryText, videoId, options = {}) => {
  const { topK = 10, speakerId, transcriptWeight = 0.6, visualWeight = 0.4 } = options;
  const [tResults, vResults] = await Promise.all([
    searchTranscripts(queryText, videoId, { topK: Math.ceil(topK * 1.5), speakerId }),
    searchVisuals(queryText, videoId, { topK: Math.ceil(topK * 0.75) }),
  ]);
  const merged = [
    ...tResults.map((r) => ({ ...r, weightedScore: (r.score || 0) * transcriptWeight, source: 'transcript' })),
    ...vResults.map((r) => ({ ...r, weightedScore: (r.score || 0) * visualWeight, source: 'visual' })),
  ];
  merged.sort((a, b) => b.weightedScore - a.weightedScore);
  return merged.slice(0, topK);
};

const deleteVideoVectors = async (videoId) => {
  if (USE_LOCAL) {
    await runChromaWorker('delete', { collection: NAMESPACE_TRANSCRIPTS, video_id: videoId });
    await runChromaWorker('delete', { collection: NAMESPACE_VISUALS, video_id: videoId });
    logger.info(`Deleted local vectors for video: ${videoId}`);
    return;
  }
  const { getPineconeIndex } = require('../config/pinecone');
  const index = getPineconeIndex();
  for (const ns of [NAMESPACE_TRANSCRIPTS, NAMESPACE_VISUALS]) {
    const namespace = index.namespace(ns);
    const prefix = ns === NAMESPACE_TRANSCRIPTS ? `t_${videoId}_` : `v_${videoId}_`;
    try {
      const listed = await namespace.listPaginated({ prefix });
      const ids = listed.vectors?.map((v) => v.id) || [];
      if (ids.length > 0) await namespace.deleteMany(ids);
    } catch (e) { logger.warn(`Delete failed for ${ns}: ${e.message}`); }
  }
  logger.info(`Deleted Pinecone vectors for video: ${videoId}`);
};

module.exports = {
  upsertTranscriptVectors, upsertVisualVectors,
  searchTranscripts, searchVisuals, multimodalSearch, deleteVideoVectors,
  NAMESPACE_TRANSCRIPTS, NAMESPACE_VISUALS,
};

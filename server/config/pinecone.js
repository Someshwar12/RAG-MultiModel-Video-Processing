// server/config/pinecone.js
// Conditional: only initializes Pinecone when USE_LOCAL_MODE=false
const logger = require('../utils/logger');

const USE_LOCAL = (process.env.USE_LOCAL_MODE || 'true').toLowerCase() === 'true';

let pineconeIndex = null;

const initPinecone = async () => {
  if (USE_LOCAL) {
    logger.info('Local mode — Pinecone skipped (using ChromaDB)');
    return null;
  }

  const { Pinecone } = require('@pinecone-database/pinecone');
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const indexName = process.env.PINECONE_INDEX_NAME || 'synapse-video-rag';

  const existing = await pinecone.listIndexes();
  const names = existing.indexes?.map((i) => i.name) || [];

  if (!names.includes(indexName)) {
    logger.info(`Creating Pinecone index "${indexName}"...`);
    await pinecone.createIndex({
      name: indexName, dimension: 1536, metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: process.env.PINECONE_ENVIRONMENT || 'us-east-1' } },
    });
    // Wait for ready
    const start = Date.now();
    while (Date.now() - start < 120000) {
      const desc = await pinecone.describeIndex(indexName);
      if (desc.status?.ready) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  pineconeIndex = pinecone.index(indexName);
  logger.info(`Pinecone connected to index: ${indexName}`);
  return pineconeIndex;
};

const getPineconeIndex = () => {
  if (USE_LOCAL) throw new Error('Pinecone not available in local mode — use ChromaDB vectorService');
  if (!pineconeIndex) throw new Error('Pinecone not initialized');
  return pineconeIndex;
};

module.exports = { initPinecone, getPineconeIndex };

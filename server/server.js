require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const { Server } = require('socket.io');

const connectDB = require('./config/database');
const { initPinecone } = require('./config/pinecone');
const logger = require('./utils/logger');

const USE_LOCAL = (process.env.USE_LOCAL_MODE || 'true').toLowerCase() === 'true';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set('io', io);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(morgan('dev', {
  stream: { write: (message) => logger.info(message.trim()) },
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'synapse-video-rag',
    mode: USE_LOCAL ? 'local' : 'api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use('/api/videos', require('./routes/videos'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/sentiment', require('./routes/sentiment'));
app.use('/api/transcripts', require('./routes/transcripts'));
app.use('/api/agents', require('./routes/agents'));

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);
  socket.on('join:video', (videoId) => {
    socket.join(`video:${videoId}`);
    logger.debug(`Socket ${socket.id} joined room video:${videoId}`);
  });
  socket.on('leave:video', (videoId) => { socket.leave(`video:${videoId}`); });
  socket.on('disconnect', (reason) => { logger.debug(`Socket disconnected: ${socket.id} (${reason})`); });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  logger.error(err.stack || err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    // Only init Pinecone in API mode
    if (!USE_LOCAL && process.env.PINECONE_API_KEY && !process.env.PINECONE_API_KEY.startsWith('PASTE')) {
      await initPinecone();
    } else if (USE_LOCAL) {
      logger.info('Local mode — using ChromaDB for vector storage (no Pinecone needed)');
    } else {
      logger.warn('PINECONE_API_KEY not set — vector search unavailable');
    }

    const fs = require('fs');
    const dirs = [
      path.join(__dirname, 'uploads'),
      path.join(__dirname, 'uploads', 'videos'),
      path.join(__dirname, 'uploads', 'audio'),
      path.join(__dirname, 'uploads', 'frames'),
      path.join(__dirname, 'logs'),
    ];
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    const vectorDb = USE_LOCAL ? 'ChromaDB (local)' : (process.env.PINECONE_API_KEY ? 'Pinecone' : 'Not configured');
    const llm = USE_LOCAL ? `Ollama (${process.env.OLLAMA_MODEL || 'llama3.1:8b'})` : 'GPT-4o';
    const whisper = USE_LOCAL ? `Local Whisper (${process.env.LOCAL_WHISPER_MODEL || 'base'})` : 'OpenAI Whisper API';

    server.listen(PORT, () => {
      logger.info(`
╔══════════════════════════════════════════════════════════╗
║          ZETA MULTIMODAL VIDEO-RAG SERVER                ║
║──────────────────────────────────────────────────────────║
║  Status:     ONLINE                                      ║
║  Mode:       ${(USE_LOCAL ? 'LOCAL (FREE)' : 'API (PAID)').padEnd(42)}║
║  Port:       ${String(PORT).padEnd(42)}║
║  MongoDB:    Connected                                   ║
║  Vectors:    ${vectorDb.padEnd(42)}║
║  LLM:        ${llm.padEnd(42)}║
║  Whisper:    ${whisper.padEnd(42)}║
║  Client:     ${(process.env.CLIENT_URL || 'http://localhost:5173').padEnd(42)}║
╚══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error(`Server startup failed: ${error.message}`);
    process.exit(1);
  }
};

startServer();

module.exports = { app, server, io };

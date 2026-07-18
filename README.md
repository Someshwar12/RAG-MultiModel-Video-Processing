# 🧠 Zeta — Multimodal Video-RAG Platform

> **Turn your videos into conversational knowledge.**
> A dual-stream (Audio + Visual) Retrieval-Augmented Generation system with agentic workflows.

![Deep Tech Dark Mode](./docs/dashboard-preview.png)

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                     │
│  Landing Page │ Processing HUD │ Dashboard + Chat + MoodMap  │
└───────────────────────┬─────────────────────────────────────┘
                        │ REST API + WebSocket (Socket.IO)
┌───────────────────────▼─────────────────────────────────────┐
│                 Express.js Backend (Node.js)                 │
│  Auth │ Video Upload │ RAG Query │ Chat │ Agent Orchestrator │
└──────┬────────────────┬─────────────────────┬───────────────┘
       │                │                     │
  ┌────▼────┐   ┌───────▼───────┐   ┌────────▼────────┐
  │ MongoDB │   │   Pinecone    │   │ Python Workers   │
  │ Schemas │   │ Vector Store  │   │ (child_process)  │
  │         │   │ (Serverless)  │   │                  │
  │ • Video │   │ • Transcript  │   │ • WhisperX       │
  │ • Trans │   │   Embeddings  │   │ • Pyannote       │
  │ • Visual│   │ • Visual      │   │ • Qwen2.5-VL     │
  │ • Sent. │   │   Embeddings  │   │ • Sentiment      │
  │ • Chat  │   │               │   │ • Fact-Check      │
  └─────────┘   └───────────────┘   └──────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18
- Python >= 3.10
- MongoDB (local or Atlas)
- FFmpeg installed locally
- Pinecone account (free tier works)
- OpenAI API key

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/synapse-video-rag.git
cd synapse-video-rag

# 2. Install all dependencies
npm run install:all

# 3. Install Python ML dependencies
npm run setup:python

# 4. Configure environment
cp server/.env.example server/.env
# Edit server/.env with your API keys

# 5. Start development servers
npm run dev
```

The client runs on `http://localhost:5173` and the server on `http://localhost:5000`.

## 📁 Project Structure

```
synapse-video-rag/
├── package.json              # Root monorepo scripts
├── server/
│   ├── server.js             # Express entry point + Socket.IO
│   ├── config/
│   │   ├── database.js       # MongoDB connection
│   │   └── pinecone.js       # Pinecone initialization
│   ├── models/
│   │   ├── User.js           # Auth & profile
│   │   ├── Video.js          # Video metadata + pipeline state
│   │   ├── Transcript.js     # Timestamped speaker-diarized chunks
│   │   ├── VisualDescription.js  # VLM frame descriptions
│   │   ├── SentimentInsight.js   # Mood Map time-series data
│   │   └── ChatSession.js    # Chat history + RAG context
│   ├── routes/               # API route definitions (Phase 2)
│   ├── controllers/          # Route handlers (Phase 2)
│   ├── services/             # Business logic (Phase 2-4)
│   ├── middleware/
│   │   └── auth.js           # JWT authentication
│   ├── utils/
│   │   └── logger.js         # Winston logger
│   └── python-workers/
│       ├── requirements.txt  # Python ML dependencies
│       ├── config.py         # Hardware constraints (batch_size=4, IMG_SIZE=256)
│       ├── audio/            # WhisperX + Pyannote (Phase 3)
│       ├── visual/           # Frame extraction + VLM (Phase 3)
│       └── agents/           # Fact-checker, Sentiment (Phase 4)
└── client/
    ├── vite.config.js        # Vite + proxy config
    ├── tailwind.config.js    # Synapse dark theme
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx           # Router setup
    │   ├── styles/globals.css
    │   └── components/       # UI components (Phases 5-6)
    └── public/
```

## ⚠️ Critical Hardware Constraints

When processing video locally, the visual pipeline **MUST** use:
- `batch_size = 4`
- `IMG_SIZE = 256`

These are enforced in `server/python-workers/config.py` and prevent OOM crashes on 16-24GB GPUs.

## 📦 Phased Build Plan

| Phase | Description | Status |
|-------|-------------|--------|
| 1     | Project Setup, Schemas, Config | ✅ Complete |
| 2     | Express Backend & Pinecone APIs | ⏳ Next |
| 3     | Python ML Ingestion Scripts | ⬜ Pending |
| 4     | Agentic RAG Logic | ⬜ Pending |
| 5     | Frontend: Landing & Loading | ⬜ Pending |
| 6     | Frontend: Main Dashboard | ⬜ Pending |

## 📄 License

MIT

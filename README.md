# Zeta — Multimodal Retrieval-Augmented Generation for Temporally-Grounded Video Understanding

<p align="center">
  <img src="https://img.shields.io/badge/status-completed-success" alt="status">
  <img src="https://img.shields.io/badge/stack-MERN%20%2B%20Python-orange" alt="stack">
  <img src="https://img.shields.io/badge/mode-local%20%7C%20API-blue" alt="mode">
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="license">
</p>

<p align="center">
  <em>An academic capstone project exploring multimodal RAG, speaker-aware retrieval, and agentic self-verification for unstructured video corpora.</em>
</p>

---

## Abstract

The volume of unstructured video data produced by recorded meetings, lectures, and webinars has grown far faster than our ability to retrieve information from it. Once a recording ends, it collapses into what this project refers to as "Dark Data" — content that is stored, but never searched, because doing so requires linear playback rather than structured query. Zeta is a Multimodal Retrieval-Augmented Generation (RAG) system that treats a video not as a media file but as a temporally-indexed, cross-modal knowledge base. It fuses a dual-stream ingestion pipeline — automatic speech recognition with speaker diarization on one stream, and Vision-Language Model captioning on the other — into a unified vector index anchored by timestamp. On top of this index, the system layers four agentic behaviors: Scoped RAG for persona-restricted retrieval (the "Virtual Participant"), autonomous web-grounded fact-checking, sentiment-timeline analysis, and diagram digitalization. The entire pipeline is designed under a dual-mode constraint — it runs identically on a fully local, open-weight stack (Whisper, BLIP, Llama 3.1, ChromaDB) for zero-cost, privacy-preserving inference on consumer GPUs, or on a cloud-API stack (GPT-4o, Pinecone) for higher-fidelity synthesis — with hardware-aware batching (batch_size=4, IMG_SIZE=256, fp16) to keep the local path within a 16 GB VRAM budget.

This repository documents the system's architecture, the algorithmic choices behind it, its empirical performance, and — deliberately — its limitations, since the latter are as informative as the former for anyone evaluating the design.

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Key Contributions](#2-key-contributions)
3. [System Architecture](#3-system-architecture)
4. [Core Features](#4-core-features)
5. [Algorithmic Highlights](#5-algorithmic-highlights)
6. [Dual-Mode Design: Local vs. API](#6-dual-mode-design-local-vs-api)
7. [Technology Stack](#7-technology-stack)
8. [Quantitative Evaluation](#8-quantitative-evaluation)
9. [Installation & Quick Start](#9-installation--quick-start)
10. [Repository Structure](#10-repository-structure)
11. [Limitations](#11-limitations)
12. [Future Research Directions](#12-future-research-directions)
13. [Research Relevance](#13-research-relevance)
14. [Citation](#14-citation)
15. [References](#15-references)
16. [Acknowledgments](#16-acknowledgments)
17. [License](#17-license)

---

## 1. Motivation

Organizations and universities generate hundreds of hours of recorded video every week — Zoom meetings, lecture captures, webinars — yet industry estimates suggest that under 15% of this content is ever revisited after the first viewing. The reason is structural, not behavioral: video is a linear medium. Locating a single 30-second architectural decision inside a 90-minute recording currently requires either perfect memory of the timestamp or brute-force scrubbing.

Standard text-based RAG cannot solve this, because it is blind to two dimensions that carry most of the information in a recorded session: who said something, and what was on screen when they said it. A transcript alone tells you a claim was made; it does not tell you which of three speakers made it, whether they were pointing at a whiteboard diagram at the time, or whether the claim was even true. Zeta was built to close this gap — treating video ingestion as a *multimodal* retrieval problem rather than a transcription problem, and treating the output as a *grounded, navigable* answer rather than a summary.

## 2. Key Contributions

- Timestamp-anchored multimodal indexing. Every unit of extracted information — a transcript chunk, a visual frame description, a sentiment score, a speaker label — is stored with an explicit temporal range, allowing a single query to retrieve and fuse evidence across modalities at the same moment in the recording.
- An `O(log N)` speaker-word alignment algorithm. Word-level ASR timestamps and diarization segments come from independent models with independent Voice Activity Detection, so they drift relative to each other. Zeta resolves this with an interval-tree-based temporal intersection search rather than a naive O(N·M) pairwise comparison (§5.1).
- Scoped RAG for persona simulation. The "Virtual Participant" feature restricts retrieval to a single speaker's contributions via a metadata filter injected at the vector-search layer, enabling a chat interface that answers *as* a specific meeting participant without leaking information they never said or heard.
- Agentic self-verification. Beyond single-shot retrieval, the system includes a "Smart Agent" mode that inspects its own retrieved context for contradictions or coverage gaps and triggers a second, reformulated search before answering — and a separate autonomous fact-checking agent that extracts empirical claims and verifies them against live web search.
- A reproducible dual-mode architecture. Every model-dependent service (transcription, embedding, vector storage, LLM inference, visual captioning) is implemented behind a single toggle so the identical pipeline runs on free, local, open-weight models or on paid cloud APIs — with no code branching required at the call site.
- Hardware-constrained deployment. The visual pipeline is explicitly engineered against a 16 GB consumer-GPU VRAM budget (fixed batch size, resolution capping, fp16 inference, explicit cache flushing) rather than assuming datacenter-class hardware, which is where most published multimodal pipelines are benchmarked.

## 3. System Architecture

Zeta is organized as three cooperating layers, connected by a lightweight JSON-over-stdio protocol rather than an internal network:

```text
┌──────────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER   React 18 · Vite · Zustand · Socket.IO       │
│  Landing → Processing (live progress) → Dashboard (chat/          │
│  transcript/mood-map, timestamp-synced video player)              │
└───────────────────────────────┬──────────────────────────────────┘
                                │ REST + WebSocket
┌───────────────────────────────▼──────────────────────────────────┐
│  APPLICATION LAYER    Node.js · Express · Socket.IO server        │
│  Route → Controller → Service orchestration                       │
│  processingService → spawns Python workers, streams progress      │
│  ragService / llmService / embeddingService / vectorService      │
└──────────────┬──────────────────────────────────┬─────────────────┘
               │ stdin/stdout JSON                 │
┌──────────────▼─────────────────┐   ┌─────────────▼──────────────┐
│  INTELLIGENCE LAYER (Python)    │   │  PERSISTENCE LAYER          │
│  Audio: Whisper + Pyannote      │   │  MongoDB — metadata,        │
│         + IntervalTree align    │   │  transcripts, sentiment     │
│  Visual: OpenCV + BLIP /        │   │  ChromaDB (local) /         │
│          Qwen2.5-VL + keyword   │   │  Pinecone (API) — vectors   │
│          classification         │   │  384-dim (local) /          │
│  Agents: fact-checker,          │   │  1536-dim (API) embeddings  │
│          sentiment analyzer     │   │                              │
└────────────────────────────────┘   └─────────────────────────────┘
```

The choice of a subprocess bridge over a microservice-with-HTTP pattern was deliberate: it avoids a second network stack for what is, functionally, a single logical application, and keeps the Python ML environment (torch, transformers, whisper) cleanly isolated from the Node runtime without adding operational surface area (no extra server to deploy, monitor, or version).

## 4. Core Features

| Feature | What it does |
|---|---|
| Multimodal RAG Chat | Natural-language queries are answered by fusing transcript and visual retrieval (weighted 0.6 / 0.4), with every claim in the response cited to a clickable [MM:SS] timestamp that auto-seeks the video player. |
| Speaker Diarization | Pyannote-based diarization attributes every spoken word to a speaker identity, aligned to Whisper's word timestamps via the interval-tree algorithm in §5.1. |
| Virtual Participant (Scoped RAG) | Chat with a persona reconstructed from one speaker's contributions only. The vector search is filtered by speaker_id at query time, so the model cannot answer using information that speaker never said or heard. |
| Mood Map | A sentiment timeline (via lexicon-based polarity scoring) plotted alongside the video, with automatic spike detection for moments of conflict or agreement — each spike is a clickable seek target. |
| Bullshit Detector | An autonomous agent that extracts verifiable empirical claims from the transcript, issues web searches for evidence, and renders a VERIFIED / CONTRADICTED / UNVERIFIABLE verdict with source citations. |
| Whiteboard / Diagram Digitalizer | Frames are classified for visual content (diagram, slide, whiteboard, code, chart) via keyword analysis of VLM captions; matched frames can be exported as an annotated PDF or converted toward editable diagram code. |
| Smart Agent | A multi-step retrieval loop that verifies its own retrieved context for contradictions before answering, performing a second targeted search when the initial evidence is insufficient. |
| Dual LLM Toggle | Switch between a local Llama 3.1 (via Ollama) and GPT-4o mid-conversation, with automatic fallback if the preferred provider is unavailable. |

## 5. Algorithmic Highlights

### 5.1 Temporal Alignment via Interval Trees

Whisper produces word-level timestamps; Pyannote produces speaker-turn segments. Because the two models use independent Voice Activity Detection front ends, their outputs cannot be merged by simple timestamp equality — segments drift relative to each other by tens to hundreds of milliseconds. For a word W with boundaries [W_start, W_end] and a candidate speaker segment S_k = [S_k,start, S_k,end], the assignment is made by maximizing temporal intersection:

```text
I_k = max(0, min(W_end, S_k,end) − max(W_start, S_k,start))
speaker(W) = argmax_k  I_k
```

Rather than testing every word against every segment (O(N·M)), speaker segments are indexed in an interval tree, reducing the per-word overlap query to O(log M) and the full alignment pass to O(N log M) — the difference between a tractable and an intractable operation once a one-hour recording produces on the order of 10,000 words and several hundred speaker turns.

### 5.2 Weighted Multimodal Score Fusion

A query is embedded once and searched against two independent vector collections (transcript, visual). Results are merged by a configurable linear combination:

```text
score_transcript = cosine_similarity × 0.6
score_visual      = cosine_similarity × 0.4
```

rather than concatenating or averaging the embedding spaces directly, which would destroy the distinct semantic topology of each modality (a visual embedding of "a whiteboard diagram" and a text embedding of the words *"let's discuss the diagram"* are not comparable quantities and should not be pooled before scoring).

### 5.3 Hardware-Constrained Visual Inference

The visual pipeline is bounded by two explicit constants — VISUAL_BATCH_SIZE = 4 and IMG_SIZE = 256 — chosen to keep peak VRAM usage under the ceiling of common 16 GB consumer GPUs. Frames are processed in fixed batches with torch.cuda.empty_cache() called between batches, producing a sawtooth memory profile rather than unbounded linear growth; fp16 inference is used wherever CUDA is available, roughly halving both memory footprint and latency relative to fp32.

## 6. Dual-Mode Design: Local vs. API

A single environment variable, USE_LOCAL_MODE, switches every model-dependent component in the system simultaneously:

| Component | Local Mode (default) | API Mode |
|---|---|---|
| Transcription | openai-whisper (local, tiny/base/medium) | OpenAI Whisper API |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2, 384-dim) | text-embedding-3-small (1536-dim) |
| Vector store | ChromaDB (on-disk, persistent) | Pinecone (serverless) |
| Chat LLM | Ollama, Llama 3.1 (8B) | GPT-4o |
| Visual captioning | BLIP (image-captioning-base) | GPT-4o Vision |
| Cost per 1-hr video | $0 | ≈ $0.26 – $3.60 (API-dependent) |
| Data residency | Never leaves the host machine | Sent to third-party APIs |

Both paths implement the identical service interface, so the orchestration logic, prompt construction, and frontend are entirely mode-agnostic — the toggle is read once, at the service boundary, not threaded through call sites.

## 7. Technology Stack

Frontend — React 18, Vite, Tailwind CSS, Framer Motion, Zustand, Recharts, Socket.IO client

Backend — Node.js, Express.js, Socket.IO, Mongoose

Databases — MongoDB (relational-style metadata), ChromaDB / Pinecone (vector search)

ML / Intelligence — OpenAI Whisper, Pyannote.audio, BLIP / Qwen2.5-VL, Sentence-Transformers, Ollama (Llama 3.1), GPT-4o, Tavily (web search), lexicon-based sentiment scoring

Infrastructure — FFmpeg (media conversion & extraction), Python 3.11 (ML worker runtime)

## 8. Quantitative Evaluation

Benchmarks below are from local-mode processing on a 16 GB consumer GPU.

| Metric | Result |
|---|---|
| Ingestion time, 5-minute video | ≈ 2.5 minutes (local), < 2 minutes (API) |
| Ingestion time, 60-minute video | ≈ 27 minutes (local) |
| Peak GPU VRAM (visual pipeline) | 12.4 GB / 16 GB budget |
| Retrieval-to-response latency | 2.8 s (local Llama) / 1.5 s (GPT-4o) |
| Timestamp navigation accuracy | ≈ 98% |
| Raw-video-to-index compression ratio | ≈ 83 : 1 |
| Fact-checker claim detection | 88% of manually-identified factual claims |
| Cost reduction, local vs. API mode | ≈ 92% (per-video basis) |

These figures are drawn from the system-testing phase of the accompanying project report and should be read as indicative of a single-GPU, single-user development environment rather than a production SLA.

## 9. Installation & Quick Start

Prerequisites: Node.js ≥ 18, Python 3.11, MongoDB, FFmpeg, and — for local mode — Ollama with an installed model (e.g. `ollama pull llama3.1:8b`).

### 1. Clone and install

```bash
git clone https://github.com/Someshwar12/RAG-MultiModel-Video-Processing.git
npm run install:all
```

### 2. Python environment

From the project root:

```bash
python -m venv .venv
```

Windows:

```powershell
.venv\Scripts\Activate.ps1
```

Linux/macOS:

```bash
source .venv/bin/activate
```

Install Python dependencies:

```bash
pip install -r server/python-workers/requirements.txt
```

### 3. Configure environment

Create your environment configuration according to the variables required by the server.

Set:

```text
USE_LOCAL_MODE=true
```

for the free/local path, or add the required API keys for cloud mode.

`PYTHON_EXECUTABLE` must point to the Python interpreter used by the project.

### 4. Run

```bash
npm run dev
```

Client → `http://localhost:5173`

Server → `http://localhost:5000`

## 10. Repository Structure

```text
ZETA-RAG/
├── client/                         React frontend
│   ├── src/
│   │   ├── components/             ChatPanel · VideoPlayer · MoodMap · modals
│   │   ├── context/                Zustand store
│   │   ├── hooks/                  useChat · useProcessing
│   │   ├── pages/                  Landing · Processing · Dashboard
│   │   ├── services/               API client · Socket.IO client
│   │   ├── styles/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── data/                           Application and database data
│   └── db/
│
├── server/                         Node.js backend
│   ├── config/
│   ├── controllers/
│   ├── logs/
│   ├── middleware/
│   ├── models/
│   ├── node_modules/
│   ├── python-workers/
│   ├── routes/
│   ├── services/
│   ├── uploads/
│   ├── utils/
│   ├── .env
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
│
├── .gitignore
├── LICENSE
├── package.json
├── package-lock.json
└── README.md
```

## 11. Limitations

Stated plainly, for anyone assessing the design rather than the demo:

- Diarization degrades under overlapping speech. Accuracy drops from ≈ 95% in clean turn-taking conversation to ≈ 78% when multiple speakers talk simultaneously — a known weakness of clustering-based diarization rather than a Zeta-specific bug.
- Small on-screen text is unreliable. BLIP (local mode) is a captioning model, not an OCR system; dense code snippets or small mathematical notation on a shared screen are frequently missed or paraphrased rather than transcribed verbatim. GPT-4o Vision (API mode) handles this better but is not lossless either.
- Local LLMs require aggressive prompt engineering to cite sources reliably. Llama 3.1 (8B) does not follow "always cite a timestamp" instructions as consistently as GPT-4o without an explicit, example-driven system prompt — this is an instruction-following gap in the underlying open-weight model, not the retrieval layer.
- ChromaDB is single-node. The local vector store trades Pinecone's managed, horizontally-scalable architecture for zero cost and full data locality; it is appropriate for individual or small-team use, not multi-tenant production scale without further engineering.
- No formal hallucination benchmark. Fact-checking coverage (88% claim detection) and grounding accuracy were evaluated manually against a small internal test set, not against a standardized RAG evaluation benchmark (e.g. RAGAS, TruthfulQA-style protocols) — this is flagged explicitly as a gap for future rigor rather than glossed over.

## 12. Future Research Directions

- GraphRAG-style relational indexing — moving beyond flat vector similarity to a knowledge-graph layer that can connect entities and decisions *across* videos, not just within one.
- Real-time streaming ingestion — adapting the batch pipeline to process a live meeting incrementally, enabling mid-meeting query rather than post-hoc analysis only.
- Multi-agent consensus fact-checking — replacing the single-LLM-judge verification step with an ensemble that votes on claim veracity, to reduce single-model hallucination in the verifier itself.
- Formal RAG evaluation — adopting a standardized grounding/faithfulness benchmark to replace the current manual spot-check methodology.
- Edge deployment via aggressive quantization — exploring INT4/AWQ quantization of the visual and language models to target on-device inference on NPU-equipped laptops rather than discrete GPUs.
- Cross-modal speaker verification — fusing acoustic diarization with facial recognition on the visual stream to resolve speaker identity ambiguity that audio alone cannot settle.

## 13. Research Relevance

This project sits at the intersection of several active research threads, which is the framing under which it was built rather than an after-the-fact justification:

- Retrieval-Augmented Generation — extending RAG from unimodal text retrieval (Lewis et al., 2020) to a temporally-grounded, multimodal setting.
- Multimodal representation learning — evaluating the trade-offs between contrastive (CLIP), generative-captioning (BLIP), and dynamic-resolution (Qwen2.5-VL) vision-language architectures for a non-entertainment, information-dense visual domain.
- Speaker diarization and temporal alignment — the interval-tree alignment method here is a general solution to any two-model, independently-timestamped fusion problem, not specific to this application.
- Agentic and self-verifying LLM systems — the Smart Agent's contradiction-detection loop and the Bullshit Detector's claim-extraction-then-verify pipeline are small-scale instances of the broader research question of how LLM systems can check their own outputs before presenting them.
- Efficient inference under hardware constraints — the batching, resolution-capping, and precision choices documented in §5.3 are a practical case study in deploying multimodal pipelines outside datacenter-class hardware.

## 14. Citation

If you build on this work or reference it academically, please cite:

```bibtex
@misc{zeta_video_rag_2026,
  title        = {Zeta: A Local-First Multimodal Retrieval-Augmented Generation
                  System for Temporally-Grounded Video Understanding},
  author       = {Someshwar Pratap Singh},
  year         = {2026},
  howpublished = {\url{https://github.com/Someshwar12/RAG-MultiModel-Video-Processing}},
  note         = {B.Tech Major Project}
}
```

## 15. References

1. A. Vaswani et al., "Attention is all you need," *NeurIPS*, 2017.
2. P. Lewis et al., "Retrieval-augmented generation for knowledge-intensive NLP tasks," *NeurIPS*, vol. 33, 2020.
3. A. Radford et al., "Robust speech recognition via large-scale weak supervision," *arXiv:2212.04356*, 2022.
4. H. Bredin et al., "pyannote.audio: neural building blocks for speaker diarization," *ICASSP*, 2020.
5. S. Bai et al., "Qwen2.5-VL Technical Report," *arXiv:2502.13923*, 2025.
6. Meta AI, "The Llama 3 Herd of Models," Technical Report, 2024.
7. J. Li et al., "BLIP: Bootstrapping Language-Image Pre-training for Unified Vision-Language Understanding and Generation," *ICML*, 2022.
8. N. Reimers and I. Gurevych, "Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks," *EMNLP*, 2019.
9. A. Radford et al., "Learning transferable visual models from natural language supervision," *ICML*, 2021.
10. H. Liu et al., "Visual Instruction Tuning (LLaVA)," *NeurIPS*, 2023.

## 16. Acknowledgments

This project was developed as a B.Tech major project. It draws directly on the open-source models and frameworks listed in the technology stack and references sections above, without which a project of this scope would not be feasible for an individual student to build and evaluate end-to-end.

## 17. License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center"><em>Zeta treats a recording not as something you watch, but as something you query.</em></p>

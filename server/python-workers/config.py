import os, sys, json
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    example_path = Path(__file__).resolve().parent.parent / ".env.example"
    if example_path.exists():
        load_dotenv(example_path)

# --- Mode Toggle ---
USE_LOCAL_MODE = os.getenv("USE_LOCAL_MODE", "true").lower() == "true"

# --- Hardware ---
VISUAL_BATCH_SIZE = int(os.getenv("VISUAL_BATCH_SIZE", "4"))
VISUAL_IMG_SIZE = int(os.getenv("VISUAL_IMG_SIZE", "256"))
FRAME_EXTRACTION_FPS = float(os.getenv("FRAME_EXTRACTION_FPS", "0.2"))
USE_LOCAL_VLM = os.getenv("USE_LOCAL_VLM", "true").lower() == "true"

# --- API Keys (only used when USE_LOCAL_MODE=false) ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
HF_AUTH_TOKEN = os.getenv("HF_AUTH_TOKEN", "")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "synapse-video-rag")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# --- Local Mode Settings ---
LOCAL_WHISPER_MODEL = os.getenv("LOCAL_WHISPER_MODEL", "base")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
LOCAL_EMBEDDING_MODEL = os.getenv("LOCAL_EMBEDDING_MODEL", "all-MiniLM-L6-v2")
LOCAL_EMBEDDING_DIMENSION = int(os.getenv("LOCAL_EMBEDDING_DIMENSION", "384"))

# --- Models ---
WHISPER_MODEL = "whisper-1"
VLM_MODEL_LOCAL = "Qwen/Qwen2.5-VL-7B-Instruct-AWQ"
VLM_MODEL_API = "gpt-4o"

# --- Paths ---
UPLOAD_DIR = os.getenv("UPLOAD_DIR", str(Path(__file__).resolve().parent.parent / "uploads"))
FRAMES_DIR = os.path.join(UPLOAD_DIR, "frames")
AUDIO_DIR = os.path.join(UPLOAD_DIR, "audio")
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", str(Path(__file__).resolve().parent.parent / "chroma_db"))

EMBEDDING_MODEL = LOCAL_EMBEDDING_MODEL if USE_LOCAL_MODE else "text-embedding-3-small"
EMBEDDING_DIMENSION = LOCAL_EMBEDDING_DIMENSION if USE_LOCAL_MODE else 1536
SENTIMENT_WINDOW_SECONDS = 30

def emit_progress(stage, progress, message=""):
    print(json.dumps({"type": "progress", "stage": stage, "progress": progress, "message": message}), flush=True)

def emit_result(data):
    print(json.dumps({"type": "result", "data": data}), flush=True)

def emit_error(message):
    print(json.dumps({"type": "error", "message": message}), flush=True)

def read_input():
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as e:
        emit_error(f"Invalid JSON input: {e}")
        return {}

#!/usr/bin/env python3
"""Local embedding worker using sentence-transformers.
Called by Node.js embeddingService.js when USE_LOCAL_MODE=true.
Input: { texts: [...] }
Output: { embeddings: [[...], ...], dimension: 384 }
"""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import LOCAL_EMBEDDING_MODEL

def main():
    raw = sys.stdin.read()
    params = json.loads(raw) if raw.strip() else {}
    texts = params.get("texts", [])

    if not texts:
        print(json.dumps({"embeddings": [], "dimension": 384}))
        return

    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(LOCAL_EMBEDDING_MODEL)
    embeddings = model.encode(texts, show_progress_bar=False, normalize_embeddings=True)
    result = [emb.tolist() for emb in embeddings]
    print(json.dumps({"embeddings": result, "dimension": len(result[0])}))

if __name__ == "__main__":
    main()

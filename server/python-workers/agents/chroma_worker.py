#!/usr/bin/env python3
"""ChromaDB vector store worker — called by Node.js vectorService.js
Actions: upsert, query, delete
"""
import sys, json, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import CHROMA_PERSIST_DIR

def get_client():
    import chromadb
    os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
    return chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)

def main():
    raw = sys.stdin.read()
    params = json.loads(raw) if raw.strip() else {}
    action = params.get("action", "")

    try:
        client = get_client()

        if action == "upsert":
            collection_name = params.get("collection", "default")
            collection = client.get_or_create_collection(name=collection_name, metadata={"hnsw:space": "cosine"})

            ids = params.get("ids", [])
            embeddings = params.get("embeddings", [])
            documents = params.get("documents", [])
            metadatas = params.get("metadatas", [])

            # ChromaDB metadata values must be str, int, float, or bool
            clean_metas = []
            for m in metadatas:
                clean = {}
                for k, v in m.items():
                    if v is None:
                        clean[k] = ""
                    elif isinstance(v, (str, int, float, bool)):
                        clean[k] = v
                    else:
                        clean[k] = str(v)
                clean_metas.append(clean)

            # Batch upsert (ChromaDB limit ~5000 per call)
            BATCH = 1000
            for i in range(0, len(ids), BATCH):
                end = min(i + BATCH, len(ids))
                collection.upsert(
                    ids=ids[i:end],
                    embeddings=embeddings[i:end] if embeddings else None,
                    documents=documents[i:end] if documents else None,
                    metadatas=clean_metas[i:end] if clean_metas else None,
                )

            print(json.dumps({"status": "ok", "count": len(ids)}))

        elif action == "query":
            collection_name = params.get("collection", "default")
            collection = client.get_or_create_collection(name=collection_name, metadata={"hnsw:space": "cosine"})

            query_embedding = params.get("query_embedding", [])
            n_results = params.get("n_results", 10)
            where = params.get("where", None)

            query_params = {
                "query_embeddings": [query_embedding],
                "n_results": min(n_results, collection.count()) if collection.count() > 0 else 1,
            }
            if where:
                query_params["where"] = where

            try:
                results = collection.query(**query_params)
            except Exception as e:
                # If filter fails, try without filter
                results = collection.query(
                    query_embeddings=[query_embedding],
                    n_results=min(n_results, max(collection.count(), 1)),
                )

            matches = []
            if results and results.get("ids") and results["ids"][0]:
                ids = results["ids"][0]
                distances = results.get("distances", [[]])[0]
                metadatas = results.get("metadatas", [[]])[0]
                documents = results.get("documents", [[]])[0]

                for j, id_val in enumerate(ids):
                    # ChromaDB returns distances, convert to similarity score
                    score = 1 - (distances[j] if j < len(distances) else 0.5)
                    matches.append({
                        "id": id_val,
                        "score": max(0, min(1, score)),
                        "metadata": metadatas[j] if j < len(metadatas) else {},
                    })

            print(json.dumps({"matches": matches}))

        elif action == "delete":
            collection_name = params.get("collection", "default")
            video_id = params.get("video_id", "")
            collection = client.get_or_create_collection(name=collection_name)

            try:
                # Delete by video_id filter
                collection.delete(where={"video_id": video_id})
            except:
                pass  # Collection might be empty

            print(json.dumps({"status": "ok", "deleted_for": video_id}))

        else:
            print(json.dumps({"error": f"Unknown action: {action}"}))

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

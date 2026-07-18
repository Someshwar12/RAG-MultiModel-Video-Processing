#!/usr/bin/env python3
import sys, json, re, requests
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import (emit_progress, emit_result, emit_error, read_input,
                    OPENAI_API_KEY, TAVILY_API_KEY, USE_LOCAL_MODE, OLLAMA_MODEL, OLLAMA_URL)


def _llm_call(prompt, system="You are a precise fact-checking assistant. Respond with valid JSON only."):
    """Route LLM call to Ollama (local) or OpenAI (API) based on mode."""
    if USE_LOCAL_MODE:
        try:
            r = requests.post(f"{OLLAMA_URL}/api/chat", json={
                "model": OLLAMA_MODEL, "stream": False,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                "options": {"temperature": 0.1}
            }, timeout=60)
            if r.status_code == 200:
                return r.json().get("message", {}).get("content", "[]")
        except:
            pass
    # Fallback to OpenAI
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o", messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        temperature=0.1, max_tokens=1000)
    return response.choices[0].message.content or "[]"


def extract_claims(chunks):
    all_claims = []
    batch_size = 10
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i+batch_size]
        batch_text = "\n".join(f"[Chunk {c['chunk_index']}] ({c['speaker_id']}, {c['start']:.1f}s): {c['text']}" for c in batch)
        prompt = f"""Extract ONLY verifiable empirical claims from these transcript chunks.
Verifiable: specific statistics, named facts, quantitative assertions.
NOT: opinions, plans, vague statements.

Transcript:
{batch_text}

Respond with JSON array: [{{"claim": "...", "chunk_index": N, "speaker_id": "..."}}]
If none, respond: []"""

        try:
            text = _llm_call(prompt).strip()
            if text.startswith("```"): text = re.sub(r'^```(?:json)?\s*', '', text); text = re.sub(r'\s*```$', '', text)
            claims = json.loads(text)
            if isinstance(claims, list):
                for c in claims:
                    ci = c.get("chunk_index", 0)
                    src = next((ch for ch in batch if ch["chunk_index"] == ci), batch[0])
                    c["timestamp"] = src["start"]
                all_claims.extend(claims)
        except: pass
        emit_progress("fact_checking", 10+int((i/len(chunks))*20), f"Extracting claims {i+1}-{min(i+batch_size, len(chunks))}")
    return all_claims


def verify_claim_with_tavily(claim_text):
    from tavily import TavilyClient
    client = TavilyClient(api_key=TAVILY_API_KEY)
    try:
        response = client.search(query=f"fact check: {claim_text}", search_depth="basic", max_results=3, include_answer=True)
        answer = response.get("answer", "")
        results = response.get("results", [])
        return {"evidence": " | ".join(r.get("content", "")[:300] for r in results[:2])[:500],
                "source_url": results[0]["url"] if results else None, "tavily_answer": answer[:300]}
    except Exception as e:
        return {"evidence": f"Verification failed: {str(e)[:200]}", "source_url": None, "tavily_answer": ""}


def judge_claim(claim_text, evidence):
    prompt = f"""Compare this claim against evidence and judge.
CLAIM: "{claim_text}"
EVIDENCE: {evidence.get('tavily_answer', 'No answer')}
SOURCES: {evidence.get('evidence', 'No evidence')}

Respond JSON: {{"verdict": "VERIFIED"|"CONTRADICTED"|"UNVERIFIABLE", "confidence": 0.0-1.0,
"corrected_value": "correct value or null", "explanation": "brief explanation"}}"""

    try:
        text = _llm_call(prompt).strip()
        if text.startswith("```"): text = re.sub(r'^```(?:json)?\s*', '', text); text = re.sub(r'\s*```$', '', text)
        return json.loads(text)
    except:
        return {"verdict": "UNVERIFIABLE", "confidence": 0, "corrected_value": None, "explanation": "Judgment failed"}


def main():
    params = read_input()
    chunks = params.get("chunks", [])
    video_id = params.get("video_id")

    if not chunks:
        emit_error("No chunks provided"); sys.exit(1)

    if not TAVILY_API_KEY or TAVILY_API_KEY.startswith("PASTE"):
        emit_progress("fact_checking", 100, "Tavily not configured — skipping")
        emit_result({"fact_checks": [], "skipped": True}); return

    try:
        emit_progress("fact_checking", 5, "Starting Bullshit Detector...")
        claims = extract_claims(chunks)
        emit_progress("fact_checking", 30, f"Found {len(claims)} verifiable claims")

        if not claims:
            emit_result({"fact_checks": [], "total_claims": 0}); return

        fact_checks = []
        for i, claim in enumerate(claims):
            claim_text = claim.get("claim", "")
            if not claim_text: continue
            emit_progress("fact_checking", 30+int((i/len(claims))*60), f"Checking: \"{claim_text[:50]}...\"")
            evidence = verify_claim_with_tavily(claim_text)
            judgment = judge_claim(claim_text, evidence)
            fact_checks.append({
                "claim": claim_text, "chunk_index": claim.get("chunk_index"),
                "speaker_id": claim.get("speaker_id"), "timestamp": claim.get("timestamp", 0),
                "verdict": judgment.get("verdict", "UNVERIFIABLE"), "confidence": judgment.get("confidence", 0),
                "corrected_value": judgment.get("corrected_value"), "explanation": judgment.get("explanation", ""),
                "source_url": evidence.get("source_url"), "evidence_summary": evidence.get("evidence", "")[:300]})

        v = sum(1 for f in fact_checks if f["verdict"] == "VERIFIED")
        c = sum(1 for f in fact_checks if f["verdict"] == "CONTRADICTED")
        emit_progress("fact_checking", 100, f"Done — {v} verified, {c} contradicted")
        emit_result({"fact_checks": fact_checks, "total_claims": len(claims),
                     "summary": {"verified": v, "contradicted": c, "unverifiable": len(fact_checks)-v-c}})
    except Exception as e:
        emit_error(f"Fact-checker failed: {str(e)}"); sys.exit(1)

if __name__ == "__main__":
    main()

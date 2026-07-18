#!/usr/bin/env python3
import sys, json, requests
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import read_input, OPENAI_API_KEY, OLLAMA_MODEL, OLLAMA_URL, USE_LOCAL_MODE


def run_ollama(system_prompt, messages, temperature=0.3, max_tokens=2048):
    """Run inference via Ollama REST API (local, free)."""
    chat_messages = [{"role": "system", "content": system_prompt}]
    for m in messages:
        chat_messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})

    response = requests.post(f"{OLLAMA_URL}/api/chat", json={
        "model": OLLAMA_MODEL,
        "messages": chat_messages,
        "stream": False,
        "options": {"temperature": temperature, "num_predict": max_tokens}
    }, timeout=120)

    if response.status_code != 200:
        raise RuntimeError(f"Ollama error {response.status_code}: {response.text[:200]}")

    data = response.json()
    return data.get("message", {}).get("content", "")


def fallback_to_openai(system_prompt, messages, temperature, max_tokens):
    """Fallback to OpenAI API if Ollama is unavailable."""
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY)
    chat_messages = [{"role": "system", "content": system_prompt}]
    for m in messages:
        chat_messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})
    response = client.chat.completions.create(
        model="gpt-4o", messages=chat_messages, temperature=temperature, max_tokens=max_tokens)
    return response.choices[0].message.content or ""


def main():
    params = read_input()
    system_prompt = params.get("system_prompt", "You are a helpful assistant.")
    messages = params.get("messages", [])
    temperature = params.get("temperature", 0.3)
    max_tokens = params.get("max_tokens", 2048)

    try:
        if USE_LOCAL_MODE:
            response = run_ollama(system_prompt, messages, temperature, max_tokens)
        else:
            # Try local Llama via transformers, fallback to OpenAI
            try:
                import torch
                if torch.cuda.is_available():
                    from transformers import AutoTokenizer, AutoModelForCausalLM
                    model_path = params.get("model_path", "meta-llama/Meta-Llama-3-8B-Instruct")
                    tokenizer = AutoTokenizer.from_pretrained(model_path)
                    model = AutoModelForCausalLM.from_pretrained(model_path, torch_dtype=torch.float16, device_map="auto")
                    chat = [{"role": "system", "content": system_prompt}] + [{"role": m["role"], "content": m["content"]} for m in messages]
                    input_ids = tokenizer.apply_chat_template(chat, return_tensors="pt", add_generation_prompt=True).to(model.device)
                    with torch.no_grad():
                        out = model.generate(input_ids, max_new_tokens=max_tokens, temperature=temperature if temperature > 0 else None,
                                             do_sample=temperature > 0, pad_token_id=tokenizer.eos_token_id)
                    response = tokenizer.decode(out[0][input_ids.shape[1]:], skip_special_tokens=True).strip()
                    del model, tokenizer; torch.cuda.empty_cache()
                else:
                    response = fallback_to_openai(system_prompt, messages, temperature, max_tokens)
            except ImportError:
                response = fallback_to_openai(system_prompt, messages, temperature, max_tokens)

        print(json.dumps({"response": response}))
    except Exception as e:
        try:
            response = fallback_to_openai(system_prompt, messages, temperature, max_tokens)
            print(json.dumps({"response": response}))
        except Exception as e2:
            print(json.dumps({"error": str(e2)}), file=sys.stderr)
            sys.exit(1)

if __name__ == "__main__":
    main()

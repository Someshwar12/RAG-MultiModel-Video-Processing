#!/usr/bin/env python3
# server/python-workers/agents/whiteboard_digitalizer.py
# ============================================================
# "Whiteboard-to-Code" Digitalizer — Feature 8
#
# Detects whiteboard/diagram frames in the video and converts
# the messy hand-drawn content into clean, editable Mermaid.js
# or PlantUML code that renders as a digital diagram.
#
# "You pause the video on a messy scribbled circle. Click a
#  button. Boom — it transforms into a perfect digital
#  architecture diagram that you can edit."
#
# Input (stdin JSON):
#   { video_id, frames: [{ frame_path, timestamp, description }] }
#   OR
#   { video_id, frame_path, timestamp }  (single frame mode)
#
# Output:
#   { type: "result", data: { digitalized: [...] } }
# ============================================================

import sys
import json
import base64
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import (
    emit_progress, emit_result, emit_error, read_input,
    OPENAI_API_KEY, USE_LOCAL_VLM, VLM_MODEL_API,
)


DIGITALIZE_PROMPT = """You are an expert at converting hand-drawn diagrams, whiteboard sketches, and architecture drawings into clean Mermaid.js code.

Analyze this image carefully. It contains a hand-drawn or whiteboard diagram.

Your task:
1. Identify the type of diagram (flowchart, sequence diagram, class diagram, ER diagram, state diagram, or architecture diagram)
2. Extract all nodes, connections, labels, and relationships
3. Convert it into valid Mermaid.js code that accurately represents the diagram

Rules:
- Use proper Mermaid.js syntax
- Preserve all text labels exactly as written
- Maintain the directional flow (top-down, left-right)
- Include all connections and their labels
- If text is unclear, make a reasonable interpretation and note it

Respond in this EXACT format:
DIAGRAM_TYPE: [flowchart|sequence|class|er|state|gantt]
CONFIDENCE: [0.0 to 1.0]
MERMAID_CODE:
```mermaid
[your mermaid code here]
```
NOTES: [any assumptions or unclear elements]"""


def digitalize_frame_api(frame_path: str) -> dict:
    """
    Send a frame to GPT-4o Vision to generate Mermaid.js code.
    """
    from openai import OpenAI

    client = OpenAI(api_key=OPENAI_API_KEY)

    # Encode frame to base64
    with open(frame_path, "rb") as f:
        b64_image = base64.b64encode(f.read()).decode("utf-8")

    response = client.chat.completions.create(
        model=VLM_MODEL_API,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{b64_image}",
                            "detail": "high",  # High detail for diagram accuracy
                        },
                    },
                    {"type": "text", "text": DIGITALIZE_PROMPT},
                ],
            }
        ],
        max_tokens=2000,
        temperature=0.1,
    )

    output = response.choices[0].message.content or ""
    return _parse_digitalization(output)


def _parse_digitalization(text: str) -> dict:
    """Parse the VLM output into structured diagram data."""
    result = {
        "diagram_type": None,
        "confidence": 0.0,
        "mermaid_code": None,
        "notes": "",
    }

    lines = text.strip().split("\n")
    in_mermaid_block = False
    mermaid_lines = []

    for line in lines:
        stripped = line.strip()
        lower = stripped.lower()

        if lower.startswith("diagram_type:"):
            dtype = stripped.split(":", 1)[1].strip().lower()
            valid_types = ["flowchart", "sequence", "class", "er", "state", "gantt"]
            result["diagram_type"] = dtype if dtype in valid_types else "flowchart"

        elif lower.startswith("confidence:"):
            try:
                result["confidence"] = float(stripped.split(":", 1)[1].strip())
            except ValueError:
                result["confidence"] = 0.5

        elif stripped == "```mermaid":
            in_mermaid_block = True
            continue

        elif stripped == "```" and in_mermaid_block:
            in_mermaid_block = False
            continue

        elif in_mermaid_block:
            mermaid_lines.append(line)

        elif lower.startswith("notes:"):
            result["notes"] = stripped.split(":", 1)[1].strip()

    if mermaid_lines:
        result["mermaid_code"] = "\n".join(mermaid_lines)

    return result


def main():
    params = read_input()

    video_id = params.get("video_id")

    # Support both single-frame and batch mode
    frames = params.get("frames", [])
    if not frames and params.get("frame_path"):
        frames = [{
            "frame_path": params["frame_path"],
            "timestamp": params.get("timestamp", 0),
            "description": params.get("description", ""),
        }]

    if not frames:
        emit_error("No frames provided for digitalization")
        sys.exit(1)

    try:
        emit_progress("digitalizing", 5, f"Digitalizing {len(frames)} diagram frame(s)...")

        digitalized = []

        for i, frame in enumerate(frames):
            frame_path = frame.get("frame_path")

            if not frame_path or not Path(frame_path).exists():
                emit_error(f"Frame not found: {frame_path}")
                continue

            emit_progress("digitalizing", 10 + int((i / len(frames)) * 80),
                           f"Converting frame {i+1}/{len(frames)} to Mermaid.js...")

            try:
                result = digitalize_frame_api(frame_path)

                digitalized.append({
                    "frame_path": frame_path,
                    "timestamp": frame.get("timestamp", 0),
                    "original_description": frame.get("description", ""),
                    **result,
                })

            except Exception as e:
                emit_error(f"Frame {i} digitalization failed: {str(e)[:200]}")
                digitalized.append({
                    "frame_path": frame_path,
                    "timestamp": frame.get("timestamp", 0),
                    "mermaid_code": None,
                    "error": str(e)[:200],
                })

        success_count = sum(1 for d in digitalized if d.get("mermaid_code"))

        emit_progress("digitalizing", 100,
                       f"Digitalization complete — {success_count}/{len(frames)} diagrams converted")

        emit_result({
            "digitalized": digitalized,
            "total_frames": len(frames),
            "successful": success_count,
            "video_id": video_id,
        })

    except Exception as e:
        emit_error(f"Whiteboard digitalizer failed: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()

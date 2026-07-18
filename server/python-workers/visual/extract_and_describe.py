#!/usr/bin/env python3
import sys, os, time, base64, json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import (emit_progress, emit_result, emit_error, read_input,
                    VISUAL_BATCH_SIZE, VISUAL_IMG_SIZE, FRAME_EXTRACTION_FPS,
                    USE_LOCAL_MODE, USE_LOCAL_VLM, VLM_MODEL_LOCAL, VLM_MODEL_API, OPENAI_API_KEY)


def extract_keyframes(video_path, output_dir, fps=0.2, img_size=256):
    import cv2
    os.makedirs(output_dir, exist_ok=True)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / video_fps
    frame_interval = max(1, int(video_fps / fps))
    expected = max(1, int(duration * fps))

    emit_progress("extracting_frames", 10, f"Extracting ~{expected} frames from {duration:.0f}s video")

    frames, frame_index, extracted = [], 0, 0
    while True:
        ret, frame = cap.read()
        if not ret: break
        if frame_index % frame_interval == 0:
            timestamp = frame_index / video_fps
            h, w = frame.shape[:2]
            if max(h, w) > img_size:
                scale = img_size / max(h, w)
                frame = cv2.resize(frame, (int(w*scale), int(h*scale)), interpolation=cv2.INTER_AREA)
            fname = f"frame_{extracted:05d}_{timestamp:.1f}s.jpg"
            fpath = os.path.join(output_dir, fname)
            cv2.imwrite(fpath, frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            frames.append({"frame_path": fpath, "timestamp": round(timestamp, 2), "frame_index": extracted})
            extracted += 1
            # Progress every frame during extraction (it's fast)
            if extracted % 5 == 0:
                pct = 10 + int((extracted / expected) * 20)
                emit_progress("extracting_frames", min(pct, 30), f"Extracted {extracted}/{expected} frames")
        frame_index += 1
    cap.release()
    emit_progress("extracting_frames", 30, f"Extracted {len(frames)} keyframes")
    return frames


def _classify_from_caption(caption):
    """Detect visual element types from BLIP caption using keyword matching."""
    lower = caption.lower()
    has_diagram = any(w in lower for w in ["diagram", "flowchart", "architecture", "flow chart", "block diagram", "network diagram", "pipeline"])
    has_whiteboard = any(w in lower for w in ["whiteboard", "white board", "board with", "writing on a board", "marker"])
    has_slide = any(w in lower for w in ["slide", "presentation", "powerpoint", "bullet point", "title slide", "screen with text", "projector"])
    has_code = any(w in lower for w in ["code", "programming", "terminal", "command line", "script", "syntax", "coding", "ide", "editor"])
    has_chart = any(w in lower for w in ["chart", "graph", "bar graph", "pie chart", "line graph", "data visualization", "plot", "histogram"])
    has_text = any(w in lower for w in ["text", "words", "letters", "title", "heading", "caption", "writing", "typed", "printed", "document", "screen showing"])

    scene_type = "other"
    if has_slide or has_text: scene_type = "presentation"
    elif has_whiteboard: scene_type = "whiteboard"
    elif has_diagram or has_chart or has_code: scene_type = "screen_share"
    elif any(w in lower for w in ["person", "man", "woman", "people", "face", "speaker", "talking"]):
        scene_type = "group_discussion" if any(w in lower for w in ["group", "meeting", "conference"]) else "speaker_closeup"

    return {"has_diagram": has_diagram, "has_whiteboard": has_whiteboard, "has_slide": has_slide,
            "has_code": has_code, "has_chart": has_chart, "has_text": has_text, "scene_type": scene_type}


def describe_frames_local_blip(frames, batch_size=4):
    """BLIP captioning with batched inference for speed."""
    emit_progress("embedding_visuals", 32, "Loading BLIP model...")

    try:
        from transformers import BlipProcessor, BlipForConditionalGeneration
        from PIL import Image
        import torch

        processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
        model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")

        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = model.to(device)
        if device == "cuda":
            model = model.half()  # fp16 for 2x speed on GPU

        emit_progress("embedding_visuals", 38, f"BLIP loaded on {device.upper()} — analyzing {len(frames)} frames...")
    except Exception as e:
        emit_progress("embedding_visuals", 35, f"BLIP unavailable, using fast captions")
        return _describe_frames_basic(frames)

    results = []
    total = len(frames)

    # Process in batches for better GPU utilization
    for batch_start in range(0, total, batch_size):
        batch_end = min(batch_start + batch_size, total)
        batch_frames = frames[batch_start:batch_end]

        # Load all images in batch
        images = []
        valid_indices = []
        for j, frame_info in enumerate(batch_frames):
            try:
                img = Image.open(frame_info["frame_path"]).convert("RGB")
                images.append(img)
                valid_indices.append(j)
            except:
                results.append({**frame_info, "description": "[Failed to load]", "scene_type": "other"})

        if images:
            try:
                inputs = processor(images=images, return_tensors="pt", padding=True).to(device)
                if device == "cuda":
                    inputs = {k: v.half() if v.dtype == torch.float32 else v for k, v in inputs.items()}

                start_time = time.time()
                with torch.no_grad():
                    out = model.generate(**inputs, max_new_tokens=50)  # 50 tokens is enough, faster than 100
                captions = processor.batch_decode(out, skip_special_tokens=True)
                proc_time = int((time.time() - start_time) * 1000)

                for k, j in enumerate(valid_indices):
                    caption = captions[k] if k < len(captions) else "Video frame"
                    classification = _classify_from_caption(caption)
                    results.append({
                        **batch_frames[j],
                        "description": caption,
                        "detected_text": None,
                        "people_count": 0,
                        "processing_time_ms": proc_time // len(valid_indices),
                        **classification,
                    })
            except Exception as e:
                # Fallback to one-by-one if batch fails
                for j in valid_indices:
                    results.append({**batch_frames[j], "description": f"[Batch failed: {str(e)[:50]}]", "scene_type": "other"})

        # Emit progress EVERY batch
        done = min(batch_end, total)
        pct = 38 + int((done / total) * 52)
        emit_progress("embedding_visuals", min(pct, 90), f"Analyzed {done}/{total} frames")

    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    return results


def _describe_frames_basic(frames):
    """Ultra-fast fallback: simple metadata-based descriptions."""
    results = []
    for i, frame_info in enumerate(frames):
        results.append({**frame_info, "description": f"Video frame at {frame_info['timestamp']:.1f}s",
                        "detected_text": None, "scene_type": "other",
                        "has_diagram": False, "has_whiteboard": False, "has_slide": False,
                        "has_code": False, "has_chart": False, "has_text": False, "people_count": 0})
        if (i+1) % 10 == 0:
            emit_progress("embedding_visuals", 38 + int(((i+1)/len(frames))*52), f"Processed {i+1}/{len(frames)}")
    return results


def describe_frames_api(frames, batch_size=4):
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY)
    emit_progress("embedding_visuals", 35, "Using GPT-4o Vision API...")

    VLM_PROMPT = """Analyze this video frame briefly. Respond in this format:
DESCRIPTION: [scene description]
DETECTED_TEXT: [any text visible, or "none"]
SCENE_TYPE: [meeting_room/presentation/whiteboard/screen_share/speaker_closeup/group_discussion/other]
HAS_DIAGRAM: [true/false]
HAS_WHITEBOARD: [true/false]
HAS_SLIDE: [true/false]
HAS_CODE: [true/false]
HAS_CHART: [true/false]
PEOPLE_COUNT: [number]"""

    results = []
    for i, frame_info in enumerate(frames):
        try:
            with open(frame_info["frame_path"], "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            start_time = time.time()
            response = client.chat.completions.create(
                model=VLM_MODEL_API,
                messages=[{"role": "user", "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "low"}},
                    {"type": "text", "text": VLM_PROMPT}]}],
                max_tokens=256, temperature=0.1)
            output = response.choices[0].message.content or ""
            parsed = _parse_vlm_output(output)
            results.append({**frame_info, **parsed, "processing_time_ms": int((time.time()-start_time)*1000)})
        except Exception as e:
            results.append({**frame_info, "description": f"[API failed: {str(e)[:80]}]", "scene_type": "other"})
        emit_progress("embedding_visuals", min(35+int(((i+1)/len(frames))*55), 90),
                      f"Analyzed {i+1}/{len(frames)} frames")
    return results


def _parse_vlm_output(text):
    result = {"description": "", "detected_text": None, "scene_type": "other",
              "has_diagram": False, "has_whiteboard": False, "has_slide": False,
              "has_code": False, "has_chart": False, "has_text": False, "people_count": 0}
    for line in text.strip().split("\n"):
        lower = line.strip().lower()
        if lower.startswith("description:"): result["description"] = line.split(":", 1)[1].strip()
        elif lower.startswith("detected_text:"):
            val = line.split(":", 1)[1].strip()
            if val.lower() not in ("none", "n/a", ""): result["detected_text"] = val; result["has_text"] = True
        elif lower.startswith("scene_type:"):
            val = line.split(":", 1)[1].strip().lower().replace(" ", "_")
            valid = ["meeting_room","presentation","whiteboard","screen_share","speaker_closeup","group_discussion","other"]
            result["scene_type"] = val if val in valid else "other"
        elif lower.startswith("has_diagram:"): result["has_diagram"] = "true" in lower
        elif lower.startswith("has_whiteboard:"): result["has_whiteboard"] = "true" in lower
        elif lower.startswith("has_slide:"): result["has_slide"] = "true" in lower
        elif lower.startswith("has_code:"): result["has_code"] = "true" in lower
        elif lower.startswith("has_chart:"): result["has_chart"] = "true" in lower
        elif lower.startswith("people_count:"):
            try: result["people_count"] = int(line.split(":", 1)[1].strip())
            except: pass
    if not result["description"]: result["description"] = text.strip()[:500]
    return result


def main():
    params = read_input()
    video_path, output_dir = params.get("video_path"), params.get("output_dir")
    video_id = params.get("video_id")
    batch_size = min(int(params.get("batch_size", VISUAL_BATCH_SIZE)), VISUAL_BATCH_SIZE)
    img_size = min(int(params.get("img_size", VISUAL_IMG_SIZE)), VISUAL_IMG_SIZE)
    fps = float(params.get("fps", FRAME_EXTRACTION_FPS))

    if not video_path or not os.path.exists(video_path):
        emit_error(f"Video not found: {video_path}"); sys.exit(1)
    if not output_dir:
        emit_error("output_dir required"); sys.exit(1)

    try:
        frames = extract_keyframes(video_path, output_dir, fps=fps, img_size=img_size)
        if not frames: emit_error("No frames extracted"); sys.exit(1)

        if USE_LOCAL_MODE:
            model_used = "BLIP (local)"
            described = describe_frames_local_blip(frames, batch_size=batch_size)
        else:
            model_used = f"{VLM_MODEL_API} (Vision API)"
            described = describe_frames_api(frames, batch_size=batch_size)

        emit_progress("completed", 100, f"Visual done — {len(described)} frames analyzed")
        emit_result({"frames": described, "model_used": model_used, "total_frames": len(described),
                     "batch_size": batch_size, "img_size": img_size})
    except Exception as e:
        emit_error(f"Visual pipeline failed: {str(e)}"); sys.exit(1)

if __name__ == "__main__":
    main()
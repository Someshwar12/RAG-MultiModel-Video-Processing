#!/usr/bin/env python3
import sys, os, math, json
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import (emit_progress, emit_result, emit_error, read_input,
                    OPENAI_API_KEY, HF_AUTH_TOKEN, USE_LOCAL_MODE, LOCAL_WHISPER_MODEL)


def transcribe_local_whisper(audio_path):
    """Transcribe using local Whisper with fp16 GPU acceleration and segment progress."""
    import whisper
    import torch

    emit_progress("transcribing", 12, f"Loading Whisper ({LOCAL_WHISPER_MODEL})...")

    use_fp16 = torch.cuda.is_available()
    device = "cuda" if use_fp16 else "cpu"
    model = whisper.load_model(LOCAL_WHISPER_MODEL, device=device)

    emit_progress("transcribing", 18, "Analyzing audio duration...")

    audio = whisper.load_audio(audio_path)
    duration = len(audio) / 16000
    emit_progress("transcribing", 20, f"Transcribing {duration:.0f}s of audio" + (" (GPU fp16)" if use_fp16 else " (CPU)") + "...")

    result = model.transcribe(
        audio_path,
        word_timestamps=True,
        language=None,
        fp16=use_fp16,
        verbose=False,
    )

    words = []
    segments = []
    total_segments = len(result.get("segments", []))

    for i, segment in enumerate(result.get("segments", [])):
        segments.append({"text": segment["text"].strip(), "start": segment["start"], "end": segment["end"]})
        for w in segment.get("words", []):
            words.append({"word": w["word"].strip(), "start": w["start"], "end": w["end"]})

        # Progress every ~12% of segments
        if total_segments > 0 and (i+1) % max(1, total_segments // 8) == 0:
            pct = 20 + int((segment["end"] / max(duration, 1)) * 28)
            emit_progress("transcribing", min(pct, 48), f"Transcribed {segment['end']:.0f}s / {duration:.0f}s ({len(words)} words)")

    emit_progress("transcribing", 50, f"Done — {len(words)} words, {len(segments)} segments")
    return {"text": result.get("text", ""), "words": words, "segments": segments,
            "language": result.get("language", "en")}


def transcribe_with_whisper_api(audio_path):
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY)
    emit_progress("transcribing", 20, "Uploading to Whisper API...")

    file_size = os.path.getsize(audio_path)
    if file_size > 25 * 1024 * 1024:
        return _transcribe_large_file(client, audio_path)

    with open(audio_path, "rb") as f:
        response = client.audio.transcriptions.create(
            model="whisper-1", file=f, response_format="verbose_json",
            timestamp_granularities=["word", "segment"], language=None)

    emit_progress("transcribing", 50, "Transcription complete")
    words = [{"word": w.word.strip(), "start": w.start, "end": w.end}
             for w in (response.words or [])] if hasattr(response, 'words') and response.words else []
    segments = [{"text": s.text.strip(), "start": s.start, "end": s.end}
                for s in (response.segments or [])] if hasattr(response, 'segments') and response.segments else []
    return {"text": response.text, "words": words, "segments": segments,
            "language": getattr(response, 'language', 'en') or 'en'}


def _transcribe_large_file(client, audio_path):
    from pydub import AudioSegment
    audio = AudioSegment.from_wav(audio_path)
    chunk_ms = 750_000
    num_chunks = math.ceil(len(audio) / chunk_ms)
    all_words, all_segments, texts, lang = [], [], [], 'en'

    for i in range(num_chunks):
        chunk = audio[i * chunk_ms:min((i+1) * chunk_ms, len(audio))]
        chunk_path = audio_path.replace(".wav", f"_chunk_{i}.wav")
        chunk.export(chunk_path, format="wav")
        offset = i * chunk_ms / 1000.0
        emit_progress("transcribing", 20 + int((i/num_chunks)*28), f"Chunk {i+1}/{num_chunks}...")
        try:
            with open(chunk_path, "rb") as f:
                r = client.audio.transcriptions.create(
                    model="whisper-1", file=f, response_format="verbose_json",
                    timestamp_granularities=["word", "segment"])
            if hasattr(r, 'words') and r.words:
                all_words.extend({"word": w.word.strip(), "start": w.start+offset, "end": w.end+offset} for w in r.words)
            if hasattr(r, 'segments') and r.segments:
                all_segments.extend({"text": s.text.strip(), "start": s.start+offset, "end": s.end+offset} for s in r.segments)
            texts.append(r.text)
            lang = getattr(r, 'language', lang) or lang
        finally:
            if os.path.exists(chunk_path): os.remove(chunk_path)
    return {"text": " ".join(texts), "words": all_words, "segments": all_segments, "language": lang}


def run_pyannote_diarization(audio_path, hf_token):
    emit_progress("diarizing", 55, "Loading Pyannote...")
    try:
        from pyannote.audio import Pipeline
        pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=hf_token)
        emit_progress("diarizing", 60, "Running diarization...")
        diarization = pipeline(audio_path)
        segments = [{"speaker_id": speaker, "start": turn.start, "end": turn.end}
                    for turn, _, speaker in diarization.itertracks(yield_label=True)]
        emit_progress("diarizing", 80, f"Found {len(set(s['speaker_id'] for s in segments))} speakers")
        return segments
    except Exception as e:
        emit_progress("diarizing", 80, f"Diarization skipped. Single speaker.")
        return []


def align_words_to_speakers(words, speaker_segments):
    if not speaker_segments or not words:
        return [{"word": w["word"], "start": w["start"], "end": w["end"], "speaker": "SPEAKER_00"} for w in words]
    from intervaltree import IntervalTree
    tree = IntervalTree()
    for seg in speaker_segments:
        if seg["end"] > seg["start"]:
            tree.addi(seg["start"], seg["end"], seg["speaker_id"])
    aligned = []
    for w in words:
        overlaps = tree.overlap(w["start"], w["end"])
        if not overlaps:
            speaker = "SPEAKER_00"
        else:
            best_speaker, best_overlap = None, 0.0
            for iv in overlaps:
                intersection = max(0, min(w["end"], iv.end) - max(w["start"], iv.begin))
                if intersection > best_overlap:
                    best_overlap = intersection
                    best_speaker = iv.data
            speaker = best_speaker or "SPEAKER_00"
        aligned.append({"word": w["word"], "start": w["start"], "end": w["end"], "speaker": speaker})
    return aligned


def chunk_by_speaker(aligned_words, max_chunk_seconds=15.0):
    if not aligned_words: return []
    chunks, current_words, current_speaker = [], [aligned_words[0]], aligned_words[0]["speaker"]
    for w in aligned_words[1:]:
        if w["speaker"] != current_speaker or w["end"] - current_words[0]["start"] > max_chunk_seconds:
            chunks.append(_build_chunk(current_words, current_speaker))
            current_words, current_speaker = [w], w["speaker"]
        else:
            current_words.append(w)
    if current_words: chunks.append(_build_chunk(current_words, current_speaker))
    return chunks


def _build_chunk(words, speaker):
    return {"text": " ".join(w["word"] for w in words), "start": words[0]["start"],
            "end": words[-1]["end"], "speaker_id": speaker,
            "words": [{"word": w["word"], "start": w["start"], "end": w["end"]} for w in words]}


def compute_speaker_profiles(chunks):
    stats = defaultdict(lambda: {"total_time": 0, "word_count": 0, "chunks": 0})
    for c in chunks:
        s = stats[c["speaker_id"]]
        s["total_time"] += c["end"] - c["start"]
        s["word_count"] += len(c["words"])
        s["chunks"] += 1
    return [{"speaker_id": sid, "total_speaking_time": round(d["total_time"], 2),
             "word_count": d["word_count"], "chunk_count": d["chunks"]}
            for sid, d in sorted(stats.items())]


def main():
    params = read_input()
    audio_path = params.get("audio_path")
    video_id = params.get("video_id")
    hf_token = params.get("hf_token", HF_AUTH_TOKEN)

    if not audio_path or not os.path.exists(audio_path):
        emit_error(f"Audio file not found: {audio_path}")
        sys.exit(1)

    try:
        emit_progress("transcribing", 10, "Starting transcription...")
        if USE_LOCAL_MODE:
            transcription = transcribe_local_whisper(audio_path)
        else:
            transcription = transcribe_with_whisper_api(audio_path)

        words = transcription.get("words", [])
        if not words and transcription.get("segments"):
            for seg in transcription["segments"]:
                seg_words = seg["text"].split()
                if not seg_words: continue
                dur = (seg["end"] - seg["start"]) / len(seg_words)
                words.extend({"word": w, "start": seg["start"]+j*dur, "end": seg["start"]+(j+1)*dur}
                             for j, w in enumerate(seg_words))

        emit_progress("transcribing", 53, f"Transcribed {len(words)} words")

        speaker_segments = []
        if hf_token and hf_token not in ("PASTE_YOUR_HUGGINGFACE_TOKEN_HERE", ""):
            speaker_segments = run_pyannote_diarization(audio_path, hf_token)
        else:
            emit_progress("diarizing", 80, "No HF token — single speaker mode")

        emit_progress("aligning", 82, "Aligning words to speakers...")
        aligned_words = align_words_to_speakers(words, speaker_segments)

        emit_progress("chunking", 88, "Building chunks...")
        chunks = chunk_by_speaker(aligned_words)

        speaker_profiles = compute_speaker_profiles(chunks)
        emit_progress("completed", 100, f"Audio done — {len(chunks)} chunks, {len(speaker_profiles)} speakers")

        emit_result({"chunks": chunks, "speaker_profiles": speaker_profiles,
                     "num_speakers": len(speaker_profiles), "language": transcription.get("language", "en"),
                     "total_words": len(words), "full_text": transcription.get("text", "")})
    except Exception as e:
        emit_error(f"Audio pipeline failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
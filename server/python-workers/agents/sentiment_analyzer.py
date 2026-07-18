#!/usr/bin/env python3
# server/python-workers/agents/sentiment_analyzer.py
# ============================================================
# Sentiment Analyzer — Powers the "Mood Map" Feature
#
# Analyzes transcript chunks for emotional tone using:
#   - TextBlob for fast text sentiment scoring
#   - OpenAI GPT for nuanced emotion classification (optional)
#
# Produces time-series data points with:
#   - Composite score (0-100)
#   - Dominant emotion
#   - Mood category (agreement/conflict/neutral)
#   - Spike detection for clickable events
#
# Input (stdin JSON):
#   { video_id, chunks: [{ text, start, end, speaker_id }] }
#
# Output:
#   { type: "result", data: { sentiments: [...] } }
# ============================================================

import sys
import json
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import (
    emit_progress, emit_result, emit_error, read_input,
    SENTIMENT_WINDOW_SECONDS, OPENAI_API_KEY,
)


def analyze_text_sentiment(text: str) -> dict:
    """
    Fast text sentiment analysis using TextBlob.
    Returns polarity (-1 to 1) and subjectivity (0 to 1).
    """
    from textblob import TextBlob

    blob = TextBlob(text)
    polarity = blob.sentiment.polarity        # -1 (negative) to 1 (positive)
    subjectivity = blob.sentiment.subjectivity  # 0 (objective) to 1 (subjective)

    # Map polarity to label
    if polarity > 0.3:
        label = "very_positive"
    elif polarity > 0.05:
        label = "positive"
    elif polarity > -0.05:
        label = "neutral"
    elif polarity > -0.3:
        label = "negative"
    else:
        label = "very_negative"

    return {
        "score": round(polarity, 4),
        "label": label,
        "confidence": round(min(abs(polarity) * 2, 1.0), 4),
        "subjectivity": round(subjectivity, 4),
    }


def classify_emotion(text: str, polarity: float) -> str:
    """
    Classify the dominant emotion based on text keywords + polarity.
    Fast heuristic approach (no API call needed).
    """
    lower = text.lower()

    # Keyword-based emotion detection
    conflict_words = ["disagree", "wrong", "no", "can't", "won't", "problem",
                       "issue", "concern", "worry", "risk", "but", "however",
                       "unfortunately", "impossible", "fail", "terrible", "bad"]
    agreement_words = ["agree", "yes", "right", "exactly", "good", "great",
                        "perfect", "absolutely", "definitely", "sure", "correct",
                        "excellent", "love", "fantastic"]
    surprise_words = ["wow", "really", "seriously", "incredible", "amazing",
                       "unexpected", "surprised", "shocking"]
    anger_words = ["angry", "furious", "ridiculous", "stupid", "waste",
                    "unacceptable", "frustrated"]

    conflict_score = sum(1 for w in conflict_words if w in lower)
    agreement_score = sum(1 for w in agreement_words if w in lower)
    surprise_score = sum(1 for w in surprise_words if w in lower)
    anger_score = sum(1 for w in anger_words if w in lower)

    # Weight by polarity
    if anger_score > 1 or (polarity < -0.4 and conflict_score > 0):
        return "angry"
    elif conflict_score > agreement_score and polarity < 0:
        return "conflict"  # Custom: maps to Mood Map's "conflict" line
    elif agreement_score > conflict_score and polarity > 0:
        return "agreement"  # Custom: maps to Mood Map's "agreement" line
    elif surprise_score > 0 and abs(polarity) > 0.2:
        return "surprised"
    elif polarity > 0.3:
        return "happy"
    elif polarity < -0.3:
        return "sad"
    else:
        return "neutral"


def compute_composite_score(polarity: float, emotion: str) -> float:
    """
    Map sentiment to the 0-100 Mood Map Y-axis.
    50 = neutral, 100 = very positive/agreement, 0 = very negative/conflict
    """
    # Base score from polarity
    base = (polarity + 1) * 50  # Maps -1..1 → 0..100

    # Boost/penalize based on emotion
    if emotion in ("agreement", "happy"):
        base = min(base + 10, 100)
    elif emotion in ("conflict", "angry"):
        base = max(base - 10, 0)

    return round(base, 1)


def detect_spikes(sentiments: list, threshold: float = 25.0) -> list:
    """
    Detect emotional spikes — moments where the composite score
    changes dramatically from the local moving average.
    These become clickable "hot spots" on the Mood Map.
    """
    if len(sentiments) < 3:
        return sentiments

    window = 3  # Moving average window

    for i in range(len(sentiments)):
        # Calculate local moving average
        start = max(0, i - window)
        end = min(len(sentiments), i + window + 1)
        local_scores = [s["compositeScore"] for s in sentiments[start:end]]
        local_avg = sum(local_scores) / len(local_scores)

        # Detect spike if current score deviates significantly
        deviation = abs(sentiments[i]["compositeScore"] - local_avg)

        if deviation > threshold:
            sentiments[i]["isSpike"] = True

            if sentiments[i]["compositeScore"] < local_avg:
                sentiments[i]["spikeType"] = "conflict"
                sentiments[i]["spikeDescription"] = (
                    f"Emotional dip detected — {sentiments[i]['dominantEmotion']} "
                    f"tone from {sentiments[i].get('speakerId', 'unknown speaker')}"
                )
            else:
                sentiments[i]["spikeType"] = "excitement"
                sentiments[i]["spikeDescription"] = (
                    f"Positive spike — {sentiments[i]['dominantEmotion']} "
                    f"tone from {sentiments[i].get('speakerId', 'unknown speaker')}"
                )

    return sentiments


def process_chunks(chunks: list) -> list:
    """
    Process transcript chunks into sentiment data points.
    Each chunk becomes one data point on the Mood Map timeline.
    """
    sentiments = []

    for i, chunk in enumerate(chunks):
        text = chunk.get("text", "")
        if not text.strip():
            continue

        # Text sentiment
        text_sent = analyze_text_sentiment(text)

        # Emotion classification
        emotion = classify_emotion(text, text_sent["score"])

        # Mood category (for the dual-line Mood Map: agreement vs conflict)
        if emotion in ("agreement", "happy", "surprised"):
            mood_category = "agreement"
        elif emotion in ("conflict", "angry", "sad"):
            mood_category = "conflict"
        elif text_sent["score"] > 0.15:
            mood_category = "agreement"
        elif text_sent["score"] < -0.15:
            mood_category = "conflict"
        else:
            mood_category = "neutral"

        # Composite score (0-100)
        composite = compute_composite_score(text_sent["score"], emotion)

        sentiments.append({
            "timestamp": round((chunk["start"] + chunk["end"]) / 2, 2),
            "windowStart": chunk["start"],
            "windowEnd": chunk["end"],
            "speakerId": chunk.get("speaker_id", "SPEAKER_00"),
            "textSentiment": {
                "score": text_sent["score"],
                "label": text_sent["label"],
                "confidence": text_sent["confidence"],
            },
            "audioSentiment": {
                "pitch": 0.5,   # Placeholder — requires audio analysis
                "volume": 0.5,  # Placeholder — requires audio analysis
                "speechRate": None,
            },
            "compositeScore": composite,
            "dominantEmotion": emotion,
            "moodCategory": mood_category,
            "isSpike": False,
            "spikeType": None,
            "spikeDescription": None,
        })

        if (i + 1) % 50 == 0:
            progress = 10 + int((i / len(chunks)) * 70)
            emit_progress("sentiment_analysis", progress,
                           f"Analyzed {i+1}/{len(chunks)} chunks")

    # Detect spikes
    sentiments = detect_spikes(sentiments)

    return sentiments


def main():
    params = read_input()

    video_id = params.get("video_id")
    chunks = params.get("chunks", [])

    if not chunks:
        emit_error("No transcript chunks provided for sentiment analysis")
        sys.exit(1)

    try:
        emit_progress("sentiment_analysis", 5, f"Analyzing sentiment for {len(chunks)} chunks...")

        sentiments = process_chunks(chunks)

        spike_count = sum(1 for s in sentiments if s["isSpike"])
        avg_score = sum(s["compositeScore"] for s in sentiments) / max(len(sentiments), 1)

        emit_progress("sentiment_analysis", 100,
                       f"Sentiment analysis complete — {len(sentiments)} data points, {spike_count} spikes")

        emit_result({
            "sentiments": sentiments,
            "total_data_points": len(sentiments),
            "spike_count": spike_count,
            "average_composite_score": round(avg_score, 1),
            "video_id": video_id,
        })

    except Exception as e:
        emit_error(f"Sentiment analysis failed: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()

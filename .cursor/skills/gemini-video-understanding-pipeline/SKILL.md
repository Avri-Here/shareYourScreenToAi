---
name: gemini-video-understanding-pipeline
description: >-
  Designs production Gemini video-analysis pipelines with multi-stage triage and
  deep analysis, audio-first grounding, adaptive sampling, long-video chunking,
  objective prompting, and cost optimization. Use when building or reviewing
  video indexing, summaries, OCR or action tasks on files or archives, Gemini
  generateContent pipelines, or when the user references Google Cloud field
  notes on video understanding—not for Gemini Live real-time screen streaming.
---

# Gemini video understanding (field pipeline)

Condensed from Google Cloud community guidance on **file-based** video analysis with Gemini: quality, fewer hallucinations, controlled token spend. **Out of scope:** Gemini Live / real-time screen Q&A (different product and constraints).

## When to apply

- Long videos, archives, professional or cinematic sources.
- Need **timestamps**, scene structure, summaries, OCR, or fine-grained actions.
- Hitting **context limits**, **cost**, or **truncated** model outputs on single-shot requests.

## Five pillars

### 1. Multi-stage agentic chain (triage → deep dive)

**Avoid:** One request over an entire long file asking for everything.

**Do:**

1. **Triage:** Fast/cheap model (e.g. Flash), low visual resolution. Produce a **map**: major events, scene shifts, **key timestamps**.
2. **Optional:** If audio exists, run **transcription** before heavy visual work (see pillar 2).
3. **Deep dive:** On **selected intervals only**, use a stronger model (e.g. Pro) for detailed analysis.

### 2. Audio-first contextualization

- Transcribe audio **before** or as a **pre-context layer** for visual reasoning when the file has audio.
- **Why:** Semantic and temporal anchor; reduces **temporal hallucinations** and bad audio–visual alignment.
- **Bias awareness:** MLLMs can show **visual dominance** (sound matched to wrong on-screen objects) or the reverse when video is weak—transcript stabilizes narrative.

### 3. Adaptive temporal sampling

- **Indexing / triage:** ~**1 FPS** is often enough; for mostly static content (e.g. lectures), **&lt;1 FPS** can cut tokens and time.
- **Fine tasks** (OCR, numbers, action): **raise sampling** only for those **segments**.
- **Reasoning:** For complex spatiotemporal tasks, configure **thinking** / **thinking budget** (model-dependent) and **max output tokens** so answers are not cut mid-analysis.

### 4. Prompt objectivity and the context trap

- Rich context helps, but **leading prompts** (“you should see X”) increase **confirmation bias** and **object-presence** style errors.
- Keep initial instructions **neutral and verifiable**; use **later stages** to confirm hypotheses instead of assuming facts in pass one.

### 5. Context barrier (very long video)

- Beyond large token use, run triage on **chunks** (e.g. 20–30 minutes), not the whole asset at once.
- **Temporal chunking + anchor mapping:** Each chunk gets prompts with **timestamps local to that chunk** so the model’s timeline stays consistent.
- **Partial-visual / full-audio pivot:** When useful, pair **full transcript** with **partial video** and temporal anchors so the narrative bridges without exceeding the window.

### Temporal anchor pattern (prompt shape)

Provide synchronized transcript and bind tasks to times, e.g. ask whether a visual at `00:16` matches audio or is a flare—**specific time + specific check**, not vague “what happens.”

## Cost optimization (four levers)

1. **`media_resolution` / LOW** where quality allows—major token reduction; validate on representative assets (model-specific defaults evolve).
2. **Context caching** when the **same video** is queried multiple times for different extractions.
3. **Tiered models:** Most work on **Flash / Flash Lite**; reserve **Pro** for hard segments or deep reasoning.
4. **Batch API** for high throughput when **sub-second latency** is not required—typically lower per-token cost than online-only.

## Anti-patterns

- Single mega-request on long video.
- Prompts that **presuppose** events or objects exist.
- Skipping audio transcript when audio exists and matters.
- Ignoring chunking for very long inputs.

## Checklist for new pipelines

- [ ] Triage pass produces timestamped index before deep calls.
- [ ] Audio transcribed when present; used to anchor visual steps.
- [ ] Sampling and resolution match task (coarse map vs fine segment).
- [ ] Prompts objective; verification in a second stage where needed.
- [ ] Long inputs chunked with per-chunk time anchors.
- [ ] Resolution, caching, model tier, and batch mode chosen for cost/latency goals.

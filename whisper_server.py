"""
Whisper Transcription Server for Live Transcriber
==================================================
A simple Flask server that accepts audio files and returns transcripts.

Setup:
    pip install openai-whisper flask flask-cors

Run:
    python whisper_server.py

The server will start at http://localhost:5000
"""

import os
import sys
import tempfile
import time
import glob
import json

# Disable output buffering
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Add ffmpeg to PATH if installed via winget
ffmpeg_paths = glob.glob(os.path.expanduser(
    "~/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg*/ffmpeg-*/bin"
))
ffmpeg_dir = None
for path in ffmpeg_paths:
    if os.path.exists(path):
        ffmpeg_dir = path
        # Add to PATH (prepend to ensure it's found first)
        os.environ['PATH'] = path + os.pathsep + os.environ.get('PATH', '')
        print(f"[FFmpeg] Added to PATH: {path}")

        # Also set the ffmpeg binary path for whisper
        ffmpeg_exe = os.path.join(path, 'ffmpeg.exe')
        if os.path.exists(ffmpeg_exe):
            os.environ['FFMPEG_BINARY'] = ffmpeg_exe
            print(f"[FFmpeg] Binary: {ffmpeg_exe}")

# Monkey-patch subprocess to ensure ffmpeg is found
if ffmpeg_dir:
    import subprocess
    _original_run = subprocess.run

    def _patched_run(*args, **kwargs):
        # If running ffmpeg, ensure PATH is set
        if args and isinstance(args[0], list) and args[0] and args[0][0] == 'ffmpeg':
            env = kwargs.get('env', os.environ.copy())
            env['PATH'] = ffmpeg_dir + os.pathsep + env.get('PATH', '')
            kwargs['env'] = env
        return _original_run(*args, **kwargs)

    subprocess.run = _patched_run
    print("[FFmpeg] Patched subprocess.run for ffmpeg")

from flask import Flask, request, jsonify
from flask_cors import CORS
import threading

app = Flask(__name__)
CORS(app)  # Allow requests from browser

# Lazy load whisper to show startup message first
whisper_model = None
model_loaded = False  # Track if model was already loaded (for timing)
model_name = "base"  # Options: tiny, base, small, medium, large

# Model-specific base estimates (seconds per MB) - calibrated defaults
MODEL_ESTIMATES = {
    "tiny": 10,
    "base": 30,
    "small": 60,
    "medium": 120,
    "large": 200
}

# Historical timing data file
TIMING_DATA_FILE = os.path.join(os.path.dirname(__file__), '.whisper_timing.json')

# Progress tracking
transcription_progress = {
    "active": False,
    "progress": 0,
    "filename": "",
    "start_time": 0,
    "estimated_duration": 0,
    "file_size_mb": 0
}

def load_timing_history():
    """Load historical timing data for better estimates"""
    try:
        if os.path.exists(TIMING_DATA_FILE):
            with open(TIMING_DATA_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"[Timing] Could not load history: {e}")
    return {"samples": [], "avg_per_mb": {}}

def save_timing_history(history):
    """Save timing data for future estimates"""
    try:
        with open(TIMING_DATA_FILE, 'w') as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        print(f"[Timing] Could not save history: {e}")

def record_completion(model, file_size_mb, actual_seconds, was_cold_start=False):
    """Record a completed transcription for future estimates"""
    if file_size_mb <= 0:
        return

    # Skip recording cold starts (model loading pollutes timing)
    if was_cold_start:
        print(f"[Timing] Skipping cold start recording (model load included)")
        return

    history = load_timing_history()
    seconds_per_mb = actual_seconds / file_size_mb

    # Add sample (keep last 20 per model)
    sample = {"model": model, "size_mb": round(file_size_mb, 2),
              "seconds": round(actual_seconds, 1), "per_mb": round(seconds_per_mb, 1)}
    history["samples"].append(sample)
    history["samples"] = history["samples"][-50:]  # Keep last 50 total

    # Recalculate using MEDIAN for this model (more stable than mean)
    model_samples = [s for s in history["samples"] if s["model"] == model]
    if model_samples:
        sorted_rates = sorted(s["per_mb"] for s in model_samples)
        n = len(sorted_rates)
        if n % 2 == 0:
            median = (sorted_rates[n//2 - 1] + sorted_rates[n//2]) / 2
        else:
            median = sorted_rates[n//2]
        history["avg_per_mb"][model] = round(median, 1)
        print(f"[Timing] Updated {model} estimate: {median:.1f}s/MB median (from {n} samples)")

    save_timing_history(history)

def estimate_duration(model, file_size_mb):
    """Estimate transcription duration using historical data + defaults"""
    history = load_timing_history()

    # Use historical average if available, otherwise use default
    if model in history.get("avg_per_mb", {}):
        seconds_per_mb = history["avg_per_mb"][model]
        source = "learned"
    else:
        seconds_per_mb = MODEL_ESTIMATES.get(model, 30)
        source = "default"

    estimated = file_size_mb * seconds_per_mb
    # Add 5s buffer for overhead (file I/O, model warmup)
    estimated = max(10, estimated + 5)

    print(f"[Timing] Estimate: {estimated:.1f}s ({source}: {seconds_per_mb}s/MB × {file_size_mb:.2f}MB)")
    return estimated

def get_model():
    global whisper_model, model_loaded
    if whisper_model is None:
        print(f"\n[Whisper] Loading '{model_name}' model (first time may download ~140MB)...")
        import whisper
        load_start = time.time()
        whisper_model = whisper.load_model(model_name)
        load_time = time.time() - load_start
        print(f"[Whisper] Model loaded in {load_time:.1f}s\n")
        model_loaded = False  # First transcription after load
    else:
        model_loaded = True  # Model was already loaded
    return whisper_model

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "model": model_name})

@app.route('/progress', methods=['GET'])
def progress():
    """Get current transcription progress"""
    if not transcription_progress["active"]:
        return jsonify({"active": False, "progress": 0})

    # Calculate progress based on elapsed time vs estimated
    elapsed = time.time() - transcription_progress["start_time"]
    estimated = transcription_progress["estimated_duration"]

    if estimated > 0:
        # Cap at 90% until actually done (leaves buffer for estimation errors)
        pct = min(90, int((elapsed / estimated) * 100))
    else:
        pct = 50  # Fallback

    return jsonify({
        "active": True,
        "progress": pct,
        "filename": transcription_progress["filename"],
        "elapsed": round(elapsed, 1),
        "estimated": round(estimated, 1)
    })

@app.route('/transcribe', methods=['POST'])
def transcribe():
    """
    Transcribe an uploaded audio file.

    Form data:
        - file: Audio file (webm, mp3, wav, m4a, etc.)
        - language: Language code (en, hi, te, es, etc.) or 'auto'

    Returns:
        JSON with transcript text and metadata
    """
    start_time = time.time()

    # Check if file was uploaded
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    # Validate file extension
    allowed_extensions = {'.mp3', '.wav', '.m4a', '.webm', '.ogg', '.flac', '.aac', '.wma', '.mp4', '.mkv', '.avi', '.mov'}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions:
        return jsonify({"error": f"Unsupported file format: {ext}. Allowed: {', '.join(allowed_extensions)}"}), 400

    # Get language (default: auto-detect)
    language = request.form.get('language', 'auto')
    if language == 'auto':
        language = None

    print(f"[Whisper] Received file: {file.filename}")
    print(f"[Whisper] Language: {language or 'auto-detect'}")

    # Save to temporary file
    temp_path = None
    try:
        # Start progress tracking
        transcription_progress["active"] = True
        transcription_progress["progress"] = 0
        transcription_progress["filename"] = file.filename
        transcription_progress["start_time"] = time.time()
        # Create temp file with original extension
        ext = os.path.splitext(file.filename)[1] or '.webm'
        # On Windows, we need to close the file before saving to it
        temp_fd, temp_path = tempfile.mkstemp(suffix=ext)
        os.close(temp_fd)  # Close the file descriptor
        file.save(temp_path)

        print(f"[Whisper] Saved to: {temp_path}")
        file_size = os.path.getsize(temp_path)
        file_size_mb = file_size / (1024 * 1024)
        print(f"[Whisper] File size: {file_size} bytes ({file_size_mb:.2f} MB)")

        # Smart duration estimate using historical data
        estimated_seconds = estimate_duration(model_name, file_size_mb)
        transcription_progress["estimated_duration"] = estimated_seconds
        transcription_progress["file_size_mb"] = file_size_mb

        # Verify file is not empty
        if file_size == 0:
            return jsonify({"error": "Uploaded file is empty"}), 400

        # Verify file size limit (500 MB max)
        MAX_FILE_SIZE_MB = 500
        if file_size_mb > MAX_FILE_SIZE_MB:
            return jsonify({"error": f"File too large: {file_size_mb:.1f}MB (max {MAX_FILE_SIZE_MB}MB)"}), 400

        # Verify file can be read
        with open(temp_path, 'rb') as f:
            header = f.read(10)
            print(f"[Whisper] File header: {header.hex()}")

        print(f"[Whisper] Processing...")

        # Transcribe (track if this is a cold start)
        model = get_model()
        was_cold_start = not model_loaded  # True if model was just loaded

        # Start timing AFTER model is loaded for accurate measurement
        transcribe_start = time.time()
        result = model.transcribe(
            temp_path,
            language=language,
            verbose=False
        )
        transcribe_time = time.time() - transcribe_start

        elapsed = time.time() - start_time
        print(f"[Whisper] Done in {elapsed:.1f}s (transcribe: {transcribe_time:.1f}s)")

        # Record timing for future estimates (use transcribe_time, not total elapsed)
        record_completion(model_name, transcription_progress["file_size_mb"], transcribe_time, was_cold_start)

        # Mark progress as complete
        transcription_progress["progress"] = 100
        transcription_progress["active"] = False

        # Build response
        response = {
            "success": True,
            "text": result["text"].strip(),
            "language": result.get("language", language),
            "duration": elapsed,
            "segments": []
        }

        # Include segments for potential SRT export
        for seg in result.get("segments", []):
            response["segments"].append({
                "start": seg["start"],
                "end": seg["end"],
                "text": seg["text"].strip()
            })

        return jsonify(response)

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Whisper] Error: {str(e)}")
        # Reset progress on error
        transcription_progress["active"] = False
        transcription_progress["progress"] = 0
        return jsonify({"error": str(e)}), 500

    finally:
        # Clean up temp file
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

@app.route('/models', methods=['GET'])
def list_models():
    """List available Whisper models"""
    return jsonify({
        "models": [
            {"name": "tiny", "size": "~39MB", "speed": "fastest", "accuracy": "lowest"},
            {"name": "base", "size": "~74MB", "speed": "fast", "accuracy": "good"},
            {"name": "small", "size": "~244MB", "speed": "medium", "accuracy": "better"},
            {"name": "medium", "size": "~769MB", "speed": "slow", "accuracy": "great"},
            {"name": "large", "size": "~1550MB", "speed": "slowest", "accuracy": "best"}
        ],
        "current": model_name
    })

@app.route('/timing', methods=['GET'])
def timing_stats():
    """View timing statistics and learned estimates"""
    history = load_timing_history()
    return jsonify({
        "defaults": MODEL_ESTIMATES,
        "learned": history.get("avg_per_mb", {}),
        "samples": len(history.get("samples", [])),
        "recent": history.get("samples", [])[-5:],
        "model_loaded": model_loaded
    })

@app.route('/timing/reset', methods=['POST'])
def reset_timing():
    """Reset all timing data to defaults"""
    try:
        if os.path.exists(TIMING_DATA_FILE):
            os.remove(TIMING_DATA_FILE)
            print("[Timing] Reset: deleted timing history")
            return jsonify({"success": True, "message": "Timing data reset"})
        else:
            return jsonify({"success": True, "message": "No timing data to reset"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    print("=" * 50)
    print("  Whisper Transcription Server")
    print("=" * 50)
    print(f"  Model: {model_name}")
    print(f"  URL: http://localhost:5000")
    print("=" * 50)
    print("\nEndpoints:")
    print("  POST /transcribe - Upload audio file")
    print("  GET  /health - Check server status")
    print("  GET  /progress - Get transcription progress")
    print("  GET  /models - List available models")
    print("  GET  /timing - View learned timing stats")
    print("  POST /timing/reset - Reset timing data")
    print("\nPress Ctrl+C to stop\n")

    app.run(host='0.0.0.0', port=5000, debug=False)

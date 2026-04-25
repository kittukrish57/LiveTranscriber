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

app = Flask(__name__)
CORS(app)  # Allow requests from browser

# Lazy load whisper to show startup message first
whisper_model = None
model_name = "base"  # Options: tiny, base, small, medium, large

def get_model():
    global whisper_model
    if whisper_model is None:
        print(f"\n[Whisper] Loading '{model_name}' model (first time may download ~140MB)...")
        import whisper
        whisper_model = whisper.load_model(model_name)
        print(f"[Whisper] Model loaded successfully!\n")
    return whisper_model

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "model": model_name})

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

    # Get language (default: auto-detect)
    language = request.form.get('language', 'auto')
    if language == 'auto':
        language = None

    print(f"[Whisper] Received file: {file.filename}")
    print(f"[Whisper] Language: {language or 'auto-detect'}")

    # Save to temporary file
    temp_path = None
    try:
        # Create temp file with original extension
        ext = os.path.splitext(file.filename)[1] or '.webm'
        # On Windows, we need to close the file before saving to it
        temp_fd, temp_path = tempfile.mkstemp(suffix=ext)
        os.close(temp_fd)  # Close the file descriptor
        file.save(temp_path)

        print(f"[Whisper] Saved to: {temp_path}")
        file_size = os.path.getsize(temp_path)
        print(f"[Whisper] File size: {file_size} bytes")

        # Verify file is not empty
        if file_size == 0:
            return jsonify({"error": "Uploaded file is empty"}), 400

        # Verify file can be read
        with open(temp_path, 'rb') as f:
            header = f.read(10)
            print(f"[Whisper] File header: {header.hex()}")

        print(f"[Whisper] Processing...")

        # Transcribe
        model = get_model()
        result = model.transcribe(
            temp_path,
            language=language,
            verbose=False
        )

        elapsed = time.time() - start_time
        print(f"[Whisper] Done in {elapsed:.1f}s")

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

if __name__ == '__main__':
    print("=" * 50)
    print("  Whisper Transcription Server")
    print("=" * 50)
    print(f"  Model: {model_name}")
    print(f"  URL: http://localhost:5000")
    print("=" * 50)
    print("\nEndpoints:")
    print("  POST /transcribe - Upload audio file")
    print("  GET /health - Check server status")
    print("  GET /models - List available models")
    print("\nPress Ctrl+C to stop\n")

    app.run(host='0.0.0.0', port=5000, debug=False)

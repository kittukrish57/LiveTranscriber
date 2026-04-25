# Live Transcriber Pro

Real-time speech-to-text transcription app that works in your browser.

## Quick Start (2 steps)

### Step 1: Generate Icons (one-time)
1. Open `generate-icons.html` in Chrome
2. Click both download buttons
3. Move downloaded files to `icons/` folder as `icon-192.png` and `icon-512.png`

### Step 2: Start the App
1. Open a terminal in this folder
2. Run: `python -m http.server 8000`
3. Open http://localhost:8000 in Chrome

## Install as App (PWA)

Once running, Chrome will show an install icon in the address bar:
- Click the install icon (or Menu > Install Live Transcriber)
- The app will open in its own window and work offline!

### On iPhone/Android
1. Open http://localhost:8000 in Chrome/Safari
2. Tap Share > Add to Home Screen
3. The app icon appears on your home screen

## Features

- **Real-time transcription** - Uses browser's speech recognition
- **Live Mode** - Faster visual updates
- **Auto-paragraph** - Breaks text on natural pauses
- **No Fillers** - Removes "uh", "um", "like"
- **Export** - Save as .txt, .srt, or .json
- **Record Audio** - Capture audio while transcribing
- **Dark/Light theme** - Press T to toggle
- **Search** - Ctrl+F to search transcript

## Audio File Upload (Requires Whisper Server)

For transcribing pre-recorded audio files:

### One-time Setup
```bash
# Install Python dependencies
pip install flask flask-cors openai-whisper

# Install FFmpeg (Windows)
winget install ffmpeg
```

### Start Whisper Server
```bash
python whisper_server.py
```
Then click the folder icon in the app to upload audio files.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Start/Stop |
| R | Record audio |
| T | Toggle theme |
| E | Edit mode |
| C | Copy transcript |
| Ctrl+Z | Undo |
| Ctrl+F | Search |
| Ctrl+S | Export |

## Sharing with Friends

Just copy this whole folder to their computer. They need:
- Google Chrome (recommended) or Edge browser
- Python 3 (for running the local server)
- For Whisper uploads: Python packages listed above

## Troubleshooting

**Microphone not working?**
- Allow microphone permission when prompted
- Check Chrome settings: chrome://settings/content/microphone

**Speech recognition not available?**
- Use Chrome or Edge (Firefox/Safari don't support Web Speech API)
- Must be served via localhost or HTTPS

**Whisper server not connecting?**
- Make sure `python whisper_server.py` is running
- Check that FFmpeg is installed: `ffmpeg -version`

## File Structure
```
LiveTranscriber/
├── index.html          # Main app page
├── app.js              # Application logic
├── style.css           # Styles
├── manifest.json       # PWA manifest
├── service-worker.js   # Offline support
├── whisper_server.py   # Whisper API server
├── icons/              # App icons
│   ├── icon-192.png
│   └── icon-512.png
└── generate-icons.html # Icon generator
```

Enjoy transcribing!

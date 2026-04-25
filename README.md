# Live Transcriber Pro

Real-time speech-to-text transcription app. Works in your browser, no account needed.

## Quick Start

**Open this URL:**
```
https://kittukrish57.github.io/LiveTranscriber/
```

Click **Start** → Speak → See text appear. That's it!

### Install as App (Optional)

**iPhone/iPad:**
1. Open the URL in **Safari** (not Chrome)
2. Tap the **Share** button (box with arrow)
3. Scroll down, tap **"Add to Home Screen"**
4. Tap **Add**

**Android:**
1. Open the URL in Chrome
2. Tap menu (3 dots) → **"Add to Home Screen"** or **"Install"**

**Windows/Mac:**
1. Open the URL in Chrome
2. Click the install icon in address bar (right side)
3. Click **Install**

---

## Features

| Feature | Description |
|---------|-------------|
| Live Transcription | Real-time speech-to-text using your microphone |
| Audio Recording | Record audio while transcribing |
| Export | Save as .txt, .srt subtitles, or .json |
| Search | Find text in your transcript (Ctrl+F) |
| Themes | Dark and light mode (press T) |
| Offline | Works without internet after install |

---

## Audio File Upload (Advanced)

Want to transcribe a pre-recorded audio file (MP3, WAV, etc.)? This requires a one-time setup on your PC.

### Step 1: Install Python

1. Go to [python.org/downloads](https://python.org/downloads)
2. Download and run the installer
3. **IMPORTANT:** Check the box **"Add Python to PATH"** during installation

### Step 2: Install FFmpeg

Open **Command Prompt** (search "cmd" in Start menu) and run:

**Windows:**
```
winget install ffmpeg
```

**Mac:**
```
brew install ffmpeg
```

### Step 3: Install Python Packages

In Command Prompt, run:
```
pip install flask flask-cors openai-whisper
```

This downloads the Whisper AI model (~1-2 GB). Wait for it to complete.

### Step 4: Download the Server File

1. Go to: https://github.com/kittukrish57/LiveTranscriber
2. Click on `whisper_server.py`
3. Click **"Raw"** button (top right)
4. Right-click → **Save As** → Save to your computer

### Step 5: Start the Server

Open Command Prompt, navigate to where you saved the file, and run:
```
py whisper_server.py
```

You should see:
```
* Running on http://127.0.0.1:5000
```

**Keep this window open!**

### Step 6: Upload Your File

1. Open the Live Transcriber app
2. Click the **folder icon** (top right)
3. Upload your audio file
4. Click **Transcribe**

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Start/Stop transcription |
| R | Record audio |
| T | Toggle dark/light theme |
| E | Edit mode |
| C | Copy transcript |
| Ctrl+Z | Undo |
| Ctrl+F | Search |
| Ctrl+S | Export |

---

## Troubleshooting

### Microphone not working?
- Click "Allow" when browser asks for microphone permission
- Check browser settings: Chrome → Settings → Privacy → Microphone

### Speech recognition not working?
- Use **Google Chrome** or **Microsoft Edge** (Firefox and Safari don't support Web Speech API)
- Make sure you're not in a very noisy environment

### Whisper server not connecting?
- Make sure `py whisper_server.py` is running in Command Prompt
- Check that FFmpeg is installed: run `ffmpeg -version`
- Try restarting the server

### App shows 404 on iPhone?
- Clear Safari cache: Settings → Safari → Clear History and Website Data
- Re-add to Home Screen

---

## Privacy

- All transcription happens **locally** on your device
- Your audio and text **never leave your device**
- No accounts, no cloud, no tracking
- Each person's data stays on their own device

---

## For Developers

Clone and run locally:
```bash
git clone https://github.com/kittukrish57/LiveTranscriber.git
cd LiveTranscriber
py -m http.server 8000
```

Open http://localhost:8000

---

Made with Claude AI

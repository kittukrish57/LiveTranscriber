class LiveTranscriber {
    constructor() {
        this.recognition = null;
        this.listening = false;
        this.fullTranscript = '';
        this.lastInterim = '';
        this.lastCapturedLength = 0;
        this.startTime = null;
        this.timer = null;

        // Audio recording
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioBlob = null;
        this.isRecording = false;
        this.recordingStream = null;

        // Transcript segments with timestamps
        this.segments = [];
        this.lastSegmentTime = null;

        // Settings
        this.settings = {
            fontSize: 16,
            autoParagraph: true,
            liveMode: false, // Live Mode: shows all text as green (faster perceived speed)
            showTimestamps: false,
            autoSave: true,
            removeFillers: false,
            noiseReduction: false,
            debugMode: true,
            theme: 'dark',
            language: 'en-US'
        };

        // Edit & Undo
        this.editMode = false;
        this.undoStack = [];
        this.maxUndoStack = 50;

        // Search
        this.searchMatches = [];
        this.currentMatchIndex = -1;

        // Stats
        this.wordCount = 0;
        this.sessionStartTime = null;

        // Performance tracking
        this.lastResultTime = 0;
        this.interimCount = 0;
        this.finalCount = 0;
        this.truncationCount = 0;
        this.captureCount = 0;

        // Watchdog for API failures
        this.watchdogTimer = null;
        this.watchdogInterval = 12000; // Warn if no results in 12 seconds (was 8s, too aggressive)
        this.hasReceivedResults = false;

        // Post-capture skip window (to avoid duplicate variants)
        this.lastCaptureTime = 0;
        this.captureSkipWindow = 2000; // Skip FINALs for 2s after emergency capture (was 3s)

        // Progressive commit - commit text faster (time-based)
        this.lastCommitTime = 0;
        this.progressiveCommitThreshold = 80; // Commit when interim > 80 chars
        this.progressiveCommitInterval = 2000; // Commit every 2 seconds max

        // User scroll detection - don't auto-scroll if user is reading earlier text
        this.userScrolledUp = false;
        this.lastAutoScrollTime = 0;

        // Performance: Render debouncing
        this.renderPending = false;
        this.renderDebounceMs = 50; // Render max every 50ms (20 fps - faster visual updates)
        this.pendingInterim = '';

        // Debug mode (set to false to reduce console overhead)
        this.debugMode = true;

        // Filler word removal
        this.removeFillers = false;
        this.fillerWords = /\b(uh|um|er|ah|like|you know|basically|actually|literally|right|okay|so yeah|yeah|I mean)\b/gi;

        // Silence detection
        this.lastSpeechTime = 0;
        this.silenceWarningShown = false;
        this.silenceThreshold = 10000; // 10 seconds

        // Audio processing (level meter + noise reduction)
        this.audioContext = null;
        this.analyser = null;
        this.audioStream = null;
        this.audioLevelInterval = null;
        this.noiseReduction = false;
        this.noiseGate = null;
        this.highpassFilter = null;
        this.lowpassFilter = null;
        this.compressor = null;

        // Connection state
        this.connectionState = 'disconnected'; // disconnected, connecting, connected, error

        // Auto-save interval (aggressive - every 2 seconds)
        this.autoSaveInterval = null;
        this.lastSavedTranscript = '';

        // IndexedDB for crash recovery
        this.db = null;
        this.initIndexedDB();

        this.loadSettings();
        this.initUI();
        this.initRecognition();
        this.loadFromStorage();

        console.log('%c=== LIVE TRANSCRIBER PRO v4.0 ===', 'color: #ff6b6b; font-weight: bold; font-size: 16px');
        console.log('%c[UI] Modern Clean Design', 'color: #00ff88');
        console.log('%cColor Guide:', 'font-weight: bold');
        console.log('%c  GREEN = INTERIM (real-time, ~500ms delay)', 'color: #00ff88');
        console.log('%c  CYAN = FINAL (confirmed, 1-3s delay)', 'color: #00d9ff');
        console.log('%c  ORANGE = CAPTURE (emergency save)', 'color: #ffaa00');
        console.log('%c  RED = TRUNCATION/WARNING', 'color: #ff4757');
        console.log('%c  PURPLE = EVENT', 'color: #a29bfe');
        console.log('%c  GRAY = TIMING/PERF', 'color: #888');
    }

    log(msg, type = 'default', data = null) {
        // Skip logging if debug mode is off (except critical events)
        if (!this.debugMode && !['warning', 'event', 'title'].includes(type)) {
            return performance.now();
        }

        const now = performance.now();
        const time = now.toFixed(0);
        const colors = {
            title: 'color: #ff6b6b; font-weight: bold; font-size: 14px',
            info: 'color: #888',
            interim: 'color: #00ff88',
            final: 'color: #00d9ff; font-weight: bold',
            capture: 'color: #ffaa00; font-weight: bold',
            warning: 'color: #ff4757; font-weight: bold',
            event: 'color: #a29bfe',
            perf: 'color: #888; font-style: italic',
            skip: 'color: #666'
        };
        const style = colors[type] || 'color: #fff';
        if (data !== null) {
            console.log(`%c[${time}ms] ${msg}`, style, data);
        } else {
            console.log(`%c[${time}ms] ${msg}`, style);
        }
        return now;
    }

    initUI() {
        this.els = {
            // New UI elements
            micBtn: document.getElementById('micBtn'),
            record: document.getElementById('recordBtn'),
            clear: document.getElementById('clearBtn'),
            export: document.getElementById('exportBtn'),
            exportTxt: document.getElementById('exportTxt'),
            exportSrt: document.getElementById('exportSrt'),
            exportJson: document.getElementById('exportJson'),
            exportMenu: document.getElementById('exportMenu'),
            exportOverlay: document.getElementById('exportOverlay'),
            copy: document.getElementById('copyBtn'),
            undo: document.getElementById('undoBtn'),
            edit: document.getElementById('editBtn'),
            saveAudio: document.getElementById('saveAudioBtn'),
            transcript: document.getElementById('transcript'),
            transcriptContainer: document.getElementById('transcriptContainer'),
            duration: document.getElementById('duration'),
            language: document.getElementById('language'),
            recordingIndicator: document.getElementById('recordingIndicator'),
            wordCount: document.getElementById('wordCount'),
            themeToggle: document.getElementById('themeToggle'),
            settingsBtn: document.getElementById('settingsBtn'),
            settingsPanel: document.getElementById('settingsPanel'),
            settingsOverlay: document.getElementById('settingsOverlay'),
            closeSettings: document.getElementById('closeSettings'),
            fontDecrease: document.getElementById('fontDecrease'),
            fontIncrease: document.getElementById('fontIncrease'),
            fontSizeDisplay: document.getElementById('fontSizeDisplay'),
            autoParagraph: document.getElementById('autoParagraph'),
            showTimestamps: document.getElementById('showTimestamps'),
            autoSave: document.getElementById('autoSave'),
            removeFillers: document.getElementById('removeFillers'),
            noiseReductionToggle: document.getElementById('noiseReduction'),
            liveModeToggle: document.getElementById('liveMode'),
            debugModeToggle: document.getElementById('debugMode'),
            connectionIndicator: document.getElementById('connectionIndicator'),
            micLevelFill: document.getElementById('micLevelFill'),
            searchToggle: document.getElementById('searchToggle'),
            searchBar: document.getElementById('searchBar'),
            searchInput: document.getElementById('searchInput'),
            searchResults: document.getElementById('searchResults'),
            searchPrev: document.getElementById('searchPrev'),
            searchNext: document.getElementById('searchNext'),
            clearSearch: document.getElementById('clearSearch'),
            contextActions: document.getElementById('contextActions'),
            toast: document.getElementById('toast'),
            // Upload modal
            uploadBtn: document.getElementById('uploadBtn'),
            uploadModal: document.getElementById('uploadModal'),
            closeUploadModal: document.getElementById('closeUploadModal'),
            uploadZone: document.getElementById('uploadZone'),
            audioFileInput: document.getElementById('audioFileInput'),
            uploadFileInfo: document.getElementById('uploadFileInfo'),
            uploadFileName: document.getElementById('uploadFileName'),
            uploadFileSize: document.getElementById('uploadFileSize'),
            removeUploadFile: document.getElementById('removeUploadFile'),
            uploadLanguage: document.getElementById('uploadLanguage'),
            uploadProgress: document.getElementById('uploadProgress'),
            progressFill: document.getElementById('progressFill'),
            uploadStatus: document.getElementById('uploadStatus'),
            serverStatus: document.getElementById('serverStatus'),
            transcribeBtn: document.getElementById('transcribeBtn'),
            transcribeBackground: document.getElementById('transcribeBackground'),
            uploadEstimate: document.getElementById('uploadEstimate'),
            // Setup guide modal
            setupGuideBtn: document.getElementById('setupGuideBtn'),
            setupGuideModal: document.getElementById('setupGuideModal'),
            closeSetupGuide: document.getElementById('closeSetupGuide')
        };

        // Upload state
        this.uploadedFile = null;
        this.whisperServerUrl = 'http://localhost:5000';
        this.isTranscribing = false;

        // Main mic button - toggles start/stop
        this.els.micBtn.onclick = () => {
            if (this.listening) {
                this.log('[ACTION] User clicked MIC button to STOP', 'event');
                this.stop();
            } else {
                this.log('[ACTION] User clicked MIC button to START', 'event');
                this.start();
            }
        };

        // Context action buttons
        this.els.record.onclick = () => {
            this.log(`[ACTION] User clicked RECORD button (currently: ${this.isRecording ? 'recording' : 'not recording'})`, 'event');
            this.toggleRecording();
        };
        this.els.clear.onclick = () => {
            this.log('[ACTION] User clicked CLEAR button', 'event');
            this.confirmClear();
        };
        this.els.copy.onclick = () => {
            this.log(`[ACTION] User clicked COPY button (${this.fullTranscript.length} chars)`, 'event');
            this.copyToClipboard();
        };
        this.els.undo.onclick = () => {
            this.log(`[ACTION] User clicked UNDO button (stack size: ${this.undoStack.length})`, 'event');
            this.undo();
        };
        this.els.edit.onclick = () => {
            this.log(`[ACTION] User clicked EDIT button (currently: ${this.editMode ? 'editing' : 'not editing'})`, 'event');
            this.toggleEditMode();
        };
        this.els.saveAudio.onclick = () => {
            this.log(`[ACTION] User clicked SAVE AUDIO button (blob: ${this.audioBlob ? this.audioBlob.size + ' bytes' : 'none'})`, 'event');
            this.saveAudio();
        };

        // Export menu (bottom sheet style)
        this.els.export.onclick = () => {
            const isOpening = this.els.exportMenu.classList.contains('hidden');
            this.els.exportMenu.classList.toggle('hidden');
            this.els.exportOverlay.classList.toggle('hidden');
            this.log(`[ACTION] User ${isOpening ? 'opened' : 'closed'} EXPORT menu`, 'event');
        };
        this.els.exportOverlay.onclick = () => {
            this.els.exportMenu.classList.add('hidden');
            this.els.exportOverlay.classList.add('hidden');
        };
        this.els.exportTxt.onclick = () => {
            this.log(`[ACTION] User clicked EXPORT TXT (${this.fullTranscript.length} chars)`, 'event');
            this.exportAs('txt');
            this.els.exportMenu.classList.add('hidden');
            this.els.exportOverlay.classList.add('hidden');
        };
        this.els.exportSrt.onclick = () => {
            this.log(`[ACTION] User clicked EXPORT SRT (${this.segments.length} segments)`, 'event');
            this.exportAs('srt');
            this.els.exportMenu.classList.add('hidden');
            this.els.exportOverlay.classList.add('hidden');
        };
        this.els.exportJson.onclick = () => {
            this.log(`[ACTION] User clicked EXPORT JSON`, 'event');
            this.exportAs('json');
            this.els.exportMenu.classList.add('hidden');
            this.els.exportOverlay.classList.add('hidden');
        };

        // Search toggle
        this.els.searchToggle.onclick = () => {
            this.els.searchBar.classList.toggle('hidden');
            if (!this.els.searchBar.classList.contains('hidden')) {
                this.els.searchInput.focus();
            }
        };

        // Settings (slide-in panel)
        this.els.themeToggle.onclick = () => {
            this.log(`[ACTION] User clicked THEME toggle (current: ${this.settings.theme})`, 'event');
            this.toggleTheme();
        };
        this.els.settingsBtn.onclick = () => {
            this.log(`[ACTION] User opened SETTINGS panel`, 'event');
            this.openSettings();
        };
        this.els.closeSettings.onclick = () => {
            this.log(`[ACTION] User closed SETTINGS panel`, 'event');
            this.closeSettings();
        };
        this.els.settingsOverlay.onclick = () => {
            this.closeSettings();
        };
        this.els.fontDecrease.onclick = () => {
            this.log(`[ACTION] User clicked FONT DECREASE (current: ${this.settings.fontSize}px)`, 'event');
            this.changeFontSize(-2);
        };
        this.els.fontIncrease.onclick = () => {
            this.log(`[ACTION] User clicked FONT INCREASE (current: ${this.settings.fontSize}px)`, 'event');
            this.changeFontSize(2);
        };

        this.els.autoParagraph.onchange = () => {
            this.settings.autoParagraph = this.els.autoParagraph.checked;
            this.saveSettings();
            this.log(`[SETTINGS] Auto Paragraph: ${this.settings.autoParagraph ? 'ON' : 'OFF'}`, 'event');
        };
        this.els.liveModeToggle.onchange = () => {
            this.settings.liveMode = this.els.liveModeToggle.checked;
            this.saveSettings();
            this.render(this.lastInterim || '');
            this.updateLiveModeState();
            this.log(`[SETTINGS] Live Mode: ${this.settings.liveMode ? 'ON' : 'OFF'}`, 'event');
            if (this.settings.liveMode) {
                this.showToast('Live Mode: Faster display, all text unified');
            }
        };
        this.els.showTimestamps.onchange = () => {
            this.settings.showTimestamps = this.els.showTimestamps.checked;
            this.saveSettings();
            this.render('');
            this.log(`[SETTINGS] Show Timestamps: ${this.settings.showTimestamps ? 'ON' : 'OFF'}`, 'event');
        };
        this.els.autoSave.onchange = () => {
            this.settings.autoSave = this.els.autoSave.checked;
            this.saveSettings();
            this.log(`[SETTINGS] Auto Save: ${this.settings.autoSave ? 'ON' : 'OFF'}`, 'event');
        };
        this.els.removeFillers.onchange = () => {
            this.removeFillers = this.els.removeFillers.checked;
            this.settings.removeFillers = this.removeFillers;
            this.saveSettings();
            this.log(`[SETTINGS] Remove Fillers: ${this.removeFillers ? 'ON' : 'OFF'}`, 'event');
        };
        this.els.noiseReductionToggle.onchange = () => {
            this.noiseReduction = this.els.noiseReductionToggle.checked;
            this.settings.noiseReduction = this.noiseReduction;
            this.saveSettings();
            this.log(`[SETTINGS] Noise Reduction: ${this.noiseReduction ? 'ON' : 'OFF'}`, 'event');
            if (this.listening) {
                this.showToast(this.noiseReduction ? 'Noise reduction enabled' : 'Noise reduction disabled');
            }
        };
        this.els.debugModeToggle.onchange = () => {
            this.debugMode = this.els.debugModeToggle.checked;
            this.settings.debugMode = this.debugMode;
            this.saveSettings();
            console.log(`%c[${performance.now().toFixed(0)}ms] [SETTINGS] Debug Mode: ${this.debugMode ? 'ON' : 'OFF'}`, 'color: #a29bfe');
        };
        this.els.language.onchange = () => {
            this.settings.language = this.els.language.value;
            if (this.recognition) this.recognition.lang = this.els.language.value;
            this.saveSettings();
            this.log(`[SETTINGS] Language changed to: ${this.settings.language}`, 'event');
        };

        // Search (debounced logging to reduce noise)
        this.searchLogTimer = null;
        this.els.searchInput.oninput = () => {
            const query = this.els.searchInput.value;
            // Debounce search logging - only log after 500ms of no typing
            clearTimeout(this.searchLogTimer);
            if (query.length > 0) {
                this.searchLogTimer = setTimeout(() => {
                    this.log(`[ACTION] User searched: "${query}" (${this.searchMatches.length} results)`, 'event');
                }, 500);
            }
            this.search();
        };
        this.els.searchPrev.onclick = () => {
            this.log(`[ACTION] User clicked SEARCH PREV (${this.currentMatchIndex + 1}/${this.searchMatches.length})`, 'event');
            this.navigateSearch(-1);
        };
        this.els.searchNext.onclick = () => {
            this.log(`[ACTION] User clicked SEARCH NEXT (${this.currentMatchIndex + 1}/${this.searchMatches.length})`, 'event');
            this.navigateSearch(1);
        };
        this.els.clearSearch.onclick = () => {
            this.log(`[ACTION] User clicked CLEAR SEARCH`, 'event');
            this.clearSearch();
        };

        // Edit mode - track manual edits
        this.els.transcript.addEventListener('input', () => {
            if (this.editMode) {
                this.log(`[ACTION] User edited transcript in EDIT MODE (${this.els.transcript.innerText.length} chars)`, 'event');
                this.saveUndoState();
                this.fullTranscript = this.els.transcript.innerText;
                this.updateStats();
                this.autoSaveToStorage();
            }
        });

        // Upload modal
        this.els.uploadBtn.onclick = () => {
            this.log('[ACTION] User opened UPLOAD modal', 'event');
            this.openUploadModal();
        };
        this.els.closeUploadModal.onclick = () => {
            this.log('[ACTION] User closed UPLOAD modal', 'event');
            this.closeUploadModal();
        };
        this.els.uploadModal.onclick = (e) => {
            if (e.target === this.els.uploadModal) this.closeUploadModal();
        };
        this.els.uploadZone.onclick = () => this.els.audioFileInput.click();
        this.els.audioFileInput.onchange = (e) => this.handleFileSelect(e.target.files[0]);
        this.els.removeUploadFile.onclick = () => this.clearUploadFile();
        this.els.transcribeBtn.onclick = () => this.transcribeUploadedFile(false);
        this.els.transcribeBackground.onclick = () => {
            this.transcribeUploadedFile(true);
            this.closeUploadModal();
        };

        // Drag and drop
        this.els.uploadZone.ondragover = (e) => {
            e.preventDefault();
            this.els.uploadZone.classList.add('dragover');
        };
        this.els.uploadZone.ondragleave = () => {
            this.els.uploadZone.classList.remove('dragover');
        };
        this.els.uploadZone.ondrop = (e) => {
            e.preventDefault();
            this.els.uploadZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) this.handleFileSelect(file);
        };

        // Setup guide modal
        this.els.setupGuideBtn.onclick = () => {
            this.els.setupGuideModal.classList.remove('hidden');
        };
        this.els.closeSetupGuide.onclick = () => {
            this.els.setupGuideModal.classList.add('hidden');
        };
        this.els.setupGuideModal.onclick = (e) => {
            if (e.target === this.els.setupGuideModal) {
                this.els.setupGuideModal.classList.add('hidden');
            }
        };

        // Smart scroll detection - allow user to scroll up without being pulled back down
        this.els.transcriptContainer.addEventListener('scroll', () => {
            const container = this.els.transcriptContainer;
            const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;

            if (isAtBottom) {
                // User scrolled back to bottom - resume auto-scroll
                if (this.userScrolledUp) {
                    this.userScrolledUp = false;
                    this.log('[SCROLL] User at bottom - auto-scroll resumed', 'info');
                }
            } else {
                // User scrolled up - pause auto-scroll
                // Only set if this was a user action, not our auto-scroll
                const timeSinceAutoScroll = performance.now() - this.lastAutoScrollTime;
                if (timeSinceAutoScroll > 100 && !this.userScrolledUp) {
                    this.userScrolledUp = true;
                    this.log('[SCROLL] User scrolled up - auto-scroll paused', 'info');
                }
            }
        });

        this.applySettings();
    }

    initRecognition() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            this.showToast('Speech recognition not supported - use Chrome or Edge');
            this.els.micBtn.disabled = true;
            return;
        }

        this.recognition = new SR();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
        this.recognition.lang = this.settings.language;

        this.recognition.onstart = () => {
            this.listening = true;
            this.interimCount = 0;
            this.finalCount = 0;
            this.truncationCount = 0;
            this.captureCount = 0;
            this.hasReceivedResults = false;
            this.lastResultTime = performance.now();
            this.updateMicState(true);
            this.log('>>> RECOGNITION STARTED', 'event');
            this.log('[PERF] Waiting for first result from Google API (may take 5-10s)...', 'perf');

            // Start watchdog timer
            this.startWatchdog();

            // Show warming up message
            this.render('');
        };

        this.recognition.onend = () => {
            this.log('<<< RECOGNITION ENDED', 'event');
            const sessionDuration = this.startTime ? ((Date.now() - this.startTime) / 1000).toFixed(1) : 0;
            const avgInterimGap = this.interimCount > 0 ? (sessionDuration * 1000 / this.interimCount).toFixed(0) : 0;
            this.log(`[STATS] Session: ${sessionDuration}s`, 'perf');
            this.log(`[STATS] Interims: ${this.interimCount} (avg ${avgInterimGap}ms gap)`, 'perf');
            this.log(`[STATS] Finals: ${this.finalCount}, Truncations: ${this.truncationCount}, Captures: ${this.captureCount}`, 'perf');
            this.log(`[STATS] Transcript: ${this.fullTranscript.length} chars, ${this.segments.length} segments`, 'perf');

            if (this.lastInterim) {
                this.log('[END] Capturing remaining interim before restart', 'capture');
                this.captureInterim('session-end');
            }

            if (this.listening) {
                this.log('[AUTO] Restarting recognition...', 'event');
                this.updateConnectionState('connecting');
                try { this.recognition.start(); } catch (e) {
                    this.log('[ERROR] Restart failed: ' + e.message, 'warning');
                    this.updateConnectionState('error');
                }
            } else {
                this.updateMicState(false);
            }
        };

        this.recognition.onresult = (event) => {
            // Reset watchdog on any result
            this.resetWatchdog();
            if (!this.hasReceivedResults) {
                this.hasReceivedResults = true;
                this.setStatus('Listening...', 'listening');
                this.updateConnectionState('connected');
                this.log('[PERF] First result received! Real-time transcription active.', 'event');
            }
            this.handleResult(event);
        };

        this.recognition.onerror = (event) => {
            this.log('[ERROR] ' + event.error, 'warning');
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            if (event.error === 'not-allowed') {
                this.setStatus('Microphone access denied', 'error');
                this.updateConnectionState('error');
                this.stop();
            } else if (event.error === 'network') {
                this.updateConnectionState('error');
                this.showToast('Network error - check connection', true);
            }
        };
    }

    handleResult(event) {
        const now = performance.now();
        const timeSinceLastResult = now - this.lastResultTime;
        this.lastResultTime = now;

        let final = '';
        let interim = '';
        let hasFinal = false;

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0].transcript;
            if (result.isFinal) {
                final += text;
                hasFinal = true;
            } else {
                interim += text;
            }
        }

        // INTERIM RESULTS - Real-time display
        if (interim) {
            this.interimCount++;
            this.lastSpeechTime = now; // Track last speech for silence detection
            this.silenceWarningShown = false;
            const interimLen = interim.length;
            const lastLen = this.lastInterim.length;

            // Log every 10th interim to reduce noise, or if something interesting
            const shouldLog = this.interimCount % 10 === 1 || hasFinal || interimLen < lastLen * 0.5;

            if (shouldLog) {
                this.log(`[INTERIM #${this.interimCount}] "${interim.slice(-50)}..." (${interimLen} chars, gap: ${timeSinceLastResult.toFixed(0)}ms)`, 'interim');
            }

            // TRUNCATION DETECTION - More aggressive (30% threshold)
            let truncated = false;
            if (interimLen < lastLen * 0.3 && lastLen > 20) {
                this.truncationCount++;
                this.log(`[TRUNCATION #${this.truncationCount}] Interim shrank: ${lastLen} → ${interimLen} chars`, 'warning');
                this.log(`[TRUNCATION] Lost text: "${this.lastInterim.slice(0, 60)}..."`, 'warning');
                this.captureInterim('truncation');
                this.lastCommitTime = now; // Reset commit timer
                truncated = true;
            }
            // PREFIX CHANGE DETECTION
            else if (lastLen > 25 && interimLen > 10) {
                const lastStart = this.lastInterim.substring(0, 15).toLowerCase();
                const currentStart = interim.substring(0, 15).toLowerCase();
                if (lastStart !== currentStart && !this.lastInterim.toLowerCase().includes(currentStart.substring(0, 8))) {
                    this.truncationCount++;
                    this.log(`[PREFIX CHANGE #${this.truncationCount}] "${lastStart}" → "${currentStart}"`, 'warning');
                    this.captureInterim('prefix-change');
                    this.lastCommitTime = now; // Reset commit timer
                    truncated = true;
                }
            }

            // PROGRESSIVE COMMIT - Time-based commit (runs independently, not in else-if)
            if (!truncated && interimLen > this.progressiveCommitThreshold) {
                this.checkProgressiveCommit(interim, now);
            }

            this.lastInterim = interim;
        }

        // FINAL RESULTS - Confirmed by API
        if (hasFinal) {
            this.finalCount++;
            const finalTrimmed = final.trim();
            this.log(`[FINAL #${this.finalCount}] "${finalTrimmed.slice(0, 70)}${finalTrimmed.length > 70 ? '...' : ''}" (${finalTrimmed.length} chars)`, 'final');

            // Check if we're in post-capture skip window
            const timeSinceCapture = now - this.lastCaptureTime;
            if (timeSinceCapture < this.captureSkipWindow) {
                this.log(`[SKIP] In capture skip window (${(timeSinceCapture/1000).toFixed(1)}s ago) - likely variant of captured text`, 'skip');
                this.lastInterim = '';
                this.lastCapturedLength = 0;
                this.render(interim);
                return;
            }

            // ORPHAN CHECK - Short finals that don't match recent interim are often API glitches
            if (finalTrimmed.length < 15 && this.lastInterim.length > 20) {
                const finalLower = finalTrimmed.toLowerCase();
                const interimLower = this.lastInterim.toLowerCase();
                if (!interimLower.includes(finalLower.slice(0, 8))) {
                    this.log(`[SKIP] Orphan FINAL "${finalTrimmed}" doesn't match interim - likely API glitch`, 'skip');
                    this.lastInterim = '';
                    this.lastCapturedLength = 0;
                    this.render(interim);
                    return;
                }
            }

            // DUPLICATE CHECK - Simplified and faster
            const isDuplicate = this.isDuplicateText(finalTrimmed);

            if (isDuplicate) {
                this.log(`[SKIP] Duplicate detected, not adding`, 'skip');
            } else {
                this.log(`[ADD] Adding FINAL to transcript`, 'capture');
                this.addToTranscript(finalTrimmed, 'final');
            }

            this.lastInterim = '';
            this.lastCapturedLength = 0;
        }

        // RENDER - Debounced for performance
        this.pendingInterim = interim;
        this.scheduleRender();
    }

    scheduleRender() {
        if (this.renderPending) return; // Already scheduled

        this.renderPending = true;
        setTimeout(() => {
            this.renderPending = false;
            this.render(this.pendingInterim);
        }, this.renderDebounceMs);
    }

    startWatchdog() {
        this.stopWatchdog();
        this.watchdogTimer = setTimeout(() => {
            if (this.listening && !this.hasReceivedResults) {
                this.log('[WATCHDOG] No results received in 8s - API may be stuck!', 'warning');
                this.setStatus('No audio detected...', 'error');
                this.showToast('No audio detected - check microphone', true);

                // Try to restart recognition - onend handler will auto-restart
                // Don't use setTimeout here to avoid race condition with onend
                this.log('[WATCHDOG] Triggering recognition restart...', 'warning');
                try {
                    this.recognition.stop();
                    // onend will handle the restart automatically
                } catch (e) {
                    this.log('[WATCHDOG] Stop failed: ' + e.message, 'warning');
                }
            }
        }, this.watchdogInterval);
    }

    resetWatchdog() {
        this.stopWatchdog();
        // Set up next watchdog check (for ongoing monitoring)
        if (this.listening) {
            this.watchdogTimer = setTimeout(() => {
                if (this.listening && this.hasReceivedResults) {
                    const timeSinceResult = performance.now() - this.lastResultTime;
                    if (timeSinceResult > 15000) {
                        this.log(`[WATCHDOG] No results for ${(timeSinceResult/1000).toFixed(1)}s - possible API disconnect`, 'warning');
                        this.setStatus('Reconnecting...', 'listening');
                    }
                }
            }, 15000);
        }
    }

    stopWatchdog() {
        if (this.watchdogTimer) {
            clearTimeout(this.watchdogTimer);
            this.watchdogTimer = null;
        }
    }

    // PROGRESSIVE COMMIT - Time-based commit for faster green→white sync
    checkProgressiveCommit(interim, now) {
        const timeSinceLastCommit = now - this.lastCommitTime;

        // Commit if: enough time has passed since last commit
        if (timeSinceLastCommit > this.progressiveCommitInterval) {
            // Get only NEW text (after what we've already captured)
            const startPos = this.lastCapturedLength || 0;
            const newText = interim.substring(startPos);

            // Only proceed if new text is long enough
            if (newText.length > this.progressiveCommitThreshold) {
                // Find a good word boundary to commit (first 60% of NEW text)
                const commitLen = this.findWordBoundary(newText, Math.floor(newText.length * 0.6));

                if (commitLen > 40) {
                    const toCommit = newText.substring(0, commitLen).trim();

                    // Check it's not a duplicate
                    if (!this.isDuplicateText(toCommit)) {
                        this.log(`[PROGRESSIVE] Committing: "${toCommit.slice(0, 40)}..." (${toCommit.length} chars, pos ${startPos}→${startPos + commitLen}, ${(timeSinceLastCommit/1000).toFixed(1)}s since last)`, 'capture');
                        this.addToTranscript(toCommit, 'progressive');

                        // Update tracking - absolute position in interim
                        this.lastCapturedLength = startPos + commitLen;
                        this.lastCaptureTime = now;
                        this.lastCommitTime = now;
                    } else {
                        // Even if duplicate, update commit time to prevent repeated checks
                        this.lastCommitTime = now;
                    }
                }
            }
        }
    }

    findWordBoundary(text, targetPos) {
        // Find a space near the target position (prefer before)
        let pos = targetPos;
        while (pos > targetPos - 20 && pos > 0) {
            if (text[pos] === ' ') return pos;
            pos--;
        }
        // If no space found before, look after
        pos = targetPos;
        while (pos < targetPos + 20 && pos < text.length) {
            if (text[pos] === ' ') return pos;
            pos++;
        }
        return targetPos;
    }

    resetProgressiveCommit() {
        this.lastCommitTime = performance.now();
    }

    isDuplicateText(text) {
        if (!text || text.length < 10) return false;
        if (!this.fullTranscript) return false;

        const textLower = text.toLowerCase();
        const transcriptLower = this.fullTranscript.toLowerCase();

        // Quick check: exact match of last N characters
        const lastChunk = transcriptLower.slice(-Math.min(50, textLower.length));
        if (textLower.includes(lastChunk) && lastChunk.length > 15) {
            this.log(`[DUP] Matches end of transcript`, 'skip');
            return true;
        }

        // Check if significant portion exists in transcript
        const checkLen = Math.min(30, Math.floor(textLower.length * 0.6));
        const startChunk = textLower.slice(0, checkLen);
        const midPoint = Math.floor(textLower.length / 2);
        const midChunk = textLower.slice(midPoint, midPoint + checkLen);

        if (transcriptLower.includes(startChunk) || transcriptLower.includes(midChunk)) {
            this.log(`[DUP] Chunk found in transcript`, 'skip');
            return true;
        }

        // Word-level overlap check (catches API re-interpretations)
        const textWords = textLower.split(/\s+/).filter(w => w.length > 3);
        const lastWords = transcriptLower.slice(-300).split(/\s+/).filter(w => w.length > 3);

        if (textWords.length > 5 && lastWords.length > 5) {
            let matchCount = 0;
            for (const word of textWords) {
                if (lastWords.includes(word)) matchCount++;
            }
            const overlapPercent = matchCount / textWords.length;
            if (overlapPercent > 0.5) {
                this.log(`[DUP] Word overlap ${(overlapPercent * 100).toFixed(0)}% with recent text`, 'skip');
                return true;
            }
        }

        return false;
    }

    captureInterim(reason) {
        if (!this.lastInterim || this.lastInterim.length <= this.lastCapturedLength) {
            this.log(`[CAPTURE] Nothing to capture (lastInterim empty or already captured)`, 'info');
            return;
        }

        const remaining = this.lastInterim.substring(this.lastCapturedLength).trim();

        if (remaining.length < 8) {
            this.log(`[CAPTURE] Text too short to capture: "${remaining}"`, 'info');
            return;
        }

        // Check duplicate
        if (this.isDuplicateText(remaining)) {
            this.log(`[CAPTURE] Skipping duplicate`, 'skip');
            this.lastInterim = '';
            this.lastCapturedLength = 0;
            return;
        }

        this.captureCount++;
        this.log(`[CAPTURE #${this.captureCount}] Saving: "${remaining.slice(0, 50)}..." (${remaining.length} chars, reason: ${reason})`, 'capture');
        this.addToTranscript(remaining, 'capture');

        // Set capture time to skip variant FINALs
        this.lastCaptureTime = performance.now();
        this.log(`[CAPTURE] Skip window active for ${this.captureSkipWindow/1000}s`, 'info');

        this.lastInterim = '';
        this.lastCapturedLength = 0;
    }

    addToTranscript(text, source) {
        text = text.trim();
        if (!text) return;

        this.saveUndoState();

        const now = Date.now();
        const timeSinceStart = this.startTime ? (now - this.startTime) / 1000 : 0;

        // Auto paragraph (5+ second pause)
        const needsParagraph = this.settings.autoParagraph &&
            this.lastSegmentTime &&
            (now - this.lastSegmentTime > 5000) &&
            this.fullTranscript.length > 0;

        if (needsParagraph) {
            this.log(`[PARA] Adding paragraph break (${((now - this.lastSegmentTime) / 1000).toFixed(1)}s pause)`, 'info');
            this.fullTranscript += '\n\n';
        } else if (this.fullTranscript && !this.fullTranscript.endsWith(' ') && !this.fullTranscript.endsWith('\n')) {
            this.fullTranscript += ' ';
        }

        // Light punctuation
        text = this.punctuate(text);

        // Store segment
        this.segments.push({
            text: text,
            start: timeSinceStart,
            end: timeSinceStart + (text.split(' ').length * 0.3),
            source: source
        });

        this.fullTranscript += text;
        this.lastSegmentTime = now;

        this.log(`[TRANSCRIPT] Total: ${this.fullTranscript.length} chars, ${this.segments.length} segments`, 'perf');
        this.updateStats();
        this.autoSaveToStorage();
    }

    punctuate(text) {
        let t = text.trim();
        if (!t) return t;

        // Remove filler words if enabled
        if (this.removeFillers) {
            const before = t;
            t = t.replace(this.fillerWords, '').replace(/\s+/g, ' ').trim();
            if (t !== before) {
                const removed = before.length - t.length;
                this.log(`[FILLER] Removed ${removed} chars of fillers`, 'info');
            }
        }

        // Capitalize first letter of transcript
        if (!this.fullTranscript) {
            t = t.charAt(0).toUpperCase() + t.slice(1);
        }

        // Capitalize I (important for readability)
        t = t.replace(/\bi\b/g, 'I');

        return t;
    }

    render(interim) {
        const renderStart = performance.now();

        if (!this.fullTranscript && !interim) {
            if (this.listening && !this.hasReceivedResults) {
                this.els.transcript.innerHTML = '<span class="placeholder">Warming up... speak now (first result takes 5-10 seconds)</span>';
            } else if (this.listening) {
                this.els.transcript.innerHTML = '<span class="placeholder">Listening... speak now</span>';
            } else {
                this.els.transcript.innerHTML = '<span class="placeholder">Click Start to begin transcribing...</span>';
            }
            return;
        }

        let html = '';

        // LIVE MODE: Show everything as live/green text (no white/green distinction)
        if (this.settings.liveMode) {
            const fullText = this.fullTranscript + (interim ? ' ' + interim.trim() : '');
            if (fullText) {
                let escapedText = this.esc(fullText);
                escapedText = escapedText.replace(/\n\n/g, '</p><p class="paragraph-break">');
                html = `<span class="live-mode"><p>${escapedText}</p></span>`;
                html = html.replace(/<p><\/p>/g, '');
            }
        } else {
            // NORMAL MODE: Confirmed (white) + Live (green)
            // Confirmed text
            if (this.fullTranscript) {
                let escapedText = this.esc(this.fullTranscript);
                escapedText = escapedText.replace(/\n\n/g, '</p><p class="paragraph-break">');
                html = `<span class="confirmed"><p>${escapedText}</p></span>`;
                html = html.replace(/<p><\/p>/g, '');
            }

            // Live interim text - show ALL of it for real-time feel
            if (interim) {
                const displayInterim = interim.trim();
                if (displayInterim) {
                    html += `<span class="live"> ${this.esc(displayInterim)}</span>`;
                }
            }
        }

        // Apply search highlighting
        if (this.searchMatches.length > 0 && this.els.searchInput.value) {
            html = this.highlightSearch(html);
        }

        this.els.transcript.innerHTML = html;

        // Smart auto-scroll: only scroll if user hasn't scrolled up to read earlier text
        if (!this.userScrolledUp) {
            this.els.transcriptContainer.scrollTop = this.els.transcriptContainer.scrollHeight;
            this.lastAutoScrollTime = performance.now();
        }

        const renderTime = performance.now() - renderStart;
        if (renderTime > 10) {
            this.log(`[PERF] Render took ${renderTime.toFixed(1)}ms (slow!)`, 'warning');
        }
    }

    esc(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    // Search functionality
    search() {
        const query = this.els.searchInput.value.toLowerCase().trim();
        this.searchMatches = [];
        this.currentMatchIndex = -1;

        if (!query || !this.fullTranscript) {
            this.els.searchResults.textContent = '';
            this.els.searchPrev.disabled = true;
            this.els.searchNext.disabled = true;
            this.render('');
            return;
        }

        const text = this.fullTranscript.toLowerCase();
        let pos = 0;
        while ((pos = text.indexOf(query, pos)) !== -1) {
            this.searchMatches.push(pos);
            pos += 1;
        }

        if (this.searchMatches.length > 0) {
            this.currentMatchIndex = 0;
            this.els.searchResults.textContent = `1/${this.searchMatches.length}`;
            this.els.searchPrev.disabled = false;
            this.els.searchNext.disabled = false;
        } else {
            this.els.searchResults.textContent = '0 results';
            this.els.searchPrev.disabled = true;
            this.els.searchNext.disabled = true;
        }
        this.render('');
    }

    navigateSearch(direction) {
        if (this.searchMatches.length === 0) return;
        this.currentMatchIndex += direction;
        if (this.currentMatchIndex < 0) this.currentMatchIndex = this.searchMatches.length - 1;
        if (this.currentMatchIndex >= this.searchMatches.length) this.currentMatchIndex = 0;
        this.els.searchResults.textContent = `${this.currentMatchIndex + 1}/${this.searchMatches.length}`;
        this.render('');
    }

    highlightSearch(html) {
        const query = this.els.searchInput.value;
        if (!query) return html;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        let matchIndex = 0;
        return html.replace(regex, (match) => {
            const isCurrent = matchIndex === this.currentMatchIndex;
            matchIndex++;
            return `<span class="search-highlight${isCurrent ? ' current' : ''}">${match}</span>`;
        });
    }

    clearSearch() {
        this.els.searchInput.value = '';
        this.searchMatches = [];
        this.currentMatchIndex = -1;
        this.els.searchResults.textContent = '';
        this.els.searchPrev.disabled = true;
        this.els.searchNext.disabled = true;
        this.render('');
    }

    // Edit mode
    toggleEditMode() {
        this.editMode = !this.editMode;
        this.els.transcript.contentEditable = this.editMode;
        this.els.transcript.classList.toggle('editable', this.editMode);
        if (this.editMode) {
            this.showToast('Edit mode ON');
            this.els.transcript.focus();
        } else {
            this.showToast('Edit mode OFF');
            this.fullTranscript = this.els.transcript.innerText;
            this.autoSaveToStorage();
        }
    }

    // Undo
    saveUndoState() {
        this.undoStack.push(this.fullTranscript);
        if (this.undoStack.length > this.maxUndoStack) this.undoStack.shift();
        this.els.undo.disabled = false;
    }

    undo() {
        if (this.undoStack.length === 0) return;
        this.fullTranscript = this.undoStack.pop();
        this.render('');
        this.updateStats();
        this.autoSaveToStorage();
        this.showToast('Undo');
        this.els.undo.disabled = this.undoStack.length === 0;
    }

    // Settings
    loadSettings() {
        try {
            const saved = localStorage.getItem('transcriber_settings');
            if (saved) this.settings = { ...this.settings, ...JSON.parse(saved) };
        } catch (e) {}
    }

    saveSettings() {
        try {
            localStorage.setItem('transcriber_settings', JSON.stringify(this.settings));
        } catch (e) {}
    }

    applySettings() {
        document.documentElement.setAttribute('data-theme', this.settings.theme);
        this.els.themeToggle.querySelector('.theme-icon').innerHTML = this.settings.theme === 'dark' ? '&#9790;' : '&#9728;';
        this.els.transcript.style.fontSize = this.settings.fontSize + 'px';
        this.els.fontSizeDisplay.textContent = this.settings.fontSize + 'px';
        this.els.autoParagraph.checked = this.settings.autoParagraph;
        this.els.liveModeToggle.checked = this.settings.liveMode;
        this.els.showTimestamps.checked = this.settings.showTimestamps;
        this.els.autoSave.checked = this.settings.autoSave;
        this.els.removeFillers.checked = this.settings.removeFillers;
        this.els.noiseReductionToggle.checked = this.settings.noiseReduction;
        this.els.debugModeToggle.checked = this.settings.debugMode;
        this.els.language.value = this.settings.language;

        // Apply to instance variables
        this.removeFillers = this.settings.removeFillers;
        this.noiseReduction = this.settings.noiseReduction;
        this.debugMode = this.settings.debugMode;

        // Update Live Mode dependent states
        this.updateLiveModeState();
    }

    toggleTheme() {
        this.settings.theme = this.settings.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', this.settings.theme);
        this.els.themeToggle.querySelector('.theme-icon').innerHTML = this.settings.theme === 'dark' ? '&#9790;' : '&#9728;';
        this.saveSettings();
        this.log(`[SETTINGS] Theme: ${this.settings.theme}`, 'event');
    }

    openSettings() {
        this.els.settingsPanel.classList.remove('hidden');
        this.els.settingsOverlay.classList.remove('hidden');
    }

    closeSettings() {
        this.els.settingsPanel.classList.add('hidden');
        this.els.settingsOverlay.classList.add('hidden');
    }

    updateLiveModeState() {
        const isLiveMode = this.settings.liveMode;

        // Disable Show Timestamps when Live Mode is ON (timestamps don't work in Live Mode)
        if (this.els.timestampsGroup) {
            this.els.timestampsGroup.classList.toggle('disabled', isLiveMode);
            this.els.showTimestamps.disabled = isLiveMode;

            if (isLiveMode) {
                this.els.timestampsHint.textContent = '(disabled in Live Mode)';
            } else {
                this.els.timestampsHint.textContent = '';
            }
        }
    }

    changeFontSize(delta) {
        this.settings.fontSize = Math.max(12, Math.min(32, this.settings.fontSize + delta));
        this.els.transcript.style.fontSize = this.settings.fontSize + 'px';
        this.els.fontSizeDisplay.textContent = this.settings.fontSize + 'px';
        this.saveSettings();
        this.log(`[SETTINGS] Font Size: ${this.settings.fontSize}px`, 'event');
    }

    // Stats
    updateStats() {
        const words = this.fullTranscript.trim().split(/\s+/).filter(w => w.length > 0);
        this.wordCount = words.length;
        this.els.wordCount.textContent = `${this.wordCount} words`;

        // Update context actions visibility based on transcript content
        this.updateContextActions();
    }

    checkSilence() {
        if (!this.listening || !this.lastSpeechTime) return;

        const silenceDuration = performance.now() - this.lastSpeechTime;
        if (silenceDuration > this.silenceThreshold && !this.silenceWarningShown) {
            this.silenceWarningShown = true;
            this.setStatus('No speech detected...', 'listening');
            this.log(`[SILENCE] No speech for ${(silenceDuration/1000).toFixed(1)}s`, 'warning');
        }
    }

    // Storage
    autoSaveToStorage() {
        if (!this.settings.autoSave) return;
        try {
            localStorage.setItem('transcriber_transcript', this.fullTranscript);
            localStorage.setItem('transcriber_segments', JSON.stringify(this.segments));
        } catch (e) {}
    }

    loadFromStorage() {
        if (!this.settings.autoSave) return;
        try {
            const saved = localStorage.getItem('transcriber_transcript');
            const segments = localStorage.getItem('transcriber_segments');
            if (saved) {
                this.fullTranscript = saved;
                this.segments = segments ? JSON.parse(segments) : [];
                this.render('');
                this.updateStats();
                this.log('[STORAGE] Loaded previous transcript', 'info');
            }
        } catch (e) {}
    }

    // Status & Time
    setStatus(text, cls) {
        // Status is now visual via mic button state
        this.log(`[STATUS] ${text}`, 'info');
    }

    getTime() {
        if (!this.startTime) return '00:00';
        const s = Math.floor((Date.now() - this.startTime) / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) {
            return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':');
        }
        return [m, sec].map(n => String(n).padStart(2, '0')).join(':');
    }

    // Recording
    async toggleRecording() {
        if (this.isRecording) this.stopRecording();
        else await this.startRecording();
    }

    async startRecording() {
        try {
            this.recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(this.recordingStream);
            this.audioChunks = [];
            this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data); };
            this.mediaRecorder.onstop = () => {
                this.audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.els.saveAudio.disabled = false;
                this.recordingStream?.getTracks().forEach(t => t.stop());
            };
            this.mediaRecorder.start(1000);
            this.isRecording = true;
            this.els.record.innerHTML = '<span class="btn-icon">&#9632;</span><span>Stop Rec</span>';
            this.els.record.classList.add('recording');
            this.els.recordingIndicator.style.display = 'flex';
            this.showToast('Recording started');
            return true;
        } catch (e) {
            this.showToast('Recording failed', true);
            return false;
        }
    }

    stopRecording() {
        if (this.mediaRecorder?.state !== 'inactive') this.mediaRecorder.stop();
        this.isRecording = false;
        this.els.record.innerHTML = '<span class="btn-icon">&#9679;</span><span>Record</span>';
        this.els.record.classList.remove('recording');
        this.els.recordingIndicator.style.display = 'none';
        this.showToast('Recording stopped');
    }

    // Main controls
    async start() {
        if (!this.recognition) return;
        this.recognition.lang = this.settings.language;
        this.listening = true;
        this.lastInterim = '';
        this.lastCapturedLength = 0;
        this.sessionStartTime = Date.now();
        this.lastSpeechTime = performance.now();
        this.silenceWarningShown = false;

        // Reset progressive commit timing
        this.lastCommitTime = performance.now();

        // Reset scroll state
        this.userScrolledUp = false;

        // Update connection state
        this.updateConnectionState('connecting');

        // Initialize audio processing (level meter + noise reduction)
        await this.initAudioProcessing();

        try {
            this.recognition.start();
            this.startTime = Date.now();
            this.lastSegmentTime = Date.now();
            this.timer = setInterval(() => {
                this.els.duration.textContent = this.getTime();
                this.updateStats();
                this.checkSilence();
            }, 1000);

            // Start aggressive auto-save
            this.startAutoSaveInterval();

            this.log('[START] Transcription started', 'event');
        } catch (e) {
            this.setStatus('Failed to start', 'error');
            this.updateConnectionState('error');
        }
    }

    stop() {
        this.log('[STOP] Stopping transcription...', 'event');
        this.listening = false;
        this.stopWatchdog();
        this.resetProgressiveCommit();

        // Reset scroll state
        this.userScrolledUp = false;

        // Update connection state
        this.updateConnectionState('disconnected');

        // Stop audio processing
        this.stopAudioLevelMeter();

        // Stop auto-save interval
        this.stopAutoSaveInterval();

        if (this.lastInterim) {
            this.log('[STOP] Capturing final interim', 'capture');
            this.captureInterim('manual-stop');
        }
        this.recognition?.stop();
        if (this.isRecording) this.stopRecording();
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        this.render('');

        // Final save
        this.autoSaveToStorage();
        this.saveToIndexedDB();
    }

    confirmClear() {
        if (this.fullTranscript && !confirm('Clear all transcript?')) return;
        this.clear();
    }

    clear() {
        this.fullTranscript = '';
        this.segments = [];
        this.lastInterim = '';
        this.lastCapturedLength = 0;
        this.startTime = null;
        this.lastSegmentTime = null;
        this.audioChunks = [];
        this.audioBlob = null;
        this.undoStack = [];
        this.searchMatches = [];
        this.currentMatchIndex = -1;
        this.wordCount = 0;
        this.els.duration.textContent = '00:00';
        this.els.wordCount.textContent = '0 words';
        this.els.saveAudio.disabled = true;
        this.els.undo.disabled = true;
        this.els.contextActions.classList.add('hidden');
        this.clearSearch();
        this.render('');
        localStorage.removeItem('transcriber_transcript');
        localStorage.removeItem('transcriber_segments');

        // Clear IndexedDB
        if (this.db) {
            try {
                const transaction = this.db.transaction(['transcripts'], 'readwrite');
                const store = transaction.objectStore('transcripts');
                store.delete('current');
            } catch (e) {}
        }
        this.lastSavedTranscript = '';

        this.showToast('Cleared');
        this.log('[CLEAR] Transcript cleared', 'event');
    }

    copyToClipboard() {
        if (!this.fullTranscript) { this.showToast('Nothing to copy', true); return; }
        navigator.clipboard.writeText(this.fullTranscript).then(() => this.showToast('Copied'));
    }

    saveAudio() {
        if (!this.audioBlob) { this.showToast('No recording', true); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(this.audioBlob);
        a.download = `recording_${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(a.href);
        this.showToast('Audio saved');
    }

    showToast(msg, isError = false) {
        this.els.toast.textContent = msg;
        this.els.toast.className = 'toast show' + (isError ? ' error' : '');
        setTimeout(() => { this.els.toast.className = 'toast hidden'; }, 2000);
    }

    // Export
    exportAs(format) {
        this.els.exportMenu.classList.add('hidden');
        if (!this.fullTranscript) { this.showToast('Nothing to export', true); return; }

        const date = new Date().toISOString().slice(0, 10);
        let content, filename, type;

        switch (format) {
            case 'txt':
                let text = this.fullTranscript.trim();
                if (text && !'.!?'.includes(text.slice(-1))) text += '.';
                content = `TRANSCRIPT\n${new Date().toLocaleString()}\nDuration: ${this.els.duration.textContent}\nWords: ${this.wordCount}\n\n${text}`;
                filename = `transcript_${date}.txt`;
                type = 'text/plain';
                break;
            case 'srt':
                content = this.segments.map((seg, i) => {
                    const start = this.formatSrtTime(seg.start);
                    const end = this.formatSrtTime(seg.end);
                    return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`;
                }).join('\n') || '1\n00:00:00,000 --> 00:00:05,000\n' + this.fullTranscript.slice(0, 100);
                filename = `transcript_${date}.srt`;
                type = 'text/plain';
                break;
            case 'json':
                content = JSON.stringify({
                    transcript: this.fullTranscript,
                    segments: this.segments,
                    metadata: { date: new Date().toISOString(), duration: this.els.duration.textContent, wordCount: this.wordCount, language: this.settings.language }
                }, null, 2);
                filename = `transcript_${date}.json`;
                type = 'application/json';
                break;
        }

        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([content], { type }));
        a.download = filename;
        a.click();
        this.showToast(`Exported ${format.toUpperCase()}`);
    }

    formatSrtTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    }

    // ==================== AUDIO PROCESSING ====================

    async initAudioProcessing() {
        try {
            this.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: this.noiseReduction,
                    autoGainControl: true
                }
            });

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.audioStream);

            // Create analyser for level meter
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.5;

            // Noise reduction chain (if enabled)
            if (this.noiseReduction) {
                // High-pass filter (removes low rumble)
                this.highpassFilter = this.audioContext.createBiquadFilter();
                this.highpassFilter.type = 'highpass';
                this.highpassFilter.frequency.value = 85;

                // Low-pass filter (removes high hiss)
                this.lowpassFilter = this.audioContext.createBiquadFilter();
                this.lowpassFilter.type = 'lowpass';
                this.lowpassFilter.frequency.value = 8000;

                // Compressor (evens out volume)
                this.compressor = this.audioContext.createDynamicsCompressor();
                this.compressor.threshold.value = -50;
                this.compressor.knee.value = 40;
                this.compressor.ratio.value = 4;
                this.compressor.attack.value = 0;
                this.compressor.release.value = 0.25;

                // Connect: source -> highpass -> lowpass -> compressor -> analyser
                source.connect(this.highpassFilter);
                this.highpassFilter.connect(this.lowpassFilter);
                this.lowpassFilter.connect(this.compressor);
                this.compressor.connect(this.analyser);

                this.log('[AUDIO] Noise reduction filters applied', 'event');
            } else {
                source.connect(this.analyser);
            }

            this.startAudioLevelMeter();
            this.log('[AUDIO] Audio processing initialized', 'event');
            return true;
        } catch (e) {
            this.log('[AUDIO] Failed to init audio processing: ' + e.message, 'warning');
            return false;
        }
    }

    startAudioLevelMeter() {
        if (!this.analyser) return;

        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

        this.audioLevelInterval = setInterval(() => {
            if (!this.analyser) return;

            this.analyser.getByteFrequencyData(dataArray);

            // Calculate average level
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const level = Math.min(100, (average / 128) * 100);

            // Update mic level meter
            if (this.els.micLevelFill) {
                this.els.micLevelFill.style.width = level + '%';
            }
        }, 100);
    }

    stopAudioLevelMeter() {
        if (this.audioLevelInterval) {
            clearInterval(this.audioLevelInterval);
            this.audioLevelInterval = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
        }
        this.analyser = null;
    }

    // ==================== UI STATE ====================

    updateMicState(isListening) {
        if (isListening) {
            this.els.micBtn.classList.add('recording');
            this.els.contextActions.classList.remove('hidden');
            this.updateConnectionState('connecting');
        } else {
            this.els.micBtn.classList.remove('recording');
            this.updateConnectionState('disconnected');
            // Reset mic level
            if (this.els.micLevelFill) {
                this.els.micLevelFill.style.width = '0%';
            }
        }
    }

    updateContextActions() {
        // Show context actions if we have any transcript
        if (this.fullTranscript.length > 0 || this.listening) {
            this.els.contextActions.classList.remove('hidden');
        } else {
            this.els.contextActions.classList.add('hidden');
        }
    }

    updateConnectionState(state) {
        this.connectionState = state;
        if (this.els.connectionIndicator) {
            this.els.connectionIndicator.className = 'connection-indicator ' + state;
            const titles = {
                disconnected: 'Disconnected',
                connecting: 'Connecting to speech API...',
                connected: 'Connected - Listening',
                error: 'Connection error'
            };
            this.els.connectionIndicator.title = titles[state] || state;
        }
        this.log(`[CONNECTION] State: ${state}`, 'event');
    }

    // ==================== INDEXEDDB CRASH RECOVERY ====================

    initIndexedDB() {
        const request = indexedDB.open('LiveTranscriberDB', 1);

        request.onerror = () => {
            this.log('[DB] IndexedDB not available', 'warning');
        };

        request.onsuccess = (event) => {
            this.db = event.target.result;
            this.log('[DB] IndexedDB ready', 'info');
            this.loadFromIndexedDB();
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('transcripts')) {
                db.createObjectStore('transcripts', { keyPath: 'id' });
            }
        };
    }

    saveToIndexedDB() {
        if (!this.db || !this.fullTranscript) return;
        if (this.fullTranscript === this.lastSavedTranscript) return;

        try {
            const transaction = this.db.transaction(['transcripts'], 'readwrite');
            const store = transaction.objectStore('transcripts');
            store.put({
                id: 'current',
                transcript: this.fullTranscript,
                segments: this.segments,
                timestamp: Date.now()
            });
            this.lastSavedTranscript = this.fullTranscript;
        } catch (e) {
            // Silent fail - localStorage is backup
        }
    }

    loadFromIndexedDB() {
        if (!this.db) return;

        try {
            const transaction = this.db.transaction(['transcripts'], 'readonly');
            const store = transaction.objectStore('transcripts');
            const request = store.get('current');

            request.onsuccess = () => {
                const data = request.result;
                if (data && data.transcript && !this.fullTranscript) {
                    // Check if it's recent (less than 24 hours)
                    const age = Date.now() - data.timestamp;
                    if (age < 24 * 60 * 60 * 1000) {
                        this.fullTranscript = data.transcript;
                        this.segments = data.segments || [];
                        this.render('');
                        this.updateStats();
                        this.log(`[DB] Recovered transcript from ${Math.round(age / 60000)} minutes ago`, 'event');
                        this.showToast('Previous session recovered');
                    }
                }
            };
        } catch (e) {
            // Silent fail
        }
    }

    startAutoSaveInterval() {
        this.stopAutoSaveInterval();
        this.autoSaveInterval = setInterval(() => {
            this.saveToIndexedDB();
            this.autoSaveToStorage();
        }, 2000);
    }

    stopAutoSaveInterval() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }

    // ==================== FILE UPLOAD & WHISPER ====================

    openUploadModal() {
        this.els.uploadModal.classList.remove('hidden');
        this.checkWhisperServer();
    }

    closeUploadModal() {
        this.els.uploadModal.classList.add('hidden');
        // Only clear file if not transcribing
        if (!this.isTranscribing) {
            this.clearUploadFile();
            this.els.uploadProgress.classList.add('hidden');
        }
    }

    async checkWhisperServer() {
        this.els.serverStatus.className = 'server-status checking';
        this.els.serverStatus.innerHTML = '<span class="server-dot"></span><span>Checking server...</span>';

        try {
            const response = await fetch(`${this.whisperServerUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });

            if (response.ok) {
                const data = await response.json();
                this.els.serverStatus.className = 'server-status connected';
                this.els.serverStatus.innerHTML = `<span class="server-dot"></span><span>Server: Connected (${data.model} model)</span>`;
                this.updateTranscribeButton();
                this.log('[UPLOAD] Whisper server connected', 'event');
                return true;
            }
        } catch (e) {
            // Server not available
        }

        this.els.serverStatus.className = 'server-status disconnected';
        this.els.serverStatus.innerHTML = '<span class="server-dot"></span><span>Server: Not running</span>';
        this.els.transcribeBtn.disabled = true;
        this.log('[UPLOAD] Whisper server not available', 'warning');
        return false;
    }

    handleFileSelect(file) {
        if (!file) return;

        // Validate file type
        const validTypes = ['audio/', 'video/webm'];
        const isValid = validTypes.some(type => file.type.startsWith(type)) ||
                       file.name.match(/\.(mp3|wav|m4a|webm|ogg|flac|aac|wma)$/i);

        if (!isValid) {
            this.showToast('Please select an audio file', true);
            return;
        }

        this.uploadedFile = file;

        // Update UI
        this.els.uploadZone.classList.add('hidden');
        this.els.uploadFileInfo.classList.remove('hidden');
        this.els.uploadFileName.textContent = file.name;
        this.els.uploadFileSize.textContent = this.formatFileSize(file.size);

        this.log(`[UPLOAD] File selected: ${file.name} (${this.formatFileSize(file.size)})`, 'event');
        this.updateTranscribeButton();
    }

    clearUploadFile() {
        this.uploadedFile = null;
        this.els.audioFileInput.value = '';
        this.els.uploadZone.classList.remove('hidden');
        this.els.uploadFileInfo.classList.add('hidden');
        this.els.uploadProgress.classList.add('hidden');
        this.updateTranscribeButton();
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    updateTranscribeButton() {
        const serverOk = this.els.serverStatus.classList.contains('connected');
        const hasFile = this.uploadedFile !== null;
        const notBusy = !this.isTranscribing;
        this.els.transcribeBtn.disabled = !(serverOk && hasFile && notBusy);
    }

    async transcribeUploadedFile(runInBackground = false) {
        if (!this.uploadedFile || this.isTranscribing) return;

        const file = this.uploadedFile;
        const language = this.els.uploadLanguage.value;

        this.log(`[UPLOAD] Starting transcription: ${file.name}, language: ${language}, background: ${runInBackground}`, 'event');

        this.isTranscribing = true;

        // Estimate time: ~30 seconds per MB (rough estimate)
        const fileSizeMB = file.size / (1024 * 1024);
        const estimatedSeconds = Math.ceil(fileSizeMB * 30);
        const estimatedTime = estimatedSeconds > 60
            ? `~${Math.ceil(estimatedSeconds / 60)} minutes`
            : `~${estimatedSeconds} seconds`;

        // Show progress
        this.els.uploadProgress.classList.remove('hidden');
        this.els.progressFill.style.width = '0%';
        this.els.progressFill.classList.add('indeterminate');
        this.els.uploadStatus.textContent = 'Uploading to Whisper server...';
        this.els.uploadEstimate.textContent = `Estimated time: ${estimatedTime}`;
        this.els.transcribeBtn.disabled = true;
        this.els.transcribeBackground.classList.remove('hidden');

        // If running in background, show badge
        if (runInBackground) {
            this.showTranscriptionBadge('Transcribing...');
        }

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('language', language);

            const startTime = performance.now();

            this.els.uploadStatus.textContent = 'Transcribing audio... (this may take a few minutes)';

            const response = await fetch(`${this.whisperServerUrl}/transcribe`, {
                method: 'POST',
                body: formData
            });

            const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Transcription failed');
            }

            const result = await response.json();

            this.els.progressFill.classList.remove('indeterminate');
            this.els.progressFill.style.width = '100%';
            this.els.uploadStatus.textContent = `Completed in ${elapsed}s`;

            this.log(`[UPLOAD] Transcription complete: ${result.text.length} chars, ${elapsed}s`, 'event');

            // Add to transcript
            if (result.text) {
                this.saveUndoState();

                // Add file header
                const header = `[Transcribed from: ${file.name}]\n\n`;
                if (this.fullTranscript) {
                    this.fullTranscript += '\n\n' + header + result.text;
                } else {
                    this.fullTranscript = header + result.text;
                }

                // Store segments
                if (result.segments) {
                    for (const seg of result.segments) {
                        this.segments.push({
                            text: seg.text,
                            start: seg.start,
                            end: seg.end,
                            source: 'whisper-upload'
                        });
                    }
                }

                this.render('');
                this.updateStats();
                this.autoSaveToStorage();

                const wordCount = result.text.split(' ').length;
                this.showToast(`Transcribed: ${wordCount} words`);

                // Update badge if running in background
                if (runInBackground) {
                    this.showTranscriptionBadge(`Done! ${wordCount} words`, true);
                    setTimeout(() => this.hideTranscriptionBadge(), 5000);
                } else {
                    // Close modal after short delay
                    setTimeout(() => {
                        this.closeUploadModal();
                    }, 1500);
                }
            }

        } catch (error) {
            this.log(`[UPLOAD] Error: ${error.message}`, 'warning');
            this.els.progressFill.classList.remove('indeterminate');
            this.els.progressFill.style.width = '0%';
            this.els.uploadStatus.textContent = `Error: ${error.message}`;
            this.showToast('Transcription failed: ' + error.message, true);

            if (runInBackground) {
                this.showTranscriptionBadge('Failed!', true);
                setTimeout(() => this.hideTranscriptionBadge(), 3000);
            }
        }

        this.isTranscribing = false;
        this.els.transcribeBackground.classList.add('hidden');
        this.updateTranscribeButton();
    }

    showTranscriptionBadge(text, done = false) {
        this.hideTranscriptionBadge();
        const badge = document.createElement('div');
        badge.id = 'transcriptionBadge';
        badge.className = 'transcription-badge' + (done ? ' done' : '');
        badge.textContent = text;
        document.body.appendChild(badge);
    }

    hideTranscriptionBadge() {
        const badge = document.getElementById('transcriptionBadge');
        if (badge) badge.remove();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.transcriber = new LiveTranscriber();
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('[PWA] Service Worker registered'))
            .catch(err => console.log('[PWA] Service Worker registration failed:', err));
    });
}

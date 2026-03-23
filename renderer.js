// renderer.js - Electron Renderer Process
const { ipcRenderer } = require('electron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GeminiLiveScreenSession } = require('./liveSession.js');

let currentVideoFile = null;
let currentVideoBase64 = null;
let genAI = null;

let liveSession = null;
let liveUserBubble = null;
let liveModelBubble = null;

// Load API key on startup
window.addEventListener('DOMContentLoaded', async () => {
    const savedApiKey = await ipcRenderer.invoke('load-api-key');
    if (savedApiKey) {
        document.getElementById('apiKey').value = savedApiKey;
        initGemini(savedApiKey);
        updateStatus('✅ API key loaded from settings', 'success');
    }
});

// Initialize Gemini
function initGemini(apiKey) {
    try {
        genAI = new GoogleGenerativeAI(apiKey);
        return true;
    } catch (error) {
        console.error('Error initializing Gemini:', error);
        return false;
    }
}

// Save API key
async function saveApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();
    
    if (!apiKey) {
        updateStatus('❌ Enter a valid API key', 'error');
        return;
    }

    try {
        await ipcRenderer.invoke('save-api-key', apiKey);
        initGemini(apiKey);
        updateStatus('✅ API key saved successfully', 'success');
    } catch (error) {
        updateStatus('❌ Error saving API key: ' + error.message, 'error');
    }
}

// Select video file
async function selectVideoFile() {
    try {
        const filePath = await ipcRenderer.invoke('select-video-file');
        
        if (!filePath) {
            return;
        }

        updateStatus('⏳ Loading video file...', 'processing');

        const videoData = await ipcRenderer.invoke('read-video-file', filePath);
        
        currentVideoFile = filePath;
        currentVideoBase64 = videoData.base64;

        // Show file info
        document.getElementById('fileInfo').style.display = 'block';
        document.getElementById('fileName').textContent = videoData.name;
        document.getElementById('fileSize').textContent = formatFileSize(videoData.size);

        // Show preview
        const videoPreview = document.getElementById('videoPreview');
        videoPreview.src = filePath;
        videoPreview.style.display = 'block';

        // Enable analyze button
        document.getElementById('analyzeBtn').disabled = false;

        updateStatus('✅ Video file loaded successfully', 'success');

    } catch (error) {
        updateStatus('❌ Error loading file: ' + error.message, 'error');
    }
}

// YouTube URL
function useYouTubeUrl() {
    const url = prompt('Enter YouTube URL:');
    
    if (!url) return;

    // Simple URL check
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        updateStatus('❌ Invalid URL', 'error');
        return;
    }

    currentVideoFile = url;
    currentVideoBase64 = null; // use URL directly

    document.getElementById('fileInfo').style.display = 'block';
    document.getElementById('fileName').textContent = 'YouTube: ' + url;
    document.getElementById('fileSize').textContent = 'Streaming';
    
    document.getElementById('videoPreview').style.display = 'none';
    document.getElementById('analyzeBtn').disabled = false;

    updateStatus('✅ YouTube URL loaded', 'success');
}

// Analyze video
async function analyzeVideo() {
    if (!genAI) {
        updateStatus('❌ Enter an API key first', 'error');
        return;
    }

    if (!currentVideoFile) {
        updateStatus('❌ Select a video first', 'error');
        return;
    }

    const prompt = document.getElementById('prompt').value.trim() || 
                   'Describe in detail what happens in this video. Include important timestamps.';
    
    const modelName = document.getElementById('model').value;
    const resolution = document.getElementById('resolution').value;

    // Start processing
    document.getElementById('loading').classList.add('active');
    document.getElementById('analyzeBtn').disabled = true;
    updateStatus('🔄 Processing video with Gemini...', 'processing');
    
    const startTime = Date.now();

    try {
        // Model with generation config
        const generationConfig = {
            maxOutputTokens: 8192,
            temperature: 0.3
        };

        const model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: generationConfig
        });

        let result;

        if (currentVideoBase64) {
            // Local file as base64
            const videoPart = {
                inlineData: {
                    data: currentVideoBase64,
                    mimeType: getMimeType(currentVideoFile)
                }
            };

            // media_resolution per Sveta's article
            const requestConfig = {
                mediaResolution: resolution.toUpperCase()  // LOW/MEDIUM/HIGH
            };

            result = await model.generateContent([
                videoPart,
                prompt
            ], requestConfig);

        } else {
            // YouTube URL supported directly
            result = await model.generateContent([
                {
                    fileData: {
                        fileUri: currentVideoFile,
                        mimeType: 'video/*'
                    }
                },
                prompt
            ]);
        }

        const response = await result.response;
        const text = response.text();

        // Stats
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const tokensUsed = estimateTokens(text);
        const cost = calculateCost(modelName, tokensUsed, resolution);

        // Display results
        displayResults(text);
        
        document.getElementById('processingTime').textContent = processingTime + 's';
        document.getElementById('tokensUsed').textContent = tokensUsed.toLocaleString();
        document.getElementById('estimatedCost').textContent = '$' + cost.toFixed(4);

        updateStatus('✅ Analysis completed successfully!', 'success');

    } catch (error) {
        console.error('Error analyzing video:', error);
        updateStatus('❌ Error: ' + error.message, 'error');
        document.getElementById('results').textContent = 
            'Processing error:\n\n' + error.message + '\n\n' + 
            'Tips:\n' +
            '• Make sure the API key is valid\n' +
            '• Check the file is not too large (recommended up to 50MB)\n' +
            '• Try a different model';
    } finally {
        document.getElementById('loading').classList.remove('active');
        document.getElementById('analyzeBtn').disabled = false;
    }
}

// Format results with timestamps
function displayResults(text) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    // Detect and format timestamps
    const lines = text.split('\n');
    let formattedHtml = '';

    lines.forEach(line => {
        // Timestamps: [MM:SS], MM:SS, (MM:SS)
        const timestampRegex = /\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?/g;
        
        if (timestampRegex.test(line)) {
            // Line with timestamp
            const parts = line.split(timestampRegex);
            formattedHtml += '<div class="timestamp-item">';
            formattedHtml += '<span class="time">🕐 ' + parts[1] + '</span>';
            formattedHtml += '<div class="content">' + escapeHtml(parts[2] || '') + '</div>';
            formattedHtml += '</div>';
        } else if (line.trim()) {
            // Plain line
            formattedHtml += '<p>' + escapeHtml(line) + '</p>';
        }
    });

    resultsDiv.innerHTML = formattedHtml || '<pre>' + escapeHtml(text) + '</pre>';
}

// Helpers
function updateStatus(message, type) {
    const statusDiv = document.getElementById('statusMsg');
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function getMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
        'mp4': 'video/mp4',
        'avi': 'video/x-msvideo',
        'mov': 'video/quicktime',
        'mkv': 'video/x-matroska',
        'webm': 'video/webm'
    };
    return mimeTypes[ext] || 'video/mp4';
}

function estimateTokens(text) {
    // Rough: ~4 chars per token
    return Math.ceil(text.length / 4);
}

function calculateCost(model, tokens, resolution) {
    // Approximate pricing (March 2026)
    const prices = {
        'gemini-3-flash-preview': { input: 0.000075, output: 0.0003 },
        'gemini-3.1-flash-lite-preview': { input: 0.00005, output: 0.0002 },
        'gemini-3.1-pro-preview': { input: 0.0025, output: 0.01 },
        'gemini-2.5-pro': { input: 0.005, output: 0.02 }
    };

    // Resolution factor
    const resolutionMultiplier = {
        'low': 0.25,    // 66 tokens/sec
        'medium': 0.27, // 70 tokens/sec
        'high': 1.0     // 258 tokens/sec
    };

    const price = prices[model] || prices['gemini-3-flash-preview'];
    const multiplier = resolutionMultiplier[resolution] || 1.0;

    // Assume ~70% input, ~30% output
    const inputTokens = tokens * 0.7 * multiplier;
    const outputTokens = tokens * 0.3;

    return (inputTokens / 1000000 * price.input) + 
           (outputTokens / 1000000 * price.output);
}

function setPrompt(text) {
    document.getElementById('prompt').value = text;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateLiveStatus(message, type) {
    const el = document.getElementById('liveStatusMsg');
    if (!el) {
        return;
    }
    el.textContent = message;
    el.className = 'status ' + (type || 'info');
}

function appendLiveTranscript(role, text, finished) {
    const root = document.getElementById('liveTranscript');
    if (!root) {
        return;
    }
    let bubble = role === 'user' ? liveUserBubble : liveModelBubble;
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.className = 'timestamp-item';
        const label = role === 'user' ? 'You' : 'Gemini';
        bubble.innerHTML =
            '<span class="time">' +
            label +
            '</span><div class="content"></div>';
        root.appendChild(bubble);
        if (role === 'user') {
            liveUserBubble = bubble;
        } else {
            liveModelBubble = bubble;
        }
    }
    const content = bubble.querySelector('.content');
    content.textContent = (content.textContent || '') + (text || '');
    root.scrollTop = root.scrollHeight;
    if (finished) {
        if (role === 'user') {
            liveUserBubble = null;
        } else {
            liveModelBubble = null;
        }
    }
}

async function startLiveSession() {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) {
        updateLiveStatus('Enter and save an API key first', 'error');
        return;
    }
    if (liveSession) {
        updateLiveStatus('Session already running', 'processing');
        return;
    }

    const modelSelect = document.getElementById('liveModel');
    const model = modelSelect ? modelSelect.value : undefined;

    document.getElementById('liveStartBtn').disabled = true;
    document.getElementById('liveStopBtn').disabled = false;
    updateLiveStatus('Starting…', 'processing');

    const transcript = document.getElementById('liveTranscript');
    if (transcript) {
        transcript.innerHTML = '';
    }
    liveUserBubble = null;
    liveModelBubble = null;

    liveSession = new GeminiLiveScreenSession({
        apiKey,
        model,
        onStatus: (t) => updateLiveStatus(t, 'info'),
        onUserTranscript: (text, fin) => appendLiveTranscript('user', text, fin),
        onModelTranscript: (text, fin) => appendLiveTranscript('model', text, fin),
        onError: (msg) => updateLiveStatus(msg, 'error'),
    });

    try {
        await liveSession.connect();
        await liveSession.startMicrophone();
        try {
            const preview = document.getElementById('liveScreenPreview');
            await liveSession.startScreenShare(preview);
        } catch (screenErr) {
            console.warn('Screen share skipped:', screenErr);
            updateLiveStatus('Screen not shared — voice and text only', 'processing');
        }
    } catch (err) {
        console.error('Live session error:', err);
        updateLiveStatus('Live error: ' + err.message, 'error');
        if (liveSession) {
            liveSession.disconnect();
            liveSession = null;
        }
        document.getElementById('liveStartBtn').disabled = false;
        document.getElementById('liveStopBtn').disabled = true;
        const preview = document.getElementById('liveScreenPreview');
        if (preview) {
            preview.srcObject = null;
            preview.style.display = 'none';
        }
    }
}

function stopLiveSession() {
    if (liveSession) {
        liveSession.disconnect();
        liveSession = null;
    }
    liveUserBubble = null;
    liveModelBubble = null;
    const preview = document.getElementById('liveScreenPreview');
    if (preview) {
        preview.srcObject = null;
        preview.style.display = 'none';
    }
    document.getElementById('liveStartBtn').disabled = false;
    document.getElementById('liveStopBtn').disabled = true;
    updateLiveStatus('Live session idle', 'info');
}

function sendLiveTextMessage() {
    if (!liveSession || !liveSession.sessionReady) {
        updateLiveStatus('Start a live session first', 'error');
        return;
    }
    const input = document.getElementById('liveTextInput');
    const text = input.value.trim();
    if (!text) {
        return;
    }
    liveSession.sendText(text);
    input.value = '';
}

// Expose for onclick handlers
window.saveApiKey = saveApiKey;
window.selectVideoFile = selectVideoFile;
window.useYouTubeUrl = useYouTubeUrl;
window.analyzeVideo = analyzeVideo;
window.setPrompt = setPrompt;
window.startLiveSession = startLiveSession;
window.stopLiveSession = stopLiveSession;
window.sendLiveTextMessage = sendLiveTextMessage;

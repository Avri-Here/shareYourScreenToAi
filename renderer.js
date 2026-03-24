// renderer.js - Electron Renderer Process
const { ipcRenderer, shell } = require('electron');
const { GeminiLiveScreenSession } = require('./liveSession.js');

let liveSession = null;
let liveUserBubble = null;
let liveModelBubble = null;

function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const pages = document.querySelectorAll('.page');
    tabs.forEach((btn) => {
        btn.addEventListener('click', () => {
            const name = btn.getAttribute('data-tab');
            tabs.forEach((b) => {
                const on = b === btn;
                b.classList.toggle('active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            pages.forEach((p) => {
                p.classList.toggle('active', p.id === `page-${name}`);
            });
        });
    });
}

function showSetupStatus(message, type) {
    const el = document.getElementById('setupStatusMsg');
    if (!el) {
        return;
    }
    el.style.display = 'block';
    el.textContent = message;
    el.className = 'status ' + (type || 'info');
}

window.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    const savedApiKey = await ipcRenderer.invoke('load-api-key');
    if (savedApiKey) {
        document.getElementById('apiKey').value = savedApiKey;
        showSetupStatus('API key loaded from saved settings.', 'success');
    }
    const aiStudioBtn = document.getElementById('openAiStudioKeys');
    if (aiStudioBtn) {
        aiStudioBtn.addEventListener('click', () => {
            void shell.openExternal('https://aistudio.google.com/apikey');
        });
    }
    const rateLimitsBtn = document.getElementById('openGeminiRateLimits');
    if (rateLimitsBtn) {
        rateLimitsBtn.addEventListener('click', () => {
            void shell.openExternal('https://ai.google.dev/gemini-api/docs/rate-limits');
        });
    }
});

async function saveApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();

    if (!apiKey) {
        showSetupStatus('Enter a valid API key.', 'error');
        return;
    }

    try {
        await ipcRenderer.invoke('save-api-key', apiKey);
        showSetupStatus('API key saved.', 'success');
    } catch (error) {
        showSetupStatus('Error saving API key: ' + error.message, 'error');
    }
}

function updateLiveStatus(message, type) {
    const el = document.getElementById('liveStatusMsg');
    if (!el) {
        return;
    }
    el.textContent = message;
    el.className = 'status ' + (type || 'info');
}

function formatUsageNum(n) {
    if (n === undefined || n === null || Number.isNaN(n)) {
        return '—';
    }
    return String(n);
}

function setUsagePanelIdle() {
    const state = document.getElementById('usageSessionState');
    const wrap = document.getElementById('usageMetricsWrap');
    if (state) {
        state.textContent = 'Start a live session on the Session tab to see usage here.';
        state.className = 'status info';
        state.style.display = 'block';
    }
    if (wrap) {
        wrap.style.display = 'none';
    }
}

function setUsagePanelWaiting() {
    const state = document.getElementById('usageSessionState');
    const wrap = document.getElementById('usageMetricsWrap');
    if (state) {
        state.textContent = 'Connected — waiting for usageMetadata from the API…';
        state.className = 'status processing';
        state.style.display = 'block';
    }
    if (wrap) {
        wrap.style.display = 'none';
    }
}

function applyUsageMetadata(meta) {
    const state = document.getElementById('usageSessionState');
    const wrap = document.getElementById('usageMetricsWrap');
    const promptEl = document.getElementById('usagePromptTokens');
    const responseEl = document.getElementById('usageResponseTokens');
    const totalEl = document.getElementById('usageTotalTokens');
    if (state) {
        state.style.display = 'none';
    }
    if (wrap) {
        wrap.style.display = 'grid';
    }
    if (promptEl) {
        promptEl.textContent = formatUsageNum(meta.promptTokenCount);
    }
    if (responseEl) {
        responseEl.textContent = formatUsageNum(meta.responseTokenCount);
    }
    if (totalEl) {
        totalEl.textContent = formatUsageNum(meta.totalTokenCount);
    }
}

function appendLiveTranscript(role, text, finished) {
    const root = document.getElementById('liveTranscript');
    if (!root) {
        return;
    }
    let bubble = role === 'user' ? liveUserBubble : liveModelBubble;
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.className = 'timestamp-item from-' + role;
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

function getLiveShareScreenEnabled() {
    const checked = document.querySelector('input[name="liveShareMode"]:checked');
    return checked && checked.value === 'screen';
}

function setPreviewVisible(show) {
    const preview = document.getElementById('liveScreenPreview');
    if (!preview) {
        return;
    }
    if (show) {
        preview.classList.remove('hidden');
    } else {
        preview.classList.add('hidden');
        preview.srcObject = null;
    }
}

async function startLiveSession() {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) {
        updateLiveStatus('Enter and save an API key on Setup first.', 'error');
        return;
    }
    if (liveSession) {
        updateLiveStatus('A session is already running.', 'processing');
        return;
    }

    const modelSelect = document.getElementById('liveModel');
    const model = modelSelect ? modelSelect.value : undefined;
    const enableScreenShare = getLiveShareScreenEnabled();

    document.getElementById('liveStartBtn').disabled = true;
    document.getElementById('liveStopBtn').disabled = false;
    updateLiveStatus('Starting…', 'processing');

    const transcript = document.getElementById('liveTranscript');
    if (transcript) {
        transcript.innerHTML = '';
    }
    liveUserBubble = null;
    liveModelBubble = null;
    setUsagePanelWaiting();

    if (!enableScreenShare) {
        setPreviewVisible(false);
    }

    liveSession = new GeminiLiveScreenSession({
        apiKey,
        model,
        enableScreenShare,
        onStatus: (t) => updateLiveStatus(t, 'info'),
        onUserTranscript: (text, fin) => appendLiveTranscript('user', text, fin),
        onModelTranscript: (text, fin) => appendLiveTranscript('model', text, fin),
        onUsageMetadata: (meta) => applyUsageMetadata(meta),
        onError: (msg) => updateLiveStatus(msg, 'error'),
    });

    try {
        await liveSession.connect();
        await liveSession.startMicrophone();
        if (enableScreenShare) {
            const preview = document.getElementById('liveScreenPreview');
            setPreviewVisible(true);
            try {
                await liveSession.startScreenShare(preview);
            } catch (screenErr) {
                console.warn('Screen share skipped:', screenErr);
                updateLiveStatus('Screen share canceled or failed — voice and text only.', 'processing');
                setPreviewVisible(false);
            }
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
        setPreviewVisible(false);
        setUsagePanelIdle();
    }
}

function stopLiveSession() {
    if (liveSession) {
        liveSession.disconnect();
        liveSession = null;
    }
    liveUserBubble = null;
    liveModelBubble = null;
    setPreviewVisible(false);
    document.getElementById('liveStartBtn').disabled = false;
    document.getElementById('liveStopBtn').disabled = true;
    updateLiveStatus('Live session idle', 'info');
    setUsagePanelIdle();
}

function sendLiveTextMessage() {
    if (!liveSession || !liveSession.sessionReady) {
        updateLiveStatus('Start a live session first.', 'error');
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

window.saveApiKey = saveApiKey;
window.startLiveSession = startLiveSession;
window.stopLiveSession = stopLiveSession;
window.sendLiveTextMessage = sendLiveTextMessage;

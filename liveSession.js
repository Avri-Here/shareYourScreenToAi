// Gemini Live API (WebSocket) — screen JPEG (≤1 FPS) + mic PCM 16 kHz + optional text
// Protocol: https://ai.google.dev/api/live

const path = require('path');
const { pathToFileURL } = require('url');

const LIVE_WS_BASE =
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

function buildLiveWsUrl(apiKey) {
    return `${LIVE_WS_BASE}?key=${encodeURIComponent(apiKey)}`;
}

function downsampleFloat32(buffer, inputRate, outputRate) {
    if (inputRate === outputRate) {
        return buffer;
    }
    const ratio = inputRate / outputRate;
    const outLength = Math.floor(buffer.length / ratio);
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
        const srcPos = i * ratio;
        const i0 = Math.floor(srcPos);
        const i1 = Math.min(i0 + 1, buffer.length - 1);
        const t = srcPos - i0;
        out[i] = buffer[i0] * (1 - t) + buffer[i1] * t;
    }
    return out;
}

function floatTo16BitLE(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
}

function arrayBufferToBase64(buffer) {
    return Buffer.from(new Uint8Array(buffer)).toString('base64');
}

class GeminiLiveScreenSession {
    constructor(options) {
        this.apiKey = options.apiKey;
        this.model = options.model || DEFAULT_LIVE_MODEL;
        this.enableScreenShare = options.enableScreenShare !== false;
        if (options.systemInstruction) {
            this.systemInstruction = options.systemInstruction;
        } else if (this.enableScreenShare) {
            this.systemInstruction =
                'You are a helpful assistant. The user shares their screen as JPEG frames (about one per second) and speaks. Answer concisely in the same language they use.';
        } else {
            this.systemInstruction =
                'You are a helpful assistant. The user talks to you by voice only -  Answer concisely in the same language they use.';
        }
        this.onStatus = options.onStatus || (() => {});
        this.onUserTranscript = options.onUserTranscript || (() => {});
        this.onModelTranscript = options.onModelTranscript || (() => {});
        this.onError = options.onError || (() => {});

        this._ws = null;
        this._sessionReady = false;
        this._screenInterval = null;
        this._screenVideo = null;
        this._screenCanvas = null;
        this._screenCtx = null;
        this._screenStream = null;
        this._micContext = null;
        this._micWorkletNode = null;
        this._micSource = null;
        this._micStream = null;
        this._micAccum = new Float32Array(0);
        this._playbackContext = null;
        this._nextPlayTime = 0;
        this._activeSources = [];
        this._jpegQuality = 0.72;
        this._frameFps = 1;
    }

    get connected() {
        return this._ws && this._ws.readyState === WebSocket.OPEN;
    }

    get sessionReady() {
        return this._sessionReady;
    }

    async connect() {
        if (!this.apiKey) {
            throw new Error('API key is required');
        }
        this._sessionReady = false;
        this.onStatus('Connecting…');

        return new Promise((resolve, reject) => {
            let settled = false;
            let ws;
            const settleOk = () => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeoutId);
                resolve();
            };
            const settleErr = (err) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeoutId);
                try {
                    if (ws) {
                        ws.close();
                    }
                } catch (e) {
                    /* ignore */
                }
                reject(err);
            };

            const timeoutId = setTimeout(() => {
                settleErr(new Error('Timed out waiting for session setup'));
            }, 25000);

            ws = new WebSocket(buildLiveWsUrl(this.apiKey));
            this._ws = ws;

            ws.onopen = () => {
                const setup = {
                    setup: {
                        model: `models/${this.model}`,
                        generationConfig: {
                            responseModalities: ['AUDIO'],
                            temperature: 0.8,
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: {
                                        voiceName: 'Puck',
                                    },
                                },
                            },
                        },
                        systemInstruction: {
                            parts: [{ text: this.systemInstruction }],
                        },
                        inputAudioTranscription: {},
                        outputAudioTranscription: {},
                    },
                };
                ws.send(JSON.stringify(setup));
                this.onStatus('Waiting for session…');
            };

            ws.onerror = () => {
                this.onError('WebSocket connection error');
                settleErr(new Error('WebSocket error'));
            };

            ws.onclose = (ev) => {
                this._sessionReady = false;
                this.onStatus('Disconnected');
                if (!settled) {
                    settleErr(new Error('Connection closed before session ready (code ' + ev.code + ')'));
                }
            };

            ws.onmessage = async (event) => {
                let raw = event.data;
                if (raw instanceof Blob) {
                    raw = await raw.text();
                } else if (raw instanceof ArrayBuffer) {
                    raw = new TextDecoder().decode(raw);
                }
                let msg;
                try {
                    msg = JSON.parse(raw);
                } catch (e) {
                    this.onError('Invalid server message');
                    return;
                }

                if (msg.setupComplete) {
                    this._sessionReady = true;
                    this.onStatus(
                        this.enableScreenShare
                            ? 'Connected — speak or type. Screen frames will send when sharing is active.'
                            : 'Connected — speak or type (voice only, no screen).'
                    );
                    settleOk();
                    return;
                }

                if (msg.error) {
                    const errText = JSON.stringify(msg.error);
                    this.onError(errText);
                    settleErr(new Error(errText));
                    return;
                }

                if (msg.serverContent) {
                    const sc = msg.serverContent;
                    if (sc.interrupted) {
                        this._flushPlayback();
                    }
                    if (sc.inputTranscription && sc.inputTranscription.text) {
                        this.onUserTranscript(sc.inputTranscription.text, !!sc.inputTranscription.finished);
                    }
                    if (sc.outputTranscription && sc.outputTranscription.text) {
                        this.onModelTranscript(sc.outputTranscription.text, !!sc.outputTranscription.finished);
                    }
                    const parts = sc.modelTurn && sc.modelTurn.parts;
                    if (parts && parts.length) {
                        for (const part of parts) {
                            if (part.inlineData && part.inlineData.data) {
                                const mime = part.inlineData.mimeType || 'audio/pcm;rate=24000';
                                this._playPcmChunk(part.inlineData.data, mime);
                            }
                        }
                    }
                }

                if (msg.toolCall) {
                    this._sendToolStub(msg.toolCall);
                }
            };
        });
    }

    _sendToolStub(toolCall) {
        const functionCalls = toolCall.functionCalls || [];
        if (!functionCalls.length || !this.connected) {
            return;
        }
        const functionResponses = functionCalls.map((fc) => ({
            name: fc.name,
            id: fc.id,
            response: { result: { message: 'Tool not implemented in this demo.' } },
        }));
        this._ws.send(
            JSON.stringify({
                toolResponse: { functionResponses },
            })
        );
    }

    _flushPlayback() {
        this._nextPlayTime = 0;
        for (const s of this._activeSources) {
            try {
                s.stop();
            } catch (e) {
                /* ignore */
            }
        }
        this._activeSources = [];
    }

    _playPcmChunk(base64, mimeType) {
        const rateMatch = mimeType && mimeType.match(/rate=(\d+)/);
        const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const pcm = new Int16Array(bytes.buffer);
        if (!this._playbackContext) {
            this._playbackContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate,
            });
        }
        const ctx = this._playbackContext;
        if (ctx.state === 'suspended') {
            void ctx.resume();
        }
        const float32 = new Float32Array(pcm.length);
        for (let i = 0; i < pcm.length; i++) {
            float32[i] = pcm[i] / 32768;
        }
        const buf = ctx.createBuffer(1, float32.length, sampleRate);
        buf.getChannelData(0).set(float32);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        const startAt = Math.max(ctx.currentTime, this._nextPlayTime);
        src.start(startAt);
        this._nextPlayTime = startAt + buf.duration;
        this._activeSources.push(src);
        src.onended = () => {
            const idx = this._activeSources.indexOf(src);
            if (idx !== -1) {
                this._activeSources.splice(idx, 1);
            }
        };
    }

    sendText(text) {
        if (!this.connected || !this._sessionReady) {
            return;
        }
        const trimmed = (text || '').trim();
        if (!trimmed) {
            return;
        }
        this._ws.send(
            JSON.stringify({
                realtimeInput: { text: trimmed },
            })
        );
    }

    sendAudioPcm16Base64(base64) {
        if (!this.connected || !this._sessionReady) {
            return;
        }
        this._ws.send(
            JSON.stringify({
                realtimeInput: {
                    audio: {
                        data: base64,
                        mimeType: 'audio/pcm;rate=16000',
                    },
                },
            })
        );
    }

    sendVideoJpegBase64(base64) {
        if (!this.connected || !this._sessionReady) {
            return;
        }
        this._ws.send(
            JSON.stringify({
                realtimeInput: {
                    video: {
                        data: base64,
                        mimeType: 'image/jpeg',
                    },
                },
            })
        );
    }

    async startScreenShare(previewVideoEl) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
            },
            audio: false,
        });
        this._screenStream = stream;
        const track = stream.getVideoTracks()[0];
        track.onended = () => this.stopScreenShare();

        const v = document.createElement('video');
        v.srcObject = stream;
        v.muted = true;
        v.playsInline = true;
        await v.play();
        this._screenVideo = v;

        const canvas = document.createElement('canvas');
        canvas.width = 960;
        canvas.height = 540;
        this._screenCanvas = canvas;
        this._screenCtx = canvas.getContext('2d');

        if (previewVideoEl) {
            previewVideoEl.srcObject = stream;
            previewVideoEl.classList.remove('hidden');
        }

        const intervalMs = Math.max(1000, Math.floor(1000 / this._frameFps));
        this._screenInterval = setInterval(() => {
            if (!this._screenVideo || !this._screenCtx || !this._sessionReady) {
                return;
            }
            this._screenCtx.drawImage(this._screenVideo, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        return;
                    }
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const dataUrl = reader.result;
                        const comma = dataUrl.indexOf(',');
                        const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
                        if (b64) {
                            this.sendVideoJpegBase64(b64);
                        }
                    };
                    reader.readAsDataURL(blob);
                },
                'image/jpeg',
                this._jpegQuality
            );
        }, intervalMs);
    }

    stopScreenShare() {
        if (this._screenInterval) {
            clearInterval(this._screenInterval);
            this._screenInterval = null;
        }
        if (this._screenStream) {
            this._screenStream.getTracks().forEach((t) => t.stop());
            this._screenStream = null;
        }
        this._screenVideo = null;
        this._screenCanvas = null;
        this._screenCtx = null;
    }

    async startMicrophone() {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });
        this._micStream = stream;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const audioContext = new Ctx();
        await audioContext.resume();
        const inputRate = audioContext.sampleRate;
        const workletHref = pathToFileURL(path.join(__dirname, 'micWorklet.js')).href;
        await audioContext.audioWorklet.addModule(workletHref);
        const source = audioContext.createMediaStreamSource(stream);
        const micNode = new AudioWorkletNode(audioContext, 'mic-capture');
        const chunkSize = 4096;
        this._micAccum = new Float32Array(0);
        micNode.port.onmessage = (e) => {
            if (!this._sessionReady) {
                return;
            }
            const block = e.data;
            const prev = this._micAccum;
            const merged = new Float32Array(prev.length + block.length);
            merged.set(prev, 0);
            merged.set(block, prev.length);
            let offset = 0;
            while (merged.length - offset >= chunkSize) {
                const slice = merged.subarray(offset, offset + chunkSize);
                const copy = new Float32Array(slice);
                const down = downsampleFloat32(copy, inputRate, 16000);
                const pcm = floatTo16BitLE(down);
                const b64 = arrayBufferToBase64(pcm);
                this.sendAudioPcm16Base64(b64);
                offset += chunkSize;
            }
            this._micAccum = new Float32Array(merged.subarray(offset));
        };
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        source.connect(micNode);
        micNode.connect(silentGain);
        silentGain.connect(audioContext.destination);
        this._micContext = audioContext;
        this._micWorkletNode = micNode;
        this._micSource = source;
    }

    stopMicrophone() {
        if (this._micWorkletNode && this._micSource) {
            try {
                this._micSource.disconnect();
                this._micWorkletNode.disconnect();
            } catch (e) {
                /* ignore */
            }
        }
        this._micWorkletNode = null;
        this._micSource = null;
        this._micAccum = new Float32Array(0);
        if (this._micContext) {
            this._micContext.close();
            this._micContext = null;
        }
        if (this._micStream) {
            this._micStream.getTracks().forEach((t) => t.stop());
            this._micStream = null;
        }
    }

    disconnect() {
        this.stopScreenShare();
        this.stopMicrophone();
        this._flushPlayback();
        if (this._playbackContext) {
            this._playbackContext.close();
            this._playbackContext = null;
        }
        this._sessionReady = false;
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
    }
}

module.exports = {
    GeminiLiveScreenSession,
    DEFAULT_LIVE_MODEL,
};

class MicCaptureProcessor extends AudioWorkletProcessor {
    process(inputs) {
        const ch = inputs[0] && inputs[0][0];
        if (ch && ch.length > 0) {
            const copy = new Float32Array(ch.length);
            copy.set(ch);
            this.port.postMessage(copy, [copy.buffer]);
        }
        return true;
    }
}

registerProcessor('mic-capture', MicCaptureProcessor);

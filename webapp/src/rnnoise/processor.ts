// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import RingBuffer from './ringbuffer';

/* eslint-disable no-underscore-dangle */

// Number of audio samples per frame (10ms at 48kHz)
const FRAME_SIZE = 480;

class RNNoiseProcessor extends AudioWorkletProcessor {
    private module: any;
    private heap: Float32Array;
    private state: number;
    private stop: boolean;
    private running: boolean;
    private inPtr: number;
    private outPtr: number;
    private inBuffer: RingBuffer;
    private outBuffer: RingBuffer;

    constructor(options: AudioWorkletNodeOptions) {
        super();

        this.module = new WebAssembly.Instance(new WebAssembly.Module(options.processorOptions.wasmBinary), {
            env: {
                memory: new WebAssembly.Memory({initial: 32}), // 32 64KB pages = 2MB
            },
        });
        this.module.exports._initialize();

        // this.module = initModule();
        this.heap = new Float32Array(this.module.exports.memory.buffer);
        this.state = this.module.exports.create();
        this.stop = false;
        this.running = false;

        // TODO: free these
        this.inPtr = this.module.exports.malloc(FRAME_SIZE * 4);
        this.outPtr = this.module.exports.malloc(FRAME_SIZE * 4);

        // Quantum size is 128 but the noise reduction algorithm works on FRAME_SIZE frames.
        // This means we need to buffer FRAME_SIZE frames before we can process them.
        // 1920 samples is 15 quantum frames, 4 frames, 40ms worth of audio.
        this.inBuffer = new RingBuffer(1920);
        this.outBuffer = new RingBuffer(1920);

        // eslint-disable-next-line no-console
        console.log('RNNoiseProcessor: initializing', this.module, this.state);

        this.port.onmessage = ({data: {cmd}}) => {
            switch (cmd) {
            case 'stop':
                this.port.postMessage('RNNoiseProcessor: received stop signal');
                this.shutdown();
                break;
            case 'pause':
                this.port.postMessage('RNNoiseProcessor: received pause signal');
                this.running = false;
                break;
            case 'resume':
                this.port.postMessage('RNNoiseProcessor: received resume signal');
                this.running = true;
                break;
            }
        };
    }

    shutdown() {
        this.port.postMessage('RNNoiseProcessor: shutdown');
        this.stop = true;
        this.module.exports.destroy(this.state);
        this.module.exports.free(this.inPtr);
        this.module.exports.free(this.outPtr);
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]) {
        if (this.stop) {
            this.port.postMessage('RNNoiseProcessor: stopping');
            return false;
        }

        if (!this.running) {
            // Simple bypass when not running. We copy the input to the output.
            outputs[0][0].set(inputs[0][0]);
            return true;
        }

        this.inBuffer.push(inputs[0][0]);

        if (this.inBuffer.availableFrames >= FRAME_SIZE) {
            const inView = this.heap.subarray(this.inPtr / 4, (this.inPtr / 4) + FRAME_SIZE);
            this.inBuffer.pull(inView);

            // Convert to "int16" format. [-32768.0, 32767.0]
            // In reality it's still inside a floating point container.
            // for (let i = 0; i < FRAME_SIZE; i++) {
            //     inView[i] *= 32767;
            // }

            this.port.postMessage('start');
            this.module.exports.process_frame(this.state, this.outPtr, this.inPtr);
            this.port.postMessage('stop');

            const outView = this.heap.subarray(this.outPtr / 4, (this.outPtr / 4) + FRAME_SIZE);

            // Convert back to normalized floating point format [-1.0, 1.0]
            // for (let i = 0; i < FRAME_SIZE; i++) {
            //     outView[i] /= 32767;
            // }

            this.outBuffer.push(outView);
        }

        if (this.outBuffer.availableFrames >= 128) {
            this.outBuffer.pull(outputs[0][0]);
        }

        return true;
    }
}

registerProcessor('rnnoise', RNNoiseProcessor);

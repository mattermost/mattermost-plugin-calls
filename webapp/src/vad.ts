import {EventEmitter} from 'events';

export default class VoiceActivityDetector extends EventEmitter {
    constructor(audioContext, stream) {
        super();

        const config = {
            freqRange: [80, 400],
            noiseCaptureMs: 500,
            noiseMultiplier: 1.5,
            activityThreshold: 4,
            activityCounterMax: 10,
        };

        this.sourceNode = audioContext.createMediaStreamSource(stream);
        this.analyserNode = audioContext.createAnalyser();
        this.analyserNode.fftSize = 1024;
        this.analyserNode.smoothingTimeConstant = 0;

        // TODO: use an AudioWorklet instead.
        this.processNode = audioContext.createScriptProcessor(2048, 1, 1);
        const rate = audioContext.sampleRate;
        const hrate = rate / 2;
        const indexes = [];
        for (let i = 0; i < this.analyserNode.frequencyBinCount; i++) {
            const freq = Math.round((i * hrate) / this.analyserNode.frequencyBinCount);
            if (freq >= config.freqRange[0] && freq <= config.freqRange[1]) {
                indexes.push(i);
            }
        }

        let noiseAvg = 0;
        let noiseSamples = [];
        let activityCounter = 0;
        const frequencies = new Uint8Array(indexes[indexes.length - 1] + 1);

        this.processNode.onaudioprocess = () => {
            this.analyserNode.getByteFrequencyData(frequencies);
            const sum = frequencies.reduce((acc, val) => {
                return acc + val;
            });
            const avg = sum / frequencies.length;

            if (!this.startTime) {
                this.startTime = Date.now();
            }

            if (Date.now() < (this.startTime + config.noiseCaptureMs)) {
                noiseSamples.push(avg);
                return;
            }

            if (noiseSamples.length > 0) {
                noiseAvg = noiseSamples.reduce((acc, val) => acc + val) / noiseSamples.length;
                noiseSamples = [];

                // console.log('noise avg', noiseAvg);

                this.stop();
                this.emit('ready');
            }

            if (avg > noiseAvg * config.noiseMultiplier) {
                activityCounter = activityCounter < config.activityCounterMax ? activityCounter + 1 : activityCounter;
            } else {
                activityCounter = activityCounter > 0 ? activityCounter - 1 : activityCounter;
            }

            if (!this.isActive && activityCounter >= config.activityThreshold) {
                this.isActive = true;
                this.emit('start');
            }

            if (this.isActive && activityCounter < config.activityThreshold) {
                this.isActive = false;
                this.emit('stop');
            }
        };

        this.start();
    }

    start() {
        // console.log('vad start');
        this.isActive = false;
        if (this.sourceNode) {
            this.sourceNode.connect(this.analyserNode);
        }
        if (this.analyserNode) {
            this.analyserNode.connect(this.processNode);
        }
        if (this.processNode) {
            this.processNode.connect(this.processNode.context.destination);
        }
    }

    stop() {
        // console.log('vad stop');
        this.emit('stop');
        if (this.processNode) {
            this.processNode.disconnect();
        }
        if (this.analyserNode) {
            this.analyserNode.disconnect();
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
        }
    }
}


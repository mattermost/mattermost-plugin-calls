// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {logDebug, logErr} from 'src/log';
import {getPluginPath} from 'src/utils';

type SegmenterConfig = {
    inputVideo: HTMLVideoElement;
    outputCanvas: HTMLCanvasElement;
};

export default class Segmenter {
    private readonly config: SegmenterConfig;
    private worker: Worker;
    private done = false;
    private lastCallbackID = 0;
    private initialized = false;

    constructor(config: SegmenterConfig) {
        logDebug('Segmenter: initializing', config);
        this.config = config;
        this.worker = new Worker(new URL('./segmenter.worker.ts', import.meta.url));
        this.lastCallbackID = this.config.inputVideo.requestVideoFrameCallback(this.videoCb);
    }

    private videoCb = async (timestamp: DOMHighResTimeStamp, metadata: {width: number, height: number}) => {
        if (this.done) {
            return;
        }

        if (!this.initialized) {
            const offscreen = this.config.outputCanvas.transferControlToOffscreen();
            offscreen.width = metadata.width;
            offscreen.height = metadata.height;

            this.worker.postMessage({
                assetsPath: `${getPluginPath()}/public`,
                canvas: offscreen,
            }, [offscreen]);

            this.initialized = true;
        }

        try {
            const frameData = await createImageBitmap(this.config.inputVideo);

            this.worker.postMessage({
                frame: frameData,
                width: metadata.width,
                height: metadata.height,
            }, [frameData]);
        } catch (e) {
            logErr('Segmenter: error processing video frame', e);
        }

        this.lastCallbackID = this.config.inputVideo.requestVideoFrameCallback(this.videoCb);
    };

    public setBlurIntensity(intensity: number) {
        this.worker?.postMessage({blurIntensity: intensity});
    }

    public stop() {
        logDebug('Segmenter: stopping');
        this.config.inputVideo.cancelVideoFrameCallback(this.lastCallbackID);
        this.config.inputVideo.onloadedmetadata = null;
        this.worker.terminate();
        this.done = true;
    }
}


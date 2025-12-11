// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Mock implementation of Segmenter for Jest tests

type SegmenterConfig = {
    inputVideo: HTMLVideoElement;
    outputCanvas: HTMLCanvasElement;
};

export default class Segmenter {
    constructor(_config: SegmenterConfig) {
        // Mock constructor - do nothing
    }

    public setBlurIntensity(_intensity: number) {
        // Mock setBlurIntensity - do nothing
    }

    public stop() {
        // Mock stop - do nothing
    }
}

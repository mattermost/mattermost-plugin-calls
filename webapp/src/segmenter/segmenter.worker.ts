// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console */

import {FilesetResolver, ImageSegmenter} from '@mediapipe/tasks-vision';

let segmenter: ImageSegmenter | null = null;
let outputCtx: CanvasRenderingContext2D;
let tempCtx: OffscreenCanvasRenderingContext2D;
let blurIntensity = 0;

self.onmessage = async ({data}) => {
    if (data.canvas) {
        console.log('segmeneter.worker: received canvas, initializing', data);

        try {
            const vision = await FilesetResolver.forVisionTasks(
                `${data.assetsPath}/mediapipe/tasks-vision/wasm`,
            );

            segmenter = await ImageSegmenter.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `${data.assetsPath}/mediapipe/tasks-vision/selfie_segmenter_landscape.tflite`,
                    delegate: 'GPU',
                },
                outputCategoryMask: true,
                outputConfidenceMasks: false,
                runningMode: 'VIDEO',
            });
        } catch (err) {
            console.error('segmeneter.worker: failed to initialize segmenter', err);
        }

        outputCtx = data.canvas.getContext('2d');
        const tmpCtx = new OffscreenCanvas(640, 480).getContext('2d', {willReadFrequently: true});
        if (!tmpCtx) {
            console.error('segmeneter.worker: failed to create temp canvas context');
            return;
        }
        tempCtx = tmpCtx;
    } else if (data.frame && segmenter) {
        if (outputCtx.canvas.width !== data.width || outputCtx.canvas.height !== data.height) {
            console.log('segmeneter.worker: resizing output canvas', data.width, data.height);
            outputCtx.canvas.width = data.width;
            outputCtx.canvas.height = data.height;
        }

        if (tempCtx.canvas.width !== data.width || tempCtx.canvas.height !== data.height) {
            console.log('segmeneter.worker: resizing temp canvas', data.width, data.height);
            tempCtx.canvas.width = data.width;
            tempCtx.canvas.height = data.height;
        }

        segmenter.segmentForVideo(data.frame, performance.now(), async (result) => {
            if (!result.categoryMask) {
                console.warn('segmeneter.worker: no category mask in result');
                return;
            }

            // TODO: consider applying blur using WebGL instead to avoid using the
            // expensive CPU canvas context and CSS filter.
            outputCtx.filter = `blur(${blurIntensity}px)`;
            outputCtx.drawImage(data.frame, 0, 0, data.width, data.height);
            outputCtx.filter = 'none';

            // Reset composite operation to default
            tempCtx.globalCompositeOperation = 'source-over';

            // Draw the original image to the temp canvas
            tempCtx.drawImage(data.frame, 0, 0, data.width, data.height);

            // Use the segmentation mask to keep only the person
            tempCtx.globalCompositeOperation = 'destination-in';

            const newImageData = tempCtx.getImageData(
                0,
                0,
                data.width,
                data.height,
            ).data;

            let j = 0;
            const mask = result.categoryMask.getAsFloat32Array();
            for (let i = 0; i < mask.length; i++) {
                if (mask[i] > 0) {
                    newImageData[j] = 0;
                    newImageData[j + 1] = 0;
                    newImageData[j + 2] = 0;
                    newImageData[j + 3] = 0;
                }
                j += 4;
            }

            const uint8Array = new Uint8ClampedArray(newImageData.buffer);
            const dataNew = new ImageData(
                uint8Array,
                data.width,
                data.height,
            );

            outputCtx.drawImage(await createImageBitmap(dataNew), 0, 0);
        });
    } else if ('blurIntensity' in data) {
        blurIntensity = data.blurIntensity;
    }
};

// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export default class RingBuffer {
    private buffer: Float32Array;
    private length: number;
    private readIndex: number = 0;
    private writeIndex: number = 0;
    private framesAvailable: number = 0;

    /**
     * Creates a new RingBuffer with the specified length.
     * @param length The fixed length of the buffer in frames.
     * @param backingBuffer Optional existing Float32Array to use as the buffer.
     *                      Must be at least the specified length.
     */
    constructor(length: number, backingBuffer?: Float32Array) {
        this.length = length;

        if (backingBuffer) {
            if (backingBuffer.length < length) {
                throw new Error(`Backing buffer length (${backingBuffer.length}) is smaller than required length (${length})`);
            }
            this.buffer = backingBuffer;
        } else {
            this.buffer = new Float32Array(length);
        }
    }

    /**
     * Gets the number of frames available to read.
     */
    get availableFrames(): number {
        return this.framesAvailable;
    }

    /**
     * Gets the total capacity of the buffer.
     */
    get capacity(): number {
        return this.length;
    }

    /**
     * Clears the buffer, resetting all indices.
     */
    clear(): void {
        this.readIndex = 0;
        this.writeIndex = 0;
        this.framesAvailable = 0;
    }

    /**
     * Pushes data into the buffer.
     * @param data The Float32Array data to push.
     * @returns The number of frames actually written.
     */
    push(data: Float32Array): number {
        if (data.length === 0) {
            // eslint-disable-next-line no-console
            console.warn('RingBuffer: No data to push - data array is empty');
            return 0;
        }

        // Check if we're trying to write more data than the buffer can hold
        if (data.length > this.length) {
            throw new Error(`Cannot push ${data.length} frames into a buffer with capacity ${this.length}`);
        }

        const framesToWrite = Math.min(data.length, this.length);

        // If we need to overwrite data, adjust the read pointer
        if (framesToWrite > (this.length - this.framesAvailable)) {
            // Calculate how many frames we need to discard
            const framesToDiscard = framesToWrite - (this.length - this.framesAvailable);
            this.readIndex = (this.readIndex + framesToDiscard) % this.length;

            // eslint-disable-next-line no-console
            console.warn('RingBuffer: Overflow detected - overwriting oldest data');
        }

        // Update available frames (capped at buffer length)
        this.framesAvailable = Math.min(this.length, this.framesAvailable + framesToWrite);

        // Handle the case where we need to wrap around the buffer
        if (this.writeIndex + framesToWrite > this.length) {
            // Write the first part up to the end of the buffer
            const firstPartLength = this.length - this.writeIndex;
            this.buffer.set(data.subarray(0, firstPartLength), this.writeIndex);

            // Write the second part at the beginning of the buffer
            const secondPartLength = framesToWrite - firstPartLength;
            if (secondPartLength > 0) {
                this.buffer.set(data.subarray(firstPartLength, firstPartLength + secondPartLength), 0);
            }

            this.writeIndex = secondPartLength;
        } else {
            // Simple case: no wrap-around needed
            this.buffer.set(data.subarray(0, framesToWrite), this.writeIndex);
            this.writeIndex = (this.writeIndex + framesToWrite) % this.length;
        }

        return framesToWrite;
    }

    /**
     * Pulls data from the buffer into the provided destination array.
     * @param destination The Float32Array to pull data into.
     * @returns The number of frames actually read.
     */
    pull(destination: Float32Array): number {
        if (destination.length === 0) {
            // eslint-disable-next-line no-console
            console.warn('RingBuffer: No data to pull - destination array is empty');
            return 0;
        }

        if (this.framesAvailable < destination.length) {
            // eslint-disable-next-line no-console
            console.warn('RingBuffer: Underflow detected - not enough data available to read', this.framesAvailable);
            return 0;
        }

        const framesToRead = Math.min(destination.length, this.framesAvailable);

        // Handle the case where we need to wrap around the buffer
        if (this.readIndex + framesToRead > this.length) {
            // Read the first part up to the end of the buffer
            const firstPartLength = this.length - this.readIndex;
            destination.set(this.buffer.subarray(this.readIndex, this.length), 0);

            // Read the second part from the beginning of the buffer
            const secondPartLength = framesToRead - firstPartLength;
            if (secondPartLength > 0) {
                destination.set(this.buffer.subarray(0, secondPartLength), firstPartLength);
            }

            this.readIndex = secondPartLength;
        } else {
            // Simple case: no wrap-around needed
            destination.set(this.buffer.subarray(this.readIndex, this.readIndex + framesToRead), 0);
            this.readIndex = (this.readIndex + framesToRead) % this.length;
        }

        this.framesAvailable -= framesToRead;
        return framesToRead;
    }
}

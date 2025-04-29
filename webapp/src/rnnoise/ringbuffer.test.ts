// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import RingBuffer from './ringbuffer';

describe('RingBuffer', () => {
    describe('constructor', () => {
        test('creates buffer with specified length', () => {
            const buffer = new RingBuffer(1024);
            expect(buffer.capacity).toBe(1024);
            expect(buffer.availableFrames).toBe(0);
        });

        test('uses provided backing buffer', () => {
            const backingBuffer = new Float32Array(2048);
            const buffer = new RingBuffer(1024, backingBuffer);
            expect(buffer.capacity).toBe(1024);
            expect(buffer.availableFrames).toBe(0);
        });

        test('throws error if backing buffer is too small', () => {
            const backingBuffer = new Float32Array(512);
            expect(() => new RingBuffer(1024, backingBuffer)).toThrow();
        });
    });

    describe('push', () => {
        test('returns 0 for empty input', () => {
            const buffer = new RingBuffer(1024);
            const written = buffer.push(new Float32Array(0));
            expect(written).toBe(0);
            expect(buffer.availableFrames).toBe(0);
        });

        test('writes data to buffer', () => {
            const buffer = new RingBuffer(1024);
            const data = new Float32Array([1, 2, 3, 4, 5]);
            const written = buffer.push(data);
            expect(written).toBe(5);
            expect(buffer.availableFrames).toBe(5);
        });

        test('handles wrap-around writes', () => {
            const buffer = new RingBuffer(10);

            // Fill buffer to position 8
            buffer.push(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]));

            // Push 4 more elements, which should wrap around
            const data = new Float32Array([9, 10, 11, 12]);
            const written = buffer.push(data);
            expect(written).toBe(4);
            expect(buffer.availableFrames).toBe(10); // Buffer is now full
            expect(buffer.buffer).toEqual(new Float32Array([11, 12, 3, 4, 5, 6, 7, 8, 9, 10]));

            // Read 8 elements to verify the wrap-around
            const output = new Float32Array(8);
            buffer.pull(output);
            expect(Array.from(output)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);

            // Read the wrapped elements
            const remaining = new Float32Array(2);
            buffer.pull(remaining);
            expect(Array.from(remaining)).toEqual([11, 12]);
        });

        test('throws error when data exceeds buffer capacity', () => {
            const buffer = new RingBuffer(5);
            const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);

            expect(() => buffer.push(data)).toThrow('Cannot push 8 frames into a buffer with capacity 5');
        });

        test('overwrites oldest data when buffer is full', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const buffer = new RingBuffer(5);

            // Fill the buffer
            buffer.push(new Float32Array([1, 2, 3, 4, 5]));

            // Add more data, which should overwrite oldest data
            const written = buffer.push(new Float32Array([6, 7]));
            expect(written).toBe(2);
            expect(consoleSpy).toHaveBeenCalledWith('RingBuffer: Overflow detected - overwriting oldest data');

            // Verify the buffer now contains [3, 4, 5, 6, 7]
            const output = new Float32Array(5);
            buffer.pull(output);
            expect(Array.from(output)).toEqual([3, 4, 5, 6, 7]);

            consoleSpy.mockRestore();
        });
    });

    describe('pull', () => {
        test('returns 0 for empty destination', () => {
            const buffer = new RingBuffer(1024);
            buffer.push(new Float32Array([1, 2, 3]));

            const read = buffer.pull(new Float32Array(0));
            expect(read).toBe(0);
            expect(buffer.availableFrames).toBe(3);
        });

        test('returns 0 and warns when buffer is empty', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const buffer = new RingBuffer(1024);
            const destination = new Float32Array(10);

            const read = buffer.pull(destination);
            expect(read).toBe(0);
            expect(consoleSpy).toHaveBeenCalledWith('RingBuffer: Underflow detected - not enough data available to read', 0);

            consoleSpy.mockRestore();
        });

        test('reads data from buffer', () => {
            const buffer = new RingBuffer(1024);
            const data = new Float32Array([1, 2, 3, 4, 5]);
            buffer.push(data);

            const output = new Float32Array(5);
            const read = buffer.pull(output);

            expect(read).toBe(5);
            expect(Array.from(output)).toEqual([1, 2, 3, 4, 5]);
            expect(buffer.availableFrames).toBe(0);
        });

        test('handles partial reads', () => {
            const buffer = new RingBuffer(1024);
            const data = new Float32Array([1, 2, 3, 4, 5]);
            buffer.push(data);

            const output = new Float32Array(3);
            const read = buffer.pull(output);

            expect(read).toBe(3);
            expect(Array.from(output)).toEqual([1, 2, 3]);
            expect(buffer.availableFrames).toBe(2);

            // Read the rest
            const remaining = new Float32Array(2);
            buffer.pull(remaining);
            expect(Array.from(remaining)).toEqual([4, 5]);
            expect(buffer.availableFrames).toBe(0);
        });

        test('warns on partial underflow, but should not pull', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const buffer = new RingBuffer(1024);
            buffer.push(new Float32Array([1, 2, 3]));

            const output = new Float32Array(5);
            const read = buffer.pull(output);
            expect(read).toBe(0);

            expect(consoleSpy).toHaveBeenCalledWith('RingBuffer: Underflow detected - not enough data available to read', 3);

            consoleSpy.mockRestore();
        });

        test('handles wrap-around reads', () => {
            const buffer = new RingBuffer(10);

            // Fill buffer
            buffer.push(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));

            // Read 6 elements to move read pointer
            buffer.pull(new Float32Array(6));

            // Push 6 more elements, which will wrap around
            buffer.push(new Float32Array([11, 12, 13, 14, 15, 16]));

            // Read all available data (should be 10 elements)
            const output = new Float32Array(10);
            const read = buffer.pull(output);

            expect(read).toBe(10);
            expect(Array.from(output)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
            expect(buffer.availableFrames).toBe(0);
        });
    });

    describe('clear', () => {
        test('resets buffer state', () => {
            const buffer = new RingBuffer(1024);
            buffer.push(new Float32Array([1, 2, 3, 4, 5]));
            expect(buffer.availableFrames).toBe(5);

            buffer.clear();
            expect(buffer.availableFrames).toBe(0);

            // Verify buffer is usable after clear
            buffer.push(new Float32Array([6, 7, 8]));
            expect(buffer.availableFrames).toBe(3);

            const output = new Float32Array(3);
            buffer.pull(output);
            expect(Array.from(output)).toEqual([6, 7, 8]);
        });
    });

    describe('overflow scenarios', () => {
        test('handles partial overflow by overwriting oldest data', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const buffer = new RingBuffer(5);

            // Add initial data
            buffer.push(new Float32Array([1, 2, 3]));

            // Add more data than remaining space (2 slots available, adding 4 items)
            const written = buffer.push(new Float32Array([4, 5, 6, 7]));
            expect(written).toBe(4);
            expect(consoleSpy).toHaveBeenCalledWith('RingBuffer: Overflow detected - overwriting oldest data');

            // Verify the buffer now contains [3, 4, 5, 6, 7]
            const output = new Float32Array(5);
            buffer.pull(output);
            expect(Array.from(output)).toEqual([3, 4, 5, 6, 7]);

            consoleSpy.mockRestore();
        });
    });

    describe('complex scenarios', () => {
        test('multiple push-pull cycles with wrap-around', () => {
            const buffer = new RingBuffer(10);

            // Cycle 1
            buffer.push(new Float32Array([1, 2, 3, 4]));
            expect(buffer.availableFrames).toBe(4);

            let output = new Float32Array(2);
            buffer.pull(output);
            expect(Array.from(output)).toEqual([1, 2]);
            expect(buffer.availableFrames).toBe(2);

            // Cycle 2
            buffer.push(new Float32Array([5, 6, 7, 8]));
            expect(buffer.availableFrames).toBe(6);

            output = new Float32Array(4);
            buffer.pull(output);
            expect(Array.from(output)).toEqual([3, 4, 5, 6]);
            expect(buffer.availableFrames).toBe(2);

            // Cycle 3 - this will cause wrap-around
            buffer.push(new Float32Array([9, 10, 11, 12, 13, 14, 15, 16]));
            expect(buffer.availableFrames).toBe(10);

            output = new Float32Array(10);
            buffer.pull(output);
            expect(Array.from(output)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
            expect(buffer.availableFrames).toBe(0);
        });

        test('push after wrap-around', () => {
            const buffer = new RingBuffer(8);

            // Fill buffer
            buffer.push(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]));

            // Read half
            buffer.pull(new Float32Array(4));

            // Push more data (causes wrap)
            buffer.push(new Float32Array([9, 10, 11, 12]));
            expect(buffer.buffer).toEqual(new Float32Array([9, 10, 11, 12, 5, 6, 7, 8]));

            // Push even more data
            buffer.push(new Float32Array([13, 14]));
            expect(buffer.buffer).toEqual(new Float32Array([9, 10, 11, 12, 13, 14, 7, 8]));

            // Read all
            const output = new Float32Array(8);
            buffer.pull(output);
            expect(Array.from(output)).toEqual([7, 8, 9, 10, 11, 12, 13, 14]);
        });
    });
});

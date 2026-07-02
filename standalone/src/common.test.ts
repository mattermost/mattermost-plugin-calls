// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    getToken,
} from './common';

describe('getToken', () => {
    const realLocation = window.location;

    const setLocation = (props: { search?: string; hash?: string }) => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: {search: '', hash: '', ...props},
        });
    };

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: realLocation,
        });
    });

    // Mirrors the server side: standard base64 of the JSON payload with the
    // characters made URL safe ('+' -> '-', '/' -> '_').
    const encodeToken = (payload: unknown) => {
        const std = btoa(JSON.stringify(payload));
        return std.replace(/\+/g, '-').replace(/\//g, '_');
    };

    it('returns an empty string when there is no hash', () => {
        setLocation({hash: ''});
        expect(getToken()).toBe('');
    });

    it('decodes the token from a url-safe base64 hash', () => {
        setLocation({hash: `#${encodeToken({token: 'super-secret'})}`});
        expect(getToken()).toBe('super-secret');
    });

    it('returns an empty string when the payload has no token field', () => {
        setLocation({hash: `#${encodeToken({foo: 'bar'})}`});
        expect(getToken()).toBe('');
    });

    it('handles payloads whose base64 contains url-unsafe characters', () => {
    // This particular value base64-encodes to a string containing both
    // '+' and '/', exercising the url-safe replacement on decode.
        const payload = {token: '<<???>>ÿþ'};
        const encoded = encodeToken(payload);
        expect(encoded).toMatch(/[-_]/);
        setLocation({hash: `#${encoded}`});
        expect(getToken()).toBe(payload.token);
    });
});

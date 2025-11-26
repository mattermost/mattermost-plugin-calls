// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// TypeScript definitions for the experimental Translation API
// See: https://developer.mozilla.org/en-US/docs/Web/API/Translator

export type TranslatorAvailability = 'readily' | 'after-download' | 'no';

export interface TranslatorCreateOptions {
    sourceLanguage: string;
    targetLanguage: string;
}

export interface Translator {
    sourceLanguage: string;
    targetLanguage: string;
    inputQuota: number;
    translate(text: string): Promise<string>;
    translateStreaming(text: string): ReadableStream<string>;
    measureInputUsage(text: string): Promise<number>;
    destroy(): void;
}

export interface TranslatorStatic {
    create(options: TranslatorCreateOptions): Promise<Translator>;
    availability(options: TranslatorCreateOptions): Promise<TranslatorAvailability>;
}

declare global {
    interface Window {
        Translator?: TranslatorStatic;
        translation?: {
            createTranslator(options: TranslatorCreateOptions): Promise<Translator>;
            canTranslate(options: TranslatorCreateOptions): Promise<TranslatorAvailability>;
        };
    }
}

export {};


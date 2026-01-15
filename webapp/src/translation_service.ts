// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {logDebug, logErr, logWarn} from 'src/log';
import type {Translator, TranslatorAvailability} from 'src/types/translation';

/**
 * TranslationService manages browser-native translation for live captions.
 * Uses the experimental Translation API available in Chrome/Edge 130+
 * See: https://developer.mozilla.org/en-US/docs/Web/API/Translator
 */
class TranslationService {
    private translators: Map<string, Translator> = new Map();
    private translationCache: Map<string, string> = new Map();
    private readonly CACHE_MAX_SIZE = 1000; // Limit cache size
    private supported: boolean | null = null;

    /**
     * Check if the browser supports the Translation API
     */
    async isSupported(): Promise<boolean> {
        if (this.supported !== null) {
            return this.supported;
        }

        // Check for Translation API support
        // The API is available at window.Translator (Chrome 130+) or window.translation
        this.supported = !!(window.Translator || window.translation);
        
        if (!this.supported) {
            logDebug('Translation API not supported in this browser');
        }

        return this.supported;
    }

    /**
     * Check if translation is available for a language pair
     */
    async checkAvailability(sourceLanguage: string, targetLanguage: string): Promise<TranslatorAvailability> {
        if (!await this.isSupported()) {
            return 'no';
        }

        try {
            // Use the standard API if available
            if (window.Translator?.availability) {
                return await window.Translator.availability({sourceLanguage, targetLanguage});
            }

            // Fallback to translation.canTranslate if available
            if (window.translation?.canTranslate) {
                return await window.translation.canTranslate({sourceLanguage, targetLanguage});
            }

            return 'no';
        } catch (err) {
            logErr('Error checking translation availability', err);
            return 'no';
        }
    }

    /**
     * Get or create a translator for a language pair
     */
    private async getTranslator(sourceLanguage: string, targetLanguage: string): Promise<Translator | null> {
        const key = `${sourceLanguage}-${targetLanguage}`;

        // Return existing translator if available
        if (this.translators.has(key)) {
            return this.translators.get(key)!;
        }

        // Check if translation is available
        const availability = await this.checkAvailability(sourceLanguage, targetLanguage);
        if (availability === 'no') {
            logWarn(`Translation not available for ${sourceLanguage} -> ${targetLanguage}`);
            return null;
        }

        try {
            let translator: Translator | null = null;

            // Try standard API first
            if (window.Translator?.create) {
                translator = await window.Translator.create({sourceLanguage, targetLanguage});
            } else if (window.translation?.createTranslator) {
                translator = await window.translation.createTranslator({sourceLanguage, targetLanguage});
            }

            if (translator) {
                this.translators.set(key, translator);
                logDebug(`Created translator for ${sourceLanguage} -> ${targetLanguage}`);
                
                // Download model if needed
                if (availability === 'after-download') {
                    logDebug(`Translation model for ${sourceLanguage} -> ${targetLanguage} downloading...`);
                }
            }

            return translator;
        } catch (err) {
            logErr(`Failed to create translator for ${sourceLanguage} -> ${targetLanguage}`, err);
            return null;
        }
    }

    /**
     * Translate text from source language to target language
     */
    async translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string | null> {
        // Return original if no translation needed
        if (!text || sourceLanguage === targetLanguage) {
            return text;
        }

        // Check cache first
        const cacheKey = `${sourceLanguage}-${targetLanguage}:${text}`;
        if (this.translationCache.has(cacheKey)) {
            return this.translationCache.get(cacheKey)!;
        }

        // Get translator
        const translator = await this.getTranslator(sourceLanguage, targetLanguage);
        if (!translator) {
            return null; // Translation not available
        }

        try {
            const translated = await translator.translate(text);
            
            // Cache the result
            this.translationCache.set(cacheKey, translated);
            
            // Limit cache size
            if (this.translationCache.size > this.CACHE_MAX_SIZE) {
                const iterator = this.translationCache.keys();
                const firstKeyResult = iterator.next();
                if (!firstKeyResult.done && firstKeyResult.value) {
                    this.translationCache.delete(firstKeyResult.value);
                }
            }

            return translated;
        } catch (err) {
            logErr('Translation failed', err);
            return null;
        }
    }

    /**
     * Clear all translators and cache
     */
    cleanup() {
        // Destroy all translators
        for (const translator of this.translators.values()) {
            try {
                translator.destroy();
            } catch (err) {
                logErr('Error destroying translator', err);
            }
        }
        
        this.translators.clear();
        this.translationCache.clear();
        logDebug('Translation service cleaned up');
    }

    /**
     * Clear cache for a specific language pair
     */
    clearCacheForLanguagePair(sourceLanguage: string, targetLanguage: string) {
        const prefix = `${sourceLanguage}-${targetLanguage}:`;
        const keysToDelete: string[] = [];
        for (const key of this.translationCache.keys()) {
            if (key.startsWith(prefix)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach((key) => this.translationCache.delete(key));
    }
}

// Singleton instance
const translationService = new TranslationService();

export default translationService;


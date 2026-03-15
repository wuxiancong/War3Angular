import { Injectable } from '@angular/core';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

declare const GEMINI_API_KEY: string;
declare const GEMINI_API_KEYS: string;

@Injectable({
  providedIn: 'root'
})
export class AIService {
  private keys: string[] = [];
  private currentKeyIndex = 0;

  constructor() {
    this.initializeKeys();
  }

  private initializeKeys() {
    let rawKeys = '';
    
    // Try to get keys from GEMINI_API_KEYS (comma separated)
    if (typeof GEMINI_API_KEYS !== 'undefined' && GEMINI_API_KEYS) {
      rawKeys = GEMINI_API_KEYS;
    }
    
    const processRawKeys = (input: string) => {
      if (!input) return [];
      // Remove any surrounding quotes and potential double-escaped quotes
      const clean = input.trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/^["']|["']$/g, '');
      
      let splitKeys = clean.split(',').map(k => k.trim()).filter(k => !!k);
      
      // Double check: if we only have 1 key but it contains AIzaSy multiple times, 
      // it means the shell might have messed up the initial split
      if (splitKeys.length === 1 && (splitKeys[0].match(/AIzaSy/g) || []).length > 1) {
        const secondarySplit = splitKeys[0].split(/[ ,;|\t\n\r]+/).filter(k => k.includes('AIzaSy'));
        if (secondarySplit.length > 1) {
          splitKeys = secondarySplit;
        }
      }

      // Final sanitization: Remove any non-alphanumeric characters (except - and _) 
      // and ensure it starts with the expected prefix
      return splitKeys
        .map(k => k.replace(/[^a-zA-Z0-9_-]/g, ''))
        .filter(k => k.length > 20 && k.startsWith('AIzaSy'));
    };

    if (rawKeys) {
      this.keys = processRawKeys(rawKeys);
      console.log(`AI Service: Parsed ${this.keys.length} keys from GEMINI_API_KEYS.`);
    }
    
    // Fallback to single GEMINI_API_KEY if keys array is empty
    if (this.keys.length === 0 && typeof GEMINI_API_KEY !== 'undefined' && GEMINI_API_KEY) {
      this.keys = processRawKeys(GEMINI_API_KEY);
      if (this.keys.length > 0) {
        console.log('AI Service: Initialized from single GEMINI_API_KEY.');
      }
    }

    if (this.keys.length === 0) {
      console.warn('AI Service: No valid Gemini API keys found! AI features will not work.');
    } else {
      console.log(`AI Service initialized with ${this.keys.length} Gemini API keys.`);
      // Debug log for first key format (safe)
      const first = this.keys[0];
      console.log(`First key check: length=${first.length}, prefix=${first.substring(0, 7)}..., suffix=...${first.substring(first.length - 3)}`);
    }
  }

  async generateGeminiResponse(prompt: string): Promise<string> {
    if (this.keys.length === 0) {
      throw new Error('Gemini API key not configured');
    }

    let attempts = 0;
    const maxAttempts = this.keys.length;
    const errors: string[] = [];

    while (attempts < maxAttempts) {
      const apiKey = this.keys[this.currentKeyIndex];
      console.log(`AI Service: Attempting request with key index ${this.currentKeyIndex} (Attempt ${attempts + 1}/${maxAttempts})`);
      
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response: GenerateContentResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
        });

        if (response.text) {
          return response.text;
        }
        throw new Error('Empty response from Gemini');
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`AI Service: Error with key index ${this.currentKeyIndex}:`, errorMsg);
        errors.push(`Key[${this.currentKeyIndex}]: ${errorMsg}`);
        
        // Switch to next key for almost any error to be resilient
        this.switchToNextKey();
        attempts++;
        
        // If we still have attempts, continue the loop
        if (attempts < maxAttempts) {
          console.warn(`AI Service: Switching to next key due to error. Remaining attempts: ${maxAttempts - attempts}`);
          continue;
        }
      }
    }

    // If we reach here, all keys failed
    const finalError = new Error(`All Gemini API keys failed (${maxAttempts} keys tried). Last error: ${errors[errors.length - 1]}`) as Error & { allErrors: string[] };
    finalError.allErrors = errors;
    throw finalError;
  }

  private switchToNextKey() {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
    console.log(`Switched to Gemini API key index: ${this.currentKeyIndex}`);
  }

  getKeysCount(): number {
    return this.keys.length;
  }
}

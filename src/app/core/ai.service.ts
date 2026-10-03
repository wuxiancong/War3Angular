import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AIService {
  async generateGeminiResponse(prompt: string): Promise<string> {
    return this.generateAIResponse('gemini', prompt);
  }

  async generateDeepSeekResponse(prompt: string): Promise<string> {
    return this.generateAIResponse('deepseek', prompt);
  }

  async generateAIResponse(model: 'gemini' | 'deepseek', prompt: string): Promise<string> {
    const response = await fetch('/api/chat.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `AI Request Failed (${response.status})`);
    }

    if (!data.reply && !data.text) {
      throw new Error('Empty response from AI server');
    }

    return data.reply || data.text;
  }

  getKeysCount(): number {
    return 1;
  }
}

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

    const rawText = await response.text();
    let data: { success?: boolean; reply?: string; text?: string; error?: string } | null = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      if (response.status === 504 || rawText.includes('504 Gateway Time-out')) {
        throw new Error('服务器连接 Google Gemini 超时 (504)。国内服务器无法直连 Google，请配置 HTTP_PROXY 代理或使用 DeepSeek 模型。');
      }
      if (response.status === 502 || response.status === 503) {
        throw new Error(`服务器网关异常 (${response.status})，请稍后重试。`);
      }
      throw new Error(`服务器返回异常 (${response.status})`);
    }

    if (!response.ok || (data && data.success === false)) {
      throw new Error(data?.error || `AI Request Failed (${response.status})`);
    }

    if (!data || (!data.reply && !data.text)) {
      throw new Error('Empty response from AI server');
    }

    const output = data.reply || data.text || '';
    if (!output) {
      throw new Error('Empty text content from AI server');
    }

    return output;
  }

  getKeysCount(): number {
    return 1;
  }
}

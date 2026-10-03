import { Component, signal, effect, ElementRef, ViewChild, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { I18nService } from '../core/i18n/i18n.service';
import { AIService } from '../core/ai.service';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  host: { class: 'flex flex-col flex-grow' },
  template: `
    <main class="flex-grow flex items-center justify-center py-6 px-4 md:px-8 bg-transparent h-full">
      <div class="w-full max-w-4xl h-[calc(100vh-240px)] min-h-[500px] max-h-[800px] flex flex-col bg-[var(--secondary)] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
        <!-- Chat Header -->
        <div class="px-6 py-5 border-b border-white/5 bg-gradient-to-r from-white/5 to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center space-x-4">
            <div class="relative">
              <div class="w-12 h-12 bg-gradient-to-br from-accent/40 to-accent/10 rounded-2xl flex items-center justify-center shadow-lg shadow-accent/10 border border-accent/20">
                <span class="material-icons text-accent">{{ chatMode() === 'ai' ? 'smart_toy' : 'support_agent' }}</span>
              </div>
              <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-[3px] border-[var(--secondary)] rounded-full"></div>
            </div>
            <div>
              <h2 class="text-lg font-black tracking-wide text-[var(--text-main)]">
                {{ chatMode() === 'ai' ? ('chat.aiMode' | t) : ('chat.humanMode' | t) }}
              </h2>
              <p class="text-xs text-green-400/80 font-medium flex items-center mt-0.5">
                <span class="w-1.5 h-1.5 bg-green-400 rounded-full mr-2 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]"></span>
                {{ 'chat.online' | t }}
              </p>
            </div>
          </div>
          
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <!-- AI Model Selection (Only visible in AI mode) -->
            @if (chatMode() === 'ai') {
              <div class="flex items-center bg-black/20 p-1 rounded-xl border border-white/5">
                <button (click)="selectedModel.set('deepseek')"
                        [class.bg-white/10]="selectedModel() === 'deepseek'"
                        [class.text-white]="selectedModel() === 'deepseek'"
                        [class.text-[var(--text-muted)]]="selectedModel() !== 'deepseek'"
                        class="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:text-white">DeepSeek</button>
                <button (click)="selectedModel.set('gemini')"
                        [class.bg-white/10]="selectedModel() === 'gemini'"
                        [class.text-white]="selectedModel() === 'gemini'"
                        [class.text-[var(--text-muted)]]="selectedModel() !== 'gemini'"
                        class="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:text-white">Gemini</button>
              </div>
            }

            <!-- AI/Human Toggle -->
            <div class="flex bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner">
              <button (click)="chatMode.set('ai')"
                      [class.bg-accent]="chatMode() === 'ai'"
                      [class.text-white]="chatMode() === 'ai'"
                      [class.text-[var(--text-muted)]]="chatMode() !== 'ai'"
                      class="px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm">
                <span class="material-icons text-[16px]">smart_toy</span>
                {{ 'chat.aiMode' | t }}
              </button>
              <button (click)="chatMode.set('human')"
                      [class.bg-accent]="chatMode() === 'human'"
                      [class.text-white]="chatMode() === 'human'"
                      [class.text-[var(--text-muted)]]="chatMode() !== 'human'"
                      class="px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm">
                <span class="material-icons text-[16px]">person</span>
                {{ 'chat.humanMode' | t }}
              </button>
            </div>
          </div>
        </div>

        <!-- Messages Area -->
        <div #scrollContainer class="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar">
          @for (msg of messages(); track msg.id) {
            <div class="flex" [ngClass]="msg.sender === 'user' ? 'justify-end' : 'justify-start'">
              <div class="max-w-[80%] flex flex-col" [ngClass]="msg.sender === 'user' ? 'items-end' : 'items-start'">
                <div 
                  class="px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                  [ngClass]="msg.sender === 'user' ? 'bg-accent text-white rounded-tr-none' : 'bg-white/5 text-[var(--text-main)] rounded-tl-none border border-white/5'"
                >
                  {{ msg.text }}
                </div>
                <span class="text-[10px] text-[var(--text-muted)] mt-1 uppercase tracking-widest">
                  {{ msg.timestamp | date:'HH:mm' }}
                </span>
              </div>
            </div>
          }
          
          @if (isTyping()) {
            <div class="flex justify-start">
              <div class="bg-white/5 px-4 py-3 rounded-2xl rounded-tl-none border border-white/5">
                <div class="flex space-x-1">
                  <div class="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce"></div>
                  <div class="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div class="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
              </div>
            </div>
          }
        </div>

        <!-- Input Area -->
        <div class="p-6 border-t border-white/5 bg-white/5">
          <form (submit)="sendMessage($event)" class="flex items-center space-x-4">
            <div class="flex-grow relative">
              <input 
                type="text" 
                [(ngModel)]="newMessage" 
                name="message"
                [placeholder]="'chat.inputPlaceholder' | t"
                class="w-full bg-[var(--primary)] border border-white/10 rounded-2xl px-6 py-4 text-[var(--text-main)] outline-none focus:border-accent/50 transition-all pr-12"
              />
              <button type="button" class="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-accent transition-colors">
                <span class="material-icons">sentiment_satisfied_alt</span>
              </button>
            </div>
            <button 
              type="submit" 
              [disabled]="!newMessage.trim() || isTyping()"
              class="bg-accent text-white w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
            >
              <span class="material-icons">send</span>
            </button>
          </form>
        </div>
      </div>
    </main>
  `
})
export class ChatComponent {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  private i18n = inject(I18nService);
  private aiService = inject(AIService);
  private platformId = inject(PLATFORM_ID);

  chatMode = signal<'ai' | 'human'>('ai');
  selectedModel = signal<'deepseek' | 'gemini'>('deepseek');
  
  messages = signal<Message[]>([
    {
      id: 1,
      text: this.i18n.t('chat.welcome'),
      sender: 'agent',
      timestamp: new Date()
    }
  ]);

  newMessage = '';
  isTyping = signal(false);

  constructor() {
    effect(() => {
      if (this.messages()) {
        setTimeout(() => this.scrollToBottom(), 100);
      }
    });
  }

  async sendMessage(event: Event) {
    event.preventDefault();
    if (!this.newMessage.trim() || this.isTyping()) return;

    const userText = this.newMessage;
    const userMsg: Message = {
      id: Date.now(),
      text: userText,
      sender: 'user',
      timestamp: new Date()
    };

    this.messages.update(prev => [...prev, userMsg]);
    this.newMessage = '';

    if (this.chatMode() === 'ai') {
      await this.generateAIResponse(userText);
    } else {
      this.simulateHumanResponse();
    }
  }

  private async generateAIResponse(userText: string) {
    if (!isPlatformBrowser(this.platformId)) return;
    this.isTyping.set(true);
    try {
      const systemInstruction = this.i18n.t('chat.systemInstruction');
      const prompt = `${systemInstruction}\n\n玩家提问：${userText}`;
      
      const text = await this.aiService.generateAIResponse(this.selectedModel(), prompt);

      const agentMsg: Message = {
        id: Date.now(),
        text: text,
        sender: 'agent',
        timestamp: new Date()
      };
      this.messages.update(prev => [...prev, agentMsg]);
    } catch (error: unknown) {
      console.error('AI Chat Error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      
      let displayMsg = this.i18n.t('aiError.default');
      
      // Check for "All keys failed" first as it's the most specific
      if (msg.includes('All Gemini API keys failed') || msg.includes('All Gemini API keys have exhausted')) {
        displayMsg = this.i18n.t('aiError.allKeysFailed')
          .replace('{n}', this.aiService.getKeysCount().toString())
          .replace('{msg}', msg);
      } else if (msg.includes('not configured')) {
        displayMsg = `${this.i18n.t('aiError.notConfigured')}\n${msg}`;
      } else if (msg.includes('API key not valid') || msg.includes('INVALID_ARGUMENT')) {
        displayMsg = this.i18n.t('aiError.invalidKey').replace('{msg}', msg);
      } else if (msg.includes('Insufficient Balance')) {
        displayMsg = this.i18n.t('aiError.insufficientBalance');
      } else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        displayMsg = this.i18n.t('aiError.quotaExhausted');
      } else if (msg.includes('fetch') || msg.includes('Failed to fetch')) {
        displayMsg = this.i18n.t('aiError.networkError');
      } else {
        displayMsg = `${this.i18n.t('aiError.default')}\n${msg}`;
      }
      
      const errorMsg: Message = {
        id: Date.now(),
        text: displayMsg,
        sender: 'agent',
        timestamp: new Date()
      };
      this.messages.update(prev => [...prev, errorMsg]);
    } finally {
      this.isTyping.set(false);
    }
  }

  private simulateHumanResponse() {
    this.isTyping.set(true);
    setTimeout(() => {
      const agentMsg: Message = {
        id: Date.now(),
        text: this.i18n.t('chat.humanWelcome'),
        sender: 'agent',
        timestamp: new Date()
      };
      this.messages.update(prev => [...prev, agentMsg]);
      this.isTyping.set(false);
    }, 2000);
  }

  private scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch {
      // Ignore scroll errors
    }
  }
}

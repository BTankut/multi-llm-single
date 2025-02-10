import * as vscode from 'vscode';
import fetch, { RequestInit, Response } from 'node-fetch';
import { window } from 'vscode';
import { StreamOptions, OpenRouterModel } from '../types';

interface OpenRouterModelsResponse {
    data: OpenRouterModel[];
}

interface OpenRouterError {
    error: {
        message: string;
        type: string;
        param: string;
        code: string;
    };
    data?: {
        models?: {
            id: string;
            name: string;
        }[];
    }[];
}

interface ReadableStreamDefaultReader<R = any> {
    read(): Promise<ReadableStreamDefaultReadResult<R>>;
    releaseLock(): void;
    cancel(reason?: any): Promise<void>;
    closed: Promise<void>;
}

interface ReadableStreamDefaultReadResult<T> {
    done: boolean;
    value: T | undefined;
}

interface CustomReadableStream<R = any> {
    getReader(): ReadableStreamDefaultReader<R>;
    cancel(reason?: any): Promise<void>;
}

interface ChatMessage {
    role: string;
    content: string;
}

export class OpenRouterService {
    private readonly API_URL = 'https://openrouter.ai/api/v1';
    private readonly API_KEY_SECRET = 'openrouter-api-key';
    private readonly SELECTED_MODEL_KEY = 'selected-model';
    private readonly DEFAULT_MODEL = 'openai/gpt-3.5-turbo';
    private readonly _outputChannel: vscode.OutputChannel;
    private readonly secrets: vscode.SecretStorage;
    private readonly storage: vscode.Memento;

    constructor(secrets: vscode.SecretStorage, storage: vscode.Memento) {
        this._outputChannel = vscode.window.createOutputChannel('Multi LLM Single Chat');
        this.secrets = secrets;
        this.storage = storage;
    }

    private log(message: string) {
        this._outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }

    public async getApiKey(): Promise<string | undefined> {
        return await this.secrets.get(this.API_KEY_SECRET);
    }

    public async setApiKey(apiKey: string): Promise<void> {
        await this.secrets.store(this.API_KEY_SECRET, apiKey);
    }

    public async getSelectedModel(): Promise<string> {
        const model = await this.storage.get<string>(this.SELECTED_MODEL_KEY);
        return model || this.DEFAULT_MODEL;
    }

    public async setSelectedModel(modelId: string): Promise<void> {
        await this.storage.update(this.SELECTED_MODEL_KEY, modelId);
    }

    async saveApiKey(apiKey: string): Promise<void> {
        try {
            await this.secrets.store(this.API_KEY_SECRET, apiKey);
            this.log('API anahtarı başarıyla kaydedildi');
        } catch (error) {
            this.log(`API anahtarı kaydedilirken hata: ${error}`);
            throw error;
        }
    }

    async testApiKey(apiKey: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.API_URL}/models`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/btankut/multi-llm-single',
                    'X-Title': 'VS Code Extension'
                }
            });

            if (!response.ok) {
                throw new Error(`API hatası: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return true;
        } catch (error) {
            this.log(`API anahtarı test edilirken hata: ${error}`);
            throw error;
        }
    }

    async listModels(): Promise<OpenRouterModel[]> {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            throw new Error('API anahtarı bulunamadı');
        }

        try {
            const response = await fetch(`${this.API_URL}/models`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/btankut/multi-llm-single',
                    'X-Title': 'VS Code Extension'
                }
            });

            if (!response.ok) {
                throw new Error(`API hatası: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as OpenRouterModelsResponse;
            return data.data;
        } catch (error) {
            this.log(`Model listesi alınırken hata: ${error}`);
            throw error;
        }
    }

    private async handleApiError(error: any): Promise<never> {
        this._outputChannel.appendLine('\n=== API Hatası Detayları ===');
        this._outputChannel.appendLine(`Zaman: ${new Date().toISOString()}`);

        let errorMessage = 'Bilinmeyen hata';
        let errorDetails: any;

        try {
            if (error.response) {
                const status = error.response.status;
                this._outputChannel.appendLine(`HTTP Durum Kodu: ${status}`);

                // Response body'yi text olarak al
                const responseText = await error.response.text();
                this._outputChannel.appendLine('Ham API Yanıtı:');
                this._outputChannel.appendLine(responseText);

                // JSON parse etmeyi dene
                try {
                    errorDetails = JSON.parse(responseText);
                    this._outputChannel.appendLine('İşlenmiş API Yanıtı:');
                    this._outputChannel.appendLine(JSON.stringify(errorDetails, null, 2));

                    // OpenRouter'ın hata mesajını al
                    if (errorDetails.error?.message) {
                        errorMessage = errorDetails.error.message;
                    }
                } catch (e) {
                    this._outputChannel.appendLine('API yanıtı JSON olarak işlenemedi');
                }

                // HTTP durum koduna göre özel mesajlar
                switch (status) {
                    case 403:
                        if (errorMessage.includes('Tier 3')) {
                            return Promise.reject(new Error(
                                'Bu model için daha yüksek seviye API anahtarı gerekiyor. ' +
                                'Lütfen şu modellerden birini deneyin:\n' +
                                '- google/gemini-pro\n' +
                                '- openai/gpt-3.5-turbo\n' +
                                '- anthropic/claude-instant-v1\n\n' +
                                'Veya OpenRouter API anahtarınızı yükseltin: https://openrouter.ai/settings/integrations'
                            ));
                        }
                        return Promise.reject(new Error(`API erişim hatası: ${errorMessage}`));
                    case 401:
                        return Promise.reject(new Error('API anahtarı geçersiz. Lütfen ayarlardan geçerli bir API anahtarı girin.'));
                    case 429:
                        return Promise.reject(new Error('Çok fazla istek gönderildi. Lütfen biraz bekleyin ve tekrar deneyin.'));
                    case 500:
                        return Promise.reject(new Error('OpenRouter servisi şu anda çalışmıyor. Lütfen daha sonra tekrar deneyin.'));
                    default:
                        return Promise.reject(new Error(`API hatası (${status}): ${errorMessage}`));
                }
            } else if (error instanceof Error) {
                this._outputChannel.appendLine(`Hata Türü: ${error.name}`);
                this._outputChannel.appendLine(`Hata Mesajı: ${error.message}`);
                if (error.stack) {
                    this._outputChannel.appendLine('Stack Trace:');
                    this._outputChannel.appendLine(error.stack);
                }

                // Ağ bağlantı hataları
                if (error.name === 'FetchError' || error.message.includes('fetch')) {
                    return Promise.reject(new Error('API\'ye bağlanılamıyor. Lütfen internet bağlantınızı kontrol edin.'));
                }

                return Promise.reject(error);
            }
        } catch (e) {
            this._outputChannel.appendLine('Hata işlenirken beklenmeyen bir durum oluştu:');
            this._outputChannel.appendLine(e instanceof Error ? e.stack || e.message : String(e));
        }

        // Genel hata durumu
        return Promise.reject(new Error(`Bir hata oluştu: ${errorMessage}`));
    }

    private async *streamResponse(response: Response): AsyncGenerator<string, void, unknown> {
        if (!response.body) {
            throw new Error('Response body is null');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
            for await (const chunk of response.body) {
                if (Buffer.isBuffer(chunk)) {
                    buffer += decoder.decode(new Uint8Array(chunk));
                } else {
                    buffer += chunk.toString();
                }

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.trim() === 'data: [DONE]') return;

                    try {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6);
                            const json = JSON.parse(jsonStr);
                            if (json.choices?.[0]?.delta?.content) {
                                yield json.choices[0].delta.content;
                            }
                        }
                    } catch (error) {
                        console.error('JSON parse hatası:', error);
                        console.error('Problematik satır:', line);
                    }
                }
            }

            if (buffer) {
                try {
                    if (buffer.startsWith('data: ')) {
                        const jsonStr = buffer.slice(6);
                        const json = JSON.parse(jsonStr);
                        if (json.choices?.[0]?.delta?.content) {
                            yield json.choices[0].delta.content;
                        }
                    }
                } catch (error) {
                    console.error('Son buffer parse hatası:', error);
                }
            }
        } catch (error) {
            console.error('Stream okuma hatası:', error);
            throw error;
        }
    }

    public async *streamChat(messages: ChatMessage[]): AsyncGenerator<string, void, unknown> {
        const selectedModel = await this.getSelectedModel();
        console.log('Seçili model:', selectedModel);

        const apiKey = await this.getApiKey();
        if (!apiKey) {
            console.error('API anahtarı bulunamadı');
            throw new Error('API anahtarı bulunamadı');
        }

        console.log('API isteği gönderiliyor...');
        console.log('Model:', selectedModel);
        console.log('Mesajlar:', messages);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'Multi LLM Single'
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: messages,
                stream: true
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API hatası:', response.status, errorText);
            throw new Error(`HTTP hatası! Durum: ${response.status}`);
        }

        console.log('API yanıtı alındı, stream başlıyor...');
        yield* this.streamResponse(response);
    }
}

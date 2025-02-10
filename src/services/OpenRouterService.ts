import * as vscode from 'vscode';
import fetch, { RequestInit } from 'node-fetch';
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

export class OpenRouterService {
    private readonly API_URL = 'https://openrouter.ai/api/v1';
    private readonly API_KEY_SECRET = 'openrouter-api-key';
    private readonly MODEL_KEY = 'openrouter-selected-model';
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

    async getApiKey(): Promise<string | undefined> {
        return this.secrets.get(this.API_KEY_SECRET);
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

    async getSelectedModel(): Promise<string | undefined> {
        return this.storage.get(this.MODEL_KEY);
    }

    async setSelectedModel(modelId: string): Promise<void> {
        try {
            await this.storage.update(this.MODEL_KEY, modelId);
            this.log(`Model başarıyla güncellendi: ${modelId}`);
        } catch (error) {
            this.log(`Model güncellenirken hata: ${error}`);
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

    public async sendMessageStream(
        message: string,
        options: {
            stream: boolean;
            signal?: RequestInit['signal'];
            onToken?: (token: string) => void;
            onError?: (error: Error) => void;
        }
    ): Promise<void> {
        try {
            const apiKey = await this.getApiKey();
            if (!apiKey) {
                throw new Error('API anahtarı bulunamadı. Lütfen ayarlardan bir API anahtarı girin.');
            }

            const selectedModel = await this.getSelectedModel();
            if (!selectedModel) {
                throw new Error('Model seçilmedi. Lütfen bir model seçin.');
            }

            this._outputChannel.appendLine(`İstek gönderiliyor - Model: ${selectedModel}`);
            this._outputChannel.appendLine(`Mesaj: ${message}`);

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/btk/multi-llm-single',
                    'X-Title': 'Multi LLM Single'
                },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: [{ role: 'user', content: message }],
                    stream: options.stream
                }),
                signal: options.signal
            });

            this._outputChannel.appendLine(`API yanıt durumu: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                await this.handleApiError({ response });
            }

            if (!response.body) {
                throw new Error('API yanıt vermedi');
            }

            return new Promise((resolve, reject) => {
                let buffer = '';
                const decoder = new TextDecoder();

                response.body.on('data', (chunk: Buffer) => {
                    try {
                        const text = decoder.decode(chunk);
                        buffer += text;

                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (line.trim() === '') continue;
                            if (!line.startsWith('data: ')) continue;

                            const data = line.slice(6);
                            if (data === '[DONE]') continue;

                            try {
                                const parsed = JSON.parse(data);
                                const token = parsed.choices[0]?.delta?.content || '';
                                if (token && options.onToken) {
                                    options.onToken(token);
                                }
                            } catch (error) {
                                this._outputChannel.appendLine(`Token işleme hatası: ${error}`);
                            }
                        }
                    } catch (error) {
                        this._outputChannel.appendLine(`Chunk işleme hatası: ${error}`);
                    }
                });

                response.body.on('end', () => {
                    this._outputChannel.appendLine('Stream tamamlandı');
                    resolve();
                });

                response.body.on('error', (error) => {
                    this._outputChannel.appendLine(`Stream hatası: ${error}`);
                    reject(error);
                });
            });
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                this._outputChannel.appendLine('Stream iptal edildi');
                throw error;
            }
            if (options.onError) {
                options.onError(error instanceof Error ? error : new Error(String(error)));
            }
            throw error;
        }
    }
}

import * as vscode from 'vscode';
import fetch from 'node-fetch';

interface OpenRouterModel {
    id: string;
    name: string;
    context_length: number;
    pricing: {
        prompt: string;
        completion: string;
    };
}

export class OpenRouterService {
    private readonly API_URL = 'https://openrouter.ai/api/v1';
    private readonly API_KEY_SECRET = 'openrouter-api-key';
    private readonly SELECTED_MODEL_KEY = 'openrouter-selected-model';
    private readonly MODEL_CACHE_KEY = 'openrouter-models-cache';
    private readonly MODEL_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 saat
    private readonly outputChannel: vscode.OutputChannel;

    constructor(
        private readonly secrets: vscode.SecretStorage,
        private readonly state: vscode.Memento
    ) {
        this.outputChannel = vscode.window.createOutputChannel('Multi LLM Single');
    }

    private log(message: string) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }

    public async saveApiKey(apiKey: string): Promise<void> {
        try {
            this.log('API anahtarı kaydediliyor...');
            await this.secrets.store(this.API_KEY_SECRET, apiKey);
            this.log('API anahtarı başarıyla kaydedildi');
        } catch (error) {
            this.log(`API anahtarı kaydedilemedi: ${error}`);
            throw error;
        }
    }

    public async getApiKey(): Promise<string | undefined> {
        try {
            this.log('API anahtarı alınıyor...');
            const apiKey = await this.secrets.get(this.API_KEY_SECRET);
            this.log(apiKey ? 'API anahtarı bulundu' : 'API anahtarı bulunamadı');
            return apiKey;
        } catch (error) {
            this.log(`API anahtarı alınamadı: ${error}`);
            throw error;
        }
    }

    public async testApiKey(apiKey: string): Promise<void> {
        try {
            this.log('API anahtarı test ediliyor...');
            const response = await fetch(`${this.API_URL}/models`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/btankut/multi-llm-single'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.log(`API anahtarı geçersiz: ${response.status} ${response.statusText} - ${errorText}`);
                throw new Error('API anahtarı geçersiz');
            }

            this.log('API anahtarı geçerli');
        } catch (error) {
            this.log(`API anahtarı test edilemedi: ${error}`);
            throw new Error('API anahtarı test edilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
        }
    }

    public async setSelectedModel(modelId: string): Promise<void> {
        try {
            this.log(`Model seçiliyor: ${modelId}`);
            await this.state.update(this.SELECTED_MODEL_KEY, modelId);
            this.log('Model başarıyla seçildi');
        } catch (error) {
            this.log(`Model seçilemedi: ${error}`);
            throw error;
        }
    }

    public async getSelectedModel(): Promise<string | undefined> {
        try {
            this.log('Seçili model alınıyor...');
            const modelId = this.state.get<string>(this.SELECTED_MODEL_KEY);
            this.log(modelId ? `Seçili model: ${modelId}` : 'Seçili model bulunamadı');
            return modelId;
        } catch (error) {
            this.log(`Seçili model alınamadı: ${error}`);
            throw error;
        }
    }

    public async listModels(): Promise<OpenRouterModel[]> {
        try {
            this.log('Model listesi alınıyor...');
            
            const cachedModels = this.state.get<{ timestamp: number; models: OpenRouterModel[] }>(this.MODEL_CACHE_KEY);
            if (cachedModels && Date.now() - cachedModels.timestamp < this.MODEL_CACHE_DURATION) {
                this.log('Önbellekten model listesi alındı');
                return cachedModels.models;
            }

            const apiKey = await this.getApiKey();
            if (!apiKey) {
                this.log('API anahtarı bulunamadı');
                throw new Error('API anahtarı bulunamadı');
            }

            this.log('OpenRouter API\'den modeller alınıyor...');
            const response = await fetch(`${this.API_URL}/models`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/btankut/multi-llm-single'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.log(`Model listesi alınamadı: ${response.status} ${response.statusText} - ${errorText}`);
                throw new Error('Model listesi alınamadı');
            }

            const data = await response.json() as { data: OpenRouterModel[] };
            const models = data.data;

            this.log(`${models.length} model alındı`);
            await this.state.update(this.MODEL_CACHE_KEY, {
                timestamp: Date.now(),
                models
            });

            return models;
        } catch (error) {
            this.log(`Model listesi alınamadı: ${error}`);
            throw new Error('Model listesi alınamadı: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
        }
    }

    public async sendMessage(message: string): Promise<string> {
        try {
            this.log('Mesaj gönderiliyor...');
            
            const apiKey = await this.getApiKey();
            if (!apiKey) {
                this.log('API anahtarı bulunamadı');
                throw new Error('API anahtarı bulunamadı');
            }

            const selectedModel = await this.getSelectedModel();
            if (!selectedModel) {
                this.log('Model seçilmedi');
                throw new Error('Model seçilmedi');
            }

            this.log(`Mesaj ${selectedModel} modeline gönderiliyor...`);
            const response = await fetch(`${this.API_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/btankut/multi-llm-single',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: [{ role: 'user', content: message }]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.log(`Mesaj gönderilemedi: ${response.status} ${response.statusText} - ${errorText}`);
                throw new Error('Mesaj gönderilemedi');
            }

            const data = await response.json();
            this.log('Mesaj başarıyla gönderildi');
            return data.choices[0].message.content;
        } catch (error) {
            this.log(`Mesaj gönderilemedi: ${error}`);
            throw new Error('Mesaj gönderilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
        }
    }
}

import * as vscode from 'vscode';
import fetch from 'node-fetch';

export const API_VERSION = 'v1';
const API_BASE_URL = 'https://openrouter.ai/api';
export const DEFAULT_MODEL = 'anthropic/claude-2';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 saat

export interface Model {
    id: string;
    name: string;
    description?: string;
    pricing?: {
        prompt: string;
        completion: string;
    };
    context_length: number;
    available: boolean;
}

export class OpenRouterService {
    private static readonly API_KEY_SECRET = 'openrouter-api-key';
    private static readonly SELECTED_MODEL_KEY = 'multiLLM.openRouter.model';
    private static readonly MODELS_CACHE_KEY = 'openrouter-models-cache';
    private static readonly MODELS_CACHE_TIMESTAMP_KEY = 'openrouter-models-cache-timestamp';
    
    private secretStorage: vscode.SecretStorage;
    private memento: vscode.Memento;
    private modelsCache: Model[] | null = null;
    private modelsCacheTimestamp: number | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.secretStorage = context.secrets;
        this.memento = context.globalState;
        this.loadCacheFromMemento();
    }

    private loadCacheFromMemento(): void {
        this.modelsCache = this.memento.get<Model[]>(OpenRouterService.MODELS_CACHE_KEY) || null;
        this.modelsCacheTimestamp = this.memento.get<number>(OpenRouterService.MODELS_CACHE_TIMESTAMP_KEY) || null;
    }

    private async updateCache(models: Model[]): Promise<void> {
        this.modelsCache = models;
        this.modelsCacheTimestamp = Date.now();
        await this.memento.update(OpenRouterService.MODELS_CACHE_KEY, models);
        await this.memento.update(OpenRouterService.MODELS_CACHE_TIMESTAMP_KEY, this.modelsCacheTimestamp);
    }

    private isCacheValid(): boolean {
        if (!this.modelsCache || !this.modelsCacheTimestamp) {
            return false;
        }
        const age = Date.now() - this.modelsCacheTimestamp;
        return age < CACHE_DURATION_MS;
    }

    async saveApiKey(key: string): Promise<void> {
        if (!key) {
            throw new Error('API anahtarı boş olamaz');
        }
        await this.secretStorage.store(OpenRouterService.API_KEY_SECRET, key);
    }

    async getApiKey(): Promise<string | undefined> {
        return await this.secretStorage.get(OpenRouterService.API_KEY_SECRET);
    }

    async testApiKey(key: string): Promise<void> {
        try {
            const response = await fetch(`${API_BASE_URL}/${API_VERSION}/auth/key`, {
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Geçersiz API anahtarı');
                }
                throw new Error(`API hatası: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('fetch')) {
                    throw new Error('Ağ bağlantı hatası');
                }
                throw error;
            }
            throw new Error('Bilinmeyen bir hata oluştu');
        }
    }

    async listModels(): Promise<Model[]> {
        if (this.isCacheValid() && this.modelsCache) {
            return this.modelsCache;
        }

        try {
            const apiKey = await this.getApiKey();
            if (!apiKey) {
                throw new Error('API anahtarı bulunamadı');
            }

            const response = await fetch(`${API_BASE_URL}/${API_VERSION}/models`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Model listesi alınamadı: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as { data: Model[] };
            await this.updateCache(data.data);
            return data.data;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Model listesi alınamadı: ${error.message}`);
            }
            throw new Error('Model listesi alınamadı: Bilinmeyen hata');
        }
    }

    async setSelectedModel(modelId: string): Promise<void> {
        const models = await this.listModels();
        const model = models.find(m => m.id === modelId);

        if (!model) {
            throw new Error(`Model bulunamadı: ${modelId}`);
        }

        if (!model.available) {
            console.warn(`Model kullanılamıyor: ${modelId}, varsayılan model kullanılacak: ${DEFAULT_MODEL}`);
            await this.memento.update(OpenRouterService.SELECTED_MODEL_KEY, DEFAULT_MODEL);
            throw new Error(`Seçilen model şu anda kullanılamıyor: ${modelId}`);
        }

        await this.memento.update(OpenRouterService.SELECTED_MODEL_KEY, modelId);
    }

    async getSelectedModel(): Promise<string> {
        const modelId = this.memento.get<string>(OpenRouterService.SELECTED_MODEL_KEY);
        if (!modelId) {
            return DEFAULT_MODEL;
        }

        try {
            const models = await this.listModels();
            const model = models.find(m => m.id === modelId);

            if (!model || !model.available) {
                console.warn(`Seçili model kullanılamıyor: ${modelId}, varsayılan model kullanılacak: ${DEFAULT_MODEL}`);
                return DEFAULT_MODEL;
            }

            return modelId;
        } catch (error) {
            console.warn(`Model durumu kontrol edilemedi, varsayılan model kullanılacak: ${DEFAULT_MODEL}`);
            return DEFAULT_MODEL;
        }
    }
}

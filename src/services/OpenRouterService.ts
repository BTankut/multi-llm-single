import * as vscode from 'vscode';
import fetch from 'node-fetch';

export const API_VERSION = 'v1';
const API_BASE_URL = 'https://openrouter.ai/api';

export class OpenRouterService {
    private static readonly API_KEY_SECRET = 'openrouter-api-key';
    private secretStorage: vscode.SecretStorage;

    constructor(context: vscode.ExtensionContext) {
        this.secretStorage = context.secrets;
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
}

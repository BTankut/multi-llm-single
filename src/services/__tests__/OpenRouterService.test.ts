import { OpenRouterService } from '../OpenRouterService';
import * as vscode from 'vscode';
import fetch from 'node-fetch';

jest.mock('node-fetch');

describe('OpenRouterService', () => {
    let service: OpenRouterService;
    let mockSecretStorage: jest.Mocked<vscode.SecretStorage>;
    
    beforeEach(() => {
        mockSecretStorage = {
            store: jest.fn(),
            get: jest.fn(),
            delete: jest.fn(),
            onDidChange: jest.fn()
        };
        
        const mockContext = {
            secrets: mockSecretStorage
        } as unknown as vscode.ExtensionContext;
        
        service = new OpenRouterService(mockContext);
    });

    describe('saveApiKey', () => {
        it('geçerli API anahtarını kaydeder', async () => {
            await service.saveApiKey('test-key');
            expect(mockSecretStorage.store).toHaveBeenCalledWith('openrouter-api-key', 'test-key');
        });

        it('boş API anahtarı için hata fırlatır', async () => {
            await expect(service.saveApiKey('')).rejects.toThrow('API anahtarı boş olamaz');
        });
    });

    describe('getApiKey', () => {
        it('kaydedilmiş API anahtarını getirir', async () => {
            mockSecretStorage.get.mockResolvedValue('stored-key');
            const key = await service.getApiKey();
            expect(key).toBe('stored-key');
        });

        it('API anahtarı bulunamazsa undefined döner', async () => {
            mockSecretStorage.get.mockResolvedValue(undefined);
            const key = await service.getApiKey();
            expect(key).toBeUndefined();
        });
    });

    describe('testApiKey', () => {
        const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

        it('geçerli API anahtarı için başarılı yanıt döner', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200
            } as any);

            await expect(service.testApiKey('valid-key')).resolves.not.toThrow();
        });

        it('geçersiz API anahtarı için hata fırlatır', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            } as any);

            await expect(service.testApiKey('invalid-key')).rejects.toThrow('Geçersiz API anahtarı');
        });

        it('ağ hatası durumunda uygun hata fırlatır', async () => {
            mockFetch.mockRejectedValue(new Error('fetch failed'));
            await expect(service.testApiKey('test-key')).rejects.toThrow('Ağ bağlantı hatası');
        });
    });
});

import { OpenRouterService, DEFAULT_MODEL } from '../OpenRouterService';
import * as vscode from 'vscode';
import fetch from 'node-fetch';

jest.mock('node-fetch');

describe('OpenRouterService', () => {
    let service: OpenRouterService;
    let mockSecretStorage: jest.Mocked<vscode.SecretStorage>;
    let mockMemento: jest.Mocked<vscode.Memento>;
    let realDateNow: () => number;
    
    beforeEach(() => {
        mockSecretStorage = {
            store: jest.fn(),
            get: jest.fn(),
            delete: jest.fn(),
            onDidChange: jest.fn()
        };

        mockMemento = {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn()
        };
        
        const mockContext = {
            secrets: mockSecretStorage,
            globalState: mockMemento
        } as unknown as vscode.ExtensionContext;
        
        service = new OpenRouterService(mockContext);

        // Date.now() mock'u için hazırlık
        realDateNow = Date.now;
        const mockDate = new Date('2025-02-10T12:00:00Z');
        global.Date.now = jest.fn(() => mockDate.getTime());
    });

    afterEach(() => {
        global.Date.now = realDateNow;
        jest.resetAllMocks();
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

    describe('listModels', () => {
        const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
        const mockModels = {
            data: [
                { id: 'model1', name: 'Model 1', available: true, context_length: 4096 },
                { id: 'model2', name: 'Model 2', available: false, context_length: 8192 }
            ]
        };

        beforeEach(() => {
            mockSecretStorage.get.mockResolvedValue('test-key');
        });

        it('modelleri başarıyla getirir ve önbelleğe alır', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockModels)
            } as any);

            const models = await service.listModels();
            expect(models).toEqual(mockModels.data);
            expect(mockMemento.update).toHaveBeenCalledTimes(2); // Cache ve timestamp güncellemesi
        });

        it('önbellekteki modelleri kullanır', async () => {
            // Önce önbelleği doldur
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockModels)
            } as any);
            
            // İlk çağrı için önbelleği doldur
            await service.listModels();
            
            // Mock'ları temizle
            mockFetch.mockClear();
            
            // İkinci çağrı önbellekten gelmeli
            const models = await service.listModels();
            expect(models).toEqual(mockModels.data);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('önbellek süresi dolmuşsa yeni veri çeker', async () => {
            mockMemento.get.mockImplementation((key) => {
                if (key === 'openrouter-models-cache') return mockModels.data;
                if (key === 'openrouter-models-cache-timestamp') return Date.now() - (25 * 60 * 60 * 1000); // 25 saat önce
                return undefined;
            });

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockModels)
            } as any);

            await service.listModels();
            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe('setSelectedModel', () => {
        const mockModels = [
            { id: 'model1', name: 'Model 1', available: true, context_length: 4096 },
            { id: 'model2', name: 'Model 2', available: false, context_length: 8192 }
        ];

        beforeEach(() => {
            mockSecretStorage.get.mockResolvedValue('test-key');
            const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: mockModels })
            } as any);
        });

        it('geçerli ve kullanılabilir modeli seçer', async () => {
            await service.setSelectedModel('model1');
            expect(mockMemento.update).toHaveBeenCalledWith('multiLLM.openRouter.model', 'model1');
        });

        it('kullanılamayan model için hata fırlatır ve varsayılan modele döner', async () => {
            await expect(service.setSelectedModel('model2')).rejects.toThrow('Seçilen model şu anda kullanılamıyor');
            expect(mockMemento.update).toHaveBeenCalledWith('multiLLM.openRouter.model', DEFAULT_MODEL);
        });

        it('var olmayan model için hata fırlatır', async () => {
            await expect(service.setSelectedModel('nonexistent')).rejects.toThrow('Model bulunamadı');
        });
    });

    describe('getSelectedModel', () => {
        const mockModels = [
            { id: 'model1', name: 'Model 1', available: true, context_length: 4096 },
            { id: 'model2', name: 'Model 2', available: false, context_length: 8192 }
        ];

        beforeEach(() => {
            mockSecretStorage.get.mockResolvedValue('test-key');
            const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: mockModels })
            } as any);
        });

        it('seçili modeli getirir', async () => {
            mockMemento.get.mockImplementation((key) => {
                if (key === 'multiLLM.openRouter.model') return 'model1';
                return undefined;
            });

            const modelId = await service.getSelectedModel();
            expect(modelId).toBe('model1');
        });

        it('seçili model kullanılamıyorsa varsayılan modele döner', async () => {
            mockMemento.get.mockImplementation((key) => {
                if (key === 'multiLLM.openRouter.model') return 'model2';
                return undefined;
            });

            const modelId = await service.getSelectedModel();
            expect(modelId).toBe(DEFAULT_MODEL);
        });

        it('seçili model yoksa varsayılan modeli döndürür', async () => {
            mockMemento.get.mockReturnValue(undefined);
            const modelId = await service.getSelectedModel();
            expect(modelId).toBe(DEFAULT_MODEL);
        });
    });
});

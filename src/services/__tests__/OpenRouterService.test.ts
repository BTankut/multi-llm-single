import { OpenRouterService } from '../OpenRouterService';
import * as vscode from 'vscode';
import fetch from 'node-fetch';

jest.mock('node-fetch');

describe('OpenRouterService', () => {
    let service: OpenRouterService;
    let mockSecretStorage: jest.Mocked<vscode.SecretStorage>;
    let mockMemento: jest.Mocked<vscode.Memento>;
    let realDateNow: () => number;

    const mockModels = {
        data: [
            { id: 'model1', name: 'Model 1', available: true, context_length: 4096 },
            { id: 'model2', name: 'Model 2', available: false, context_length: 8192 },
            { id: 'model3', name: 'Model 3', available: true, context_length: 4096 }
        ]
    };

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

        service = new OpenRouterService(mockSecretStorage, mockMemento);
        
        realDateNow = Date.now;
        Date.now = jest.fn(() => 1625097600000); // Sabit bir zaman
    });

    afterEach(() => {
        Date.now = realDateNow;
        jest.clearAllMocks();
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
        beforeEach(() => {
            mockSecretStorage.get.mockResolvedValue('test-key');
            const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: mockModels.data })
            } as any);
        });

        it('geçerli ve kullanılabilir modeli seçer', async () => {
            await service.setSelectedModel('model1');
            expect(mockMemento.update).toHaveBeenCalledWith('multiLLM.openRouter.model', 'model1');
        });

        it('kullanılamayan model için hata fırlatır ve varsayılan modele döner', async () => {
            await expect(service.setSelectedModel('model2')).rejects.toThrow('Seçilen model şu anda kullanılamıyor');
            expect(mockMemento.update).toHaveBeenCalledWith('multiLLM.openRouter.model', 'model1');
        });

        it('var olmayan model için hata fırlatır', async () => {
            await expect(service.setSelectedModel('nonexistent')).rejects.toThrow('Model bulunamadı');
        });
    });

    describe('getSelectedModel', () => {
        beforeEach(() => {
            mockSecretStorage.get.mockResolvedValue('test-key');
            const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: mockModels.data })
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
            expect(modelId).toBe('model1');
        });

        it('seçili model yoksa varsayılan modeli döndürür', async () => {
            mockMemento.get.mockReturnValue(undefined);
            const modelId = await service.getSelectedModel();
            expect(modelId).toBe('model1');
        });
    });

    describe('sendMessage', () => {
        it('mesajı başarıyla gönderir ve yanıt alır', async () => {
            mockSecretStorage.get.mockResolvedValue('test-api-key');
            mockMemento.get.mockReturnValue('test-model');

            const mockResponse = {
                choices: [
                    {
                        message: {
                            content: 'Test yanıtı'
                        }
                    }
                ]
            };

            const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            } as any);

            const response = await service.sendMessage('Test mesajı');
            expect(response).toBe('Test yanıtı');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://openrouter.ai/api/v1/chat/completions',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-api-key'
                    }),
                    body: expect.stringContaining('Test mesajı')
                })
            );
        });

        it('API anahtarı eksikse hata fırlatır', async () => {
            mockSecretStorage.get.mockResolvedValue(undefined);
            await expect(service.sendMessage('Test mesajı')).rejects.toThrow('API anahtarı ayarlanmamış');
        });

        it('API hatası durumunda uygun hata fırlatır', async () => {
            mockSecretStorage.get.mockResolvedValue('test-api-key');
            mockMemento.get.mockReturnValue('test-model');

            const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
            mockFetch.mockResolvedValue({
                ok: false,
                statusText: 'Bad Request',
                json: () => Promise.resolve({ message: 'API hatası' })
            } as any);

            await expect(service.sendMessage('Test mesajı')).rejects.toThrow('API hatası');
        });
    });
});

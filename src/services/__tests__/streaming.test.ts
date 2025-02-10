import { OpenRouterService } from '../OpenRouterService';
import * as vscode from 'vscode';
import fetch, { RequestInit } from 'node-fetch';

jest.mock('vscode');
jest.mock('node-fetch');

describe('OpenRouterService Streaming Tests', () => {
    let service: OpenRouterService;
    let mockSecrets: jest.Mocked<vscode.SecretStorage>;
    let mockState: jest.Mocked<vscode.Memento>;
    let mockFetch: jest.Mock;

    beforeEach(() => {
        mockSecrets = {
            get: jest.fn(),
            store: jest.fn(),
            delete: jest.fn(),
            onDidChange: jest.fn() as unknown as jest.MockInstance<vscode.Disposable, [listener: (e: vscode.SecretStorageChangeEvent) => any, thisArgs?: any, disposables?: vscode.Disposable[] | undefined]>
        } as unknown as jest.Mocked<vscode.SecretStorage>;

        mockState = {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn()
        };

        mockFetch = fetch as unknown as jest.Mock;
        service = new OpenRouterService(mockSecrets, mockState);
    });

    it('should handle streaming response correctly', async () => {
        const mockStream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('data: {"id":"1","choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n'));
                controller.enqueue(new TextEncoder().encode('data: {"id":"1","choices":[{"delta":{"content":" World"},"index":0}]}\n\n'));
                controller.close();
            }
        });

        const mockResponse = {
            ok: true,
            body: mockStream,
            status: 200,
            statusText: 'OK',
            text: jest.fn()
        };

        mockFetch.mockResolvedValue(mockResponse);
        mockSecrets.get.mockResolvedValue('test-api-key');
        mockState.get.mockReturnValue('test-model');

        const tokens: string[] = [];
        await service.sendMessageStream('Test message', {
            stream: true,
            onToken: (token) => tokens.push(token)
        });

        expect(tokens).toEqual(['Hello', ' World']);
    });

    it('should handle stream cancellation', async () => {
        const abortController = new AbortController();
        let resolveStream: () => void;
        const streamPromise = new Promise<void>((resolve) => {
            resolveStream = resolve;
        });

        let streamController: ReadableStreamDefaultController<Uint8Array>;
        const mockStream = new ReadableStream({
            start(controller) {
                streamController = controller;
                // İlk token'ı gönder
                controller.enqueue(new TextEncoder().encode('data: {"id":"1","choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n'));
                resolveStream();
            },
            async pull() {
                // AbortSignal'i dinle ve hemen reject et
                const error = new Error('AbortError');
                error.name = 'AbortError';
                throw error;
            },
            cancel() {
                // İptal edildiğinde streamController'ı kapat
                streamController.close();
                resolveStream();
            }
        });

        const mockResponse = {
            ok: true,
            body: mockStream,
            status: 200,
            statusText: 'OK',
            text: jest.fn()
        };

        mockFetch.mockResolvedValue(mockResponse);
        mockSecrets.get.mockResolvedValue('test-api-key');
        mockState.get.mockReturnValue('test-model');

        const tokens: string[] = [];
        const messagePromise = service.sendMessageStream('Test message', {
            stream: true,
            signal: abortController.signal as unknown as RequestInit['signal'],
            onToken: (token) => tokens.push(token)
        });

        // İlk token'ı bekle
        await streamPromise;
        // Sonra iptal et
        abortController.abort();

        try {
            await messagePromise;
            fail('Should have thrown AbortError');
        } catch (error) {
            expect(error instanceof Error && error.name === 'AbortError').toBe(true);
        }
        expect(tokens).toEqual(['Hello']);
    }, 10000); // 10 saniye zaman aşımı süresi

    it('should handle network errors', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));
        mockSecrets.get.mockResolvedValue('test-api-key');
        mockState.get.mockReturnValue('test-model');

        let error: Error | undefined;
        await expect(service.sendMessageStream('Test message', {
            stream: true,
            onError: (e: Error) => { error = e; }
        })).rejects.toThrow('Network error');

        expect(error).toBeTruthy();
        if (error) {
            expect(error.message).toBe('Network error');
        }
    });

    it('should accumulate tokens correctly', async () => {
        const mockStream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('data: {"id":"1","choices":[{"delta":{"content":"H"},"index":0}]}\n\n'));
                controller.enqueue(new TextEncoder().encode('data: {"id":"1","choices":[{"delta":{"content":"e"},"index":0}]}\n\n'));
                controller.enqueue(new TextEncoder().encode('data: {"id":"1","choices":[{"delta":{"content":"y"},"index":0}]}\n\n'));
                controller.close();
            }
        });

        const mockResponse = {
            ok: true,
            body: mockStream,
            status: 200,
            statusText: 'OK',
            text: jest.fn()
        };

        mockFetch.mockResolvedValue(mockResponse);
        mockSecrets.get.mockResolvedValue('test-api-key');
        mockState.get.mockReturnValue('test-model');

        const tokens: string[] = [];
        await service.sendMessageStream('Test message', {
            stream: true,
            onToken: (token) => tokens.push(token)
        });

        expect(tokens.join('')).toBe('Hey');
        expect(tokens.length).toBe(3);
    });
});

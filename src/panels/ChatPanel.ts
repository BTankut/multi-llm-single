import * as vscode from 'vscode';
import { OpenRouterService } from '../services/OpenRouterService';
import * as path from 'path';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export class ChatPanel {
    public static currentPanel: ChatPanel | undefined;
    private static readonly viewType = 'multiLLM.chatPanel';
    private static readonly MESSAGES_KEY = 'multiLLM.chatMessages';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private readonly _openRouterService: OpenRouterService;
    private readonly _outputChannel: vscode.OutputChannel;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, openRouterService: OpenRouterService) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._openRouterService = openRouterService;
        this._outputChannel = vscode.window.createOutputChannel('Multi LLM');

        this._update();
        this._setWebviewMessageListener();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static async createOrShow(extensionUri: vscode.Uri, openRouterService: OpenRouterService) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            ChatPanel.viewType,
            'Multi LLM Sohbet',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'src', 'webview')
                ]
            }
        );

        ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, openRouterService);
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'chat.html');
        let html = require('fs').readFileSync(htmlPath.fsPath, 'utf8');

        // VS Code API'sini ekle
        html = html.replace('</head>',
            `<script>
                const vscode = acquireVsCodeApi();
            </script>
            </head>`
        );

        return html;
    }

    private _setWebviewMessageListener() {
        this._panel.webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.type) {
                    case 'sendMessage':
                        await this._handleSendMessage(message.message);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async _handleSendMessage(content: string) {
        try {
            // API anahtarını kontrol et
            const apiKey = await this._openRouterService.getApiKey();
            if (!apiKey) {
                this._showError('API anahtarı ayarlanmamış. Lütfen önce API anahtarınızı ayarlayın.');
                return;
            }

            // Seçili modeli al
            const modelId = await this._openRouterService.getSelectedModel();
            
            // Kullanıcı mesajını ekle
            const userMessage: ChatMessage = { role: 'user', content };
            this._addMessage(userMessage);

            this._outputChannel.appendLine(`[${new Date().toISOString()}] Mesaj gönderiliyor: ${content}`);
            this._outputChannel.appendLine(`[${new Date().toISOString()}] Model: ${modelId}`);

            // OpenRouter API'ye istek at
            const response = await this._openRouterService.sendMessage(content);
            
            // Asistan mesajını ekle
            const assistantMessage: ChatMessage = { role: 'assistant', content: response };
            this._addMessage(assistantMessage);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu';
            this._showError(`Mesaj gönderilemedi: ${errorMessage}`);
            this._outputChannel.appendLine(`[${new Date().toISOString()}] Hata: ${errorMessage}`);
        }
    }

    private _addMessage(message: ChatMessage) {
        this._panel.webview.postMessage({
            type: 'addMessage',
            message
        });
    }

    private _showError(message: string) {
        this._panel.webview.postMessage({
            type: 'error',
            message
        });
    }

    public dispose() {
        ChatPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}

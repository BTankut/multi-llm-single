import * as vscode from 'vscode';
import * as fs from 'fs';
import { OpenRouterService } from '../services/OpenRouterService';

export class ChatPanel {
    public static currentPanel: ChatPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private readonly _openRouterService: OpenRouterService;
    private readonly _outputChannel: vscode.OutputChannel;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        openRouterService: OpenRouterService
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._openRouterService = openRouterService;
        this._outputChannel = vscode.window.createOutputChannel('Multi LLM Single Chat');

        // Panel HTML'ini ayarla
        this._getHtmlForWebview(this._panel.webview).then(html => {
            this._panel.webview.html = html;
        });

        this._setWebviewMessageListener();

        // Panel kapatıldığında kaynakları temizle
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Başlangıçta mevcut ayarları al
        this._initializeSettings();
    }

    private async _initializeSettings() {
        try {
            this._outputChannel.appendLine('Ayarlar başlatılıyor...');
            const selectedModel = await this._openRouterService.getSelectedModel();
            if (selectedModel) {
                this._outputChannel.appendLine(`Seçili model: ${selectedModel}`);
                await this._panel.webview.postMessage({
                    type: 'updateModel',
                    modelId: selectedModel
                });
            } else {
                this._outputChannel.appendLine('Seçili model bulunamadı');
            }
        } catch (error) {
            this._outputChannel.appendLine(`Ayarlar başlatılırken hata: ${error}`);
            this._showError('Ayarlar yüklenirken bir hata oluştu');
        }
    }

    public static render(extensionUri: vscode.Uri, openRouterService: OpenRouterService) {
        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
        } else {
            const panel = vscode.window.createWebviewPanel(
                'chatPanel',
                'Multi LLM Single Chat',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src', 'webview')]
                }
            );

            ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, openRouterService);
        }
    }

    private _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'chat.html');
        let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

        // VS Code API'sini ekle
        const nonce = this._getNonce();

        // CSP (Content Security Policy) ekle
        const cspSource = webview.cspSource;
        html = html.replace(
            '</head>',
            `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
            </head>`
        );

        // VS Code API'sini ve ana scripti ekle
        html = html.replace(
            '<script>',
            `<script nonce="${nonce}">`
        );

        return html;
    }

    private _setWebviewMessageListener() {
        this._panel.webview.onDidReceiveMessage(
            async (message: any) => {
                try {
                    this._outputChannel.appendLine(`Webview mesajı alındı: ${JSON.stringify(message)}`);
                    switch (message.type) {
                        case 'sendMessage':
                            await this._handleSendMessage(message.message);
                            break;
                        case 'updateModel':
                            await this._handleUpdateModel(message.modelId);
                            break;
                        case 'getCurrentSettings':
                            await this._handleGetCurrentSettings();
                            break;
                        default:
                            this._outputChannel.appendLine(`Bilinmeyen mesaj tipi: ${message.type}`);
                    }
                } catch (error) {
                    this._outputChannel.appendLine(`Mesaj işlenirken hata: ${error}`);
                    this._showError(error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu');
                }
            },
            null,
            this._disposables
        );
    }

    private async _handleSendMessage(message: string) {
        try {
            this._outputChannel.appendLine(`Mesaj gönderiliyor: ${message}`);
            const response = await this._openRouterService.sendMessage(message);
            await this._panel.webview.postMessage({
                type: 'receiveMessage',
                message: response
            });
            this._outputChannel.appendLine('Mesaj başarıyla gönderildi');
        } catch (error) {
            this._outputChannel.appendLine(`Mesaj gönderilirken hata: ${error}`);
            this._showError('Mesaj gönderilemedi');
        }
    }

    private async _handleUpdateModel(modelId: string) {
        try {
            this._outputChannel.appendLine(`Model güncelleniyor: ${modelId}`);
            await this._openRouterService.setSelectedModel(modelId);
            this._outputChannel.appendLine('Model başarıyla güncellendi');
        } catch (error) {
            this._outputChannel.appendLine(`Model güncellenirken hata: ${error}`);
            this._showError('Model güncellenemedi');
        }
    }

    private async _handleGetCurrentSettings() {
        try {
            this._outputChannel.appendLine('Mevcut ayarlar alınıyor...');
            const selectedModel = await this._openRouterService.getSelectedModel();
            if (selectedModel) {
                this._outputChannel.appendLine(`Seçili model: ${selectedModel}`);
                await this._panel.webview.postMessage({
                    type: 'updateModel',
                    modelId: selectedModel
                });
            } else {
                this._outputChannel.appendLine('Seçili model bulunamadı');
            }
        } catch (error) {
            this._outputChannel.appendLine(`Ayarlar alınırken hata: ${error}`);
            this._showError('Ayarlar alınamadı');
        }
    }

    private _showError(message: string) {
        vscode.window.showErrorMessage(message);
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

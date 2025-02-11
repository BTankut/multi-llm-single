import * as vscode from 'vscode';
import { OpenRouterService } from '../services/OpenRouterService';
import * as fs from 'fs';

export class SettingsPanel {
    public static currentPanel: SettingsPanel | undefined;
    private static readonly viewType = 'multiLLMSingle.settingsPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private readonly _openRouterService: OpenRouterService;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, openRouterService: OpenRouterService) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._openRouterService = openRouterService;

        this._update();
        this._setWebviewMessageListener();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public static async createOrShow(extensionUri: vscode.Uri, openRouterService: OpenRouterService) {
        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
        } else {
            const panel = vscode.window.createWebviewPanel(
                'settingsPanel',
                'Multi LLM Single Ayarlar',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'src', 'webview')]
                }
            );

            SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri, openRouterService);
        }
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'settings.html');
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

    private _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private _setWebviewMessageListener() {
        this._panel.webview.onDidReceiveMessage(
            async (message: any) => {
                try {
                    console.log('Webview mesajı alındı:', message);
                    switch (message.type) {
                        case 'saveApiKey':
                            await this._handleSaveApiKey(message.apiKey);
                            break;
                        case 'testApiKey':
                            await this._handleTestApiKey(message.apiKey);
                            break;
                        case 'getModels':
                            await this._handleGetModels();
                            break;
                        case 'saveSelectedModel':
                            await this._handleSaveSelectedModel(message.modelId);
                            break;
                        case 'getCurrentSettings':
                            await this._handleGetCurrentSettings();
                            break;
                        default:
                            console.error('Bilinmeyen mesaj tipi:', message.type);
                    }
                } catch (error) {
                    console.error('Mesaj işlenirken hata:', error);
                    this._showError(error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu');
                }
            },
            null,
            this._disposables
        );
    }

    private async _handleSaveApiKey(apiKey: string) {
        try {
            await this._openRouterService.saveApiKey(apiKey);
            vscode.window.showInformationMessage('API anahtarı başarıyla kaydedildi');
            this._panel.webview.postMessage({ type: 'apiKeySaved' });
        } catch (error) {
            this._showError('API anahtarı kaydedilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
        }
    }

    private async _handleTestApiKey(apiKey: string) {
        try {
            await this._openRouterService.testApiKey(apiKey);
            vscode.window.showInformationMessage('API anahtarı geçerli');
            this._panel.webview.postMessage({ type: 'apiKeyValid' });
        } catch (error) {
            this._showError('API anahtarı geçersiz: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
        }
    }

    private async _handleGetModels() {
        try {
            const models = await this._openRouterService.getModels();
            this._panel.webview.postMessage({ type: 'models', models });
        } catch (error) {
            this._showError('Model listesi alınamadı: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
        }
    }

    private async _handleSaveSelectedModel(modelId: string) {
        try {
            await this._openRouterService.setSelectedModel(modelId);
            vscode.window.showInformationMessage('Seçili model başarıyla kaydedildi');
            this._panel.webview.postMessage({ type: 'modelSaved' });
        } catch (error) {
            this._showError('Model kaydedilemedi: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
        }
    }

    private async _handleGetCurrentSettings() {
        try {
            const apiKey = await this._openRouterService.getApiKey();
            const selectedModel = await this._openRouterService.getSelectedModel();
            this._panel.webview.postMessage({
                type: 'currentSettings',
                settings: {
                    apiKey: apiKey || '',
                    selectedModel: selectedModel || ''
                }
            });
        } catch (error) {
            this._showError('Ayarlar alınamadı: ' + (error instanceof Error ? error.message : 'Bilinmeyen hata'));
        }
    }

    private _showError(message: string) {
        vscode.window.showErrorMessage(`Multi LLM Single: ${message}`);
        this._panel.webview.postMessage({ type: 'error', message });
    }

    public dispose() {
        SettingsPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}

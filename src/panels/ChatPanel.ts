import * as vscode from 'vscode';
import * as fs from 'fs';
import { OpenRouterService } from '../services/OpenRouterService';

export class ChatPanel {
    private static currentPanel: ChatPanel | undefined;
    private static readonly outputChannel = vscode.window.createOutputChannel('Multi LLM Single Chat');
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private openRouterService: OpenRouterService;
    private selectedModel: string | undefined;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        secrets: vscode.SecretStorage,
        storage: vscode.Memento
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.openRouterService = new OpenRouterService(secrets, storage);

        ChatPanel.outputChannel.appendLine('Chat paneli başlatılıyor...');

        // Model bilgisini al ve ayarla
        this.initializeModel().then(() => {
            ChatPanel.outputChannel.appendLine('Model bilgisi güncellendi');
        });

        // HTML'i ayarla
        this._getHtmlForWebview().then(html => {
            this._panel.webview.html = html;
            ChatPanel.outputChannel.appendLine('HTML ayarlandı');
        });

        // Event listener'ları ekle
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            message => this.handleWebviewMessage(message),
            null,
            this._disposables
        );

        // Model değişikliklerini dinle
        vscode.workspace.onDidChangeConfiguration(async e => {
            if (e.affectsConfiguration('multi-llm-single.selectedModel')) {
                const newModel = await this.openRouterService.getSelectedModel();
                if (this._panel.webview) {
                    await this._panel.webview.postMessage({
                        command: 'updateModelInfo',
                        modelId: newModel
                    });
                }
            }
        }, null, this._disposables);
    }

    private async initializeModel() {
        try {
            const model = await this.openRouterService.getSelectedModel();
            this.selectedModel = model;
            ChatPanel.outputChannel.appendLine(`Başlangıç modeli: ${model}`);
            
            if (this._panel.webview) {
                await this._panel.webview.postMessage({
                    command: 'updateModelInfo',
                    modelId: model
                });
            }
        } catch (error) {
            ChatPanel.outputChannel.appendLine(`Model başlatma hatası: ${error}`);
            vscode.window.showErrorMessage('Model başlatılamadı');
        }
    }

    private async handleWebviewMessage(message: any) {
        ChatPanel.outputChannel.appendLine(`WebView mesajı alındı: ${JSON.stringify(message)}`);
        
        try {
            switch (message.command) {
                case 'openSettings':
                    ChatPanel.outputChannel.appendLine('Ayarlar açılıyor...');
                    await vscode.commands.executeCommand('multi-llm-single.openSettings');
                    break;

                case 'sendMessage':
                    if (message.text?.trim()) {
                        await this.handleUserMessage(message.text);
                    }
                    break;

                default:
                    ChatPanel.outputChannel.appendLine(`Bilinmeyen komut: ${message.command}`);
            }
        } catch (error) {
            ChatPanel.outputChannel.appendLine(`Mesaj işleme hatası: ${error}`);
            vscode.window.showErrorMessage(`İşlem hatası: ${error}`);
        }
    }

    private async handleUserMessage(content: string) {
        try {
            ChatPanel.outputChannel.appendLine(`Kullanıcı mesajı alındı: ${content}`);

            // Asistan mesajını başlat
            await this._panel.webview.postMessage({
                command: 'addMessage',
                content: '',
                type: 'assistant'
            });

            // Stream'i başlat
            ChatPanel.outputChannel.appendLine('Stream başlatılıyor...');
            const messages = [{ role: 'user', content }];
            
            try {
                for await (const chunk of this.openRouterService.streamChat(messages)) {
                    if (this._panel.webview) {
                        await this._panel.webview.postMessage({
                            command: 'appendMessageChunk',
                            content: chunk
                        });
                    }
                }
                ChatPanel.outputChannel.appendLine('Stream başarıyla tamamlandı');
            } catch (streamError) {
                ChatPanel.outputChannel.appendLine(`Stream hatası: ${streamError}`);
                throw streamError;
            }

            // Stream'i sonlandır
            if (this._panel.webview) {
                await this._panel.webview.postMessage({
                    command: 'streamEnd'
                });
            }

        } catch (error) {
            ChatPanel.outputChannel.appendLine(`Hata: ${error}`);
            vscode.window.showErrorMessage(`Hata: ${error}`);
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

    private async _getHtmlForWebview() {
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'chat.html');
        let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

        const nonce = this._getNonce();
        const webview = this._panel.webview;

        // CSP ayarlarını ekle
        const csp = `
            default-src 'none';
            style-src ${webview.cspSource} 'unsafe-inline';
            script-src 'nonce-${nonce}';
            img-src ${webview.cspSource} https:;
            font-src ${webview.cspSource};
        `;

        // CSP'yi ekle
        html = html.replace(
            '</head>',
            `<meta http-equiv="Content-Security-Policy" content="${csp.replace(/\s+/g, ' ')}">
            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
            </script>
            </head>`
        );

        // Script tag'lerini güncelle
        html = html.replace(
            '<script>',
            `<script nonce="${nonce}">`
        );

        return html;
    }

    public static async render(
        extensionUri: vscode.Uri,
        secrets: vscode.SecretStorage,
        storage: vscode.Memento
    ) {
        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
        } else {
            const panel = vscode.window.createWebviewPanel(
                'chatPanel',
                'OpenRouter Chat',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(extensionUri, 'src', 'webview')
                    ]
                }
            );

            ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, secrets, storage);
        }
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

import * as vscode from 'vscode';
import { ChatPanel } from './panels/ChatPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { OpenRouterService } from './services/OpenRouterService';

export function activate(context: vscode.ExtensionContext) {
    // Output kanalını oluştur
    const outputChannel = vscode.window.createOutputChannel('Multi LLM Single Chat');
    outputChannel.appendLine('Extension aktif edildi');

    // Chat panel komutunu kaydet
    context.subscriptions.push(
        vscode.commands.registerCommand('multi-llm-single.openChat', async () => {
            outputChannel.appendLine('Chat komutu çalıştırıldı');
            const openRouterService = new OpenRouterService(context.secrets, context.workspaceState);
            await ChatPanel.render(context.extensionUri, context.secrets, context.workspaceState);
        })
    );

    // Ayarlar panel komutunu kaydet
    const settingsCommand = vscode.commands.registerCommand('multi-llm-single.openSettings', () => {
        outputChannel.appendLine('Ayarlar komutu çalıştırıldı');
        SettingsPanel.createOrShow(context.extensionUri, new OpenRouterService(context.secrets, context.workspaceState));
    });

    context.subscriptions.push(settingsCommand);
    context.subscriptions.push(outputChannel);
}

export function deactivate() {}

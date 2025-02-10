import * as vscode from 'vscode';
import { ChatPanel } from './panels/ChatPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { OpenRouterService } from './services/OpenRouterService';

export function activate(context: vscode.ExtensionContext) {
    const openRouterService = new OpenRouterService(context.secrets, context.workspaceState);

    let chatCommand = vscode.commands.registerCommand('multi-llm-single.openChat', () => {
        ChatPanel.render(context.extensionUri, openRouterService);
    });

    let settingsCommand = vscode.commands.registerCommand('multi-llm-single.openSettings', () => {
        SettingsPanel.createOrShow(context.extensionUri, openRouterService);
    });

    context.subscriptions.push(chatCommand, settingsCommand);
}

export function deactivate() {}

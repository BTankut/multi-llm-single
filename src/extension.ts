import * as vscode from 'vscode';
import { OpenRouterService } from './services/OpenRouterService';
import { ChatPanel } from './panels/ChatPanel';

export function activate(context: vscode.ExtensionContext) {
    const openRouterService = new OpenRouterService(context.secrets, context.workspaceState);

    let disposable = vscode.commands.registerCommand('multiLLM.openChat', () => {
        ChatPanel.createOrShow(context.extensionUri, openRouterService, context.workspaceState);
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}

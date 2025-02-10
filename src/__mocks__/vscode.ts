const vscode = {
    SecretStorage: jest.fn(),
    Memento: jest.fn(),
    EventEmitter: jest.fn(),
    Disposable: jest.fn(),
    Event: jest.fn(),
    SecretStorageChangeEvent: jest.fn(),
    window: {
        createOutputChannel: jest.fn().mockReturnValue({
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        })
    }
};

export = vscode;

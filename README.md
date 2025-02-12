# Multi LLM Single - VS Code Extension

A powerful VS Code extension that provides seamless integration with multiple language models through OpenRouter API. Chat with AI models directly in your development environment with advanced features and optimized performance.

## Features

### 🤖 Model Selection
- Access to multiple AI models through OpenRouter
- Real-time model switching
- Automatic model capability detection
- Smart caching for model list (24-hour cache)

### 💬 Chat Interface
- Clean and intuitive WebView-based chat interface
- Real-time token counter and speed indicator
- Full conversation history support
- Markdown rendering for code blocks and formatting

### ⚡ Performance
- Efficient stream handling for responses
- Smart caching mechanisms
- Optimized message history management
- Minimal memory footprint

### 🔒 Security
- Secure API key management using VS Code SecretStorage
- No sensitive data exposure in logs
- Strict content security policy
- Safe error handling and logging

## Installation

1. Download the VSIX file from the latest release
2. Install in VS Code:
   ```
   Extensions (Ctrl+Shift+X) -> ... -> Install from VSIX
   ```
3. Restart VS Code
4. Set your OpenRouter API key in extension settings

## Requirements

- VS Code 1.85.0 or higher
- OpenRouter API key
- Node.js 18.x or higher (for development)

## Extension Settings

This extension contributes the following settings:

* `multi-llm-single.selectedModel`: Selected OpenRouter model
* `multi-llm-single.apiKey`: OpenRouter API key (stored securely)

## Usage

1. Open Command Palette (Ctrl+Shift+P)
2. Type "Multi LLM Single: Open Chat"
3. Enter your message in the chat input
4. View real-time responses with token counting

### Model Selection
1. Click the settings icon in the chat panel
2. Choose from available models
3. Model capabilities and pricing are displayed
4. Selection is saved automatically

## Development

### Setup
```bash
# Clone the repository
git clone https://github.com/BTankut/multi-llm-single.git

# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch
```

### Project Structure
```
src/
├── panels/           # WebView panels (Chat, Settings)
├── services/         # Core services (OpenRouter, etc.)
├── webview/          # WebView HTML and assets
├── types.ts         # TypeScript interfaces
└── extension.ts     # Extension entry point
```

### Testing
```bash
# Run all tests
npm test

# Run specific test
npm test -- -t "test name"
```

### Building
```bash
# Create VSIX package
vsce package
```

## Features in Development

- Context length management
- Enhanced error handling
- Expanded test coverage
- Performance optimizations

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [OpenRouter](https://openrouter.ai/) for providing the API
- VS Code Extension API documentation
- All contributors and testers

## Support

For support, please open an issue in the GitHub repository or contact the maintainers.

---

**Note**: This extension is independent and not affiliated with OpenRouter or any specific AI model provider.

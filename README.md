# Chat Completions MCP with OAuth

This implementation demonstrates using `/chat/completions` as a tool with OAuth authentication through OpenRouter. It uses progress notifications that show the intermediate generated token count and a message until the full chat completions answer has arrived.

## Features

- **Zero Configuration**: No environment variables needed - authentication is handled through OAuth
- **OpenRouter Integration**: Uses OpenRouter's OAuth provider for API key management with budget control
- **Progress Notifications**: Shows intermediate tool results during streaming
- **Model Selection**: Allows selecting different models (defaults to Claude 3.5 Sonnet)
- **Streaming Support**: Supports both streaming and non-streaming responses

## Setup

1. Install dependencies:

```bash
npm install
```

2. Deploy to Cloudflare Workers:

```bash
wrangler deploy
```

3. Connect with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
```

Then connect to your deployed URL + `/mcp`

## How it Works

1. The server uses `simplerauth-client` with the OpenRouter OAuth provider hosted at `openrouter.simplerauth.com`
2. When first accessed, users will be redirected to OpenRouter's OAuth flow
3. Users can set their budget and authorize the application
4. The obtained API key is used for all subsequent chat completion requests
5. No secrets or environment variables are needed - everything is handled through OAuth

## OAuth Flow

- **Provider**: `openrouter.simplerauth.com`
- **Scope**: `api`
- **Model Default**: `anthropic/claude-3.5-sonnet`
- **Login Required**: Yes (automatically redirects unauthenticated users)

## Usage

After authentication, the MCP server provides a `chat_completion` tool that accepts:

- `prompt` (required): The message to send to the model
- `model` (optional): The model to use (defaults to Claude 3.5 Sonnet)

Example tool call:

```json
{
  "name": "chat_completion",
  "arguments": {
    "prompt": "What is the capital of France?",
    "model": "anthropic/claude-3.5-sonnet"
  }
}
```

## Security

- Uses PKCE (Proof Key for Code Exchange) for secure OAuth flow
- API keys are obtained through OpenRouter's budget-controlled OAuth
- No long-term storage of API keys
- Budget limits are enforced by OpenRouter

## Development

For local development:

```bash
wrangler dev
```

The server will be available at `http://localhost:8787/mcp`

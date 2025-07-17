# Streamable HTTP - Multiple Content Blocks Analysis

## What the Spec Says About text/event-stream

Based on the MCP specification for Streamable HTTP transport, here's what it allows for `text/event-stream` responses:

### Multiple Messages Are Explicitly Allowed

**Yes, you can send multiple content blocks back over several chunks.** The spec explicitly supports this:

> "The server **MAY** send JSON-RPC _requests_ and _notifications_ before sending the JSON-RPC _response_. These messages **SHOULD** relate to the originating client _request_."

### Key Points:

1. **Multiple JSON-RPC Messages**: The SSE stream can contain multiple separate JSON-RPC messages
2. **Each Message is Complete**: Each SSE event should contain a complete JSON-RPC message (request, response, or notification)
3. **Related to Original Request**: Additional messages sent before the final response should relate to the originating client request
4. **Final Response Required**: The stream should eventually include the JSON-RPC response for the original request

### Typical Flow:

```
Client POST Request → Server opens SSE stream →
  SSE Event 1: JSON-RPC notification (progress update)
  SSE Event 2: JSON-RPC notification (partial result)
  SSE Event 3: JSON-RPC notification (more data)
  SSE Event 4: JSON-RPC response (final response to original request)
→ Server closes SSE stream
```

### Important Constraints:

- **Complete Messages**: Each SSE event must contain a complete, valid JSON-RPC message
- **Not Partial JSON**: You cannot split a single JSON-RPC message across multiple SSE events
- **Sequential Processing**: Each event is a separate message that should be processed individually
- **Final Response**: The stream must eventually contain the actual response to the original request

### Example Implementation:

If you want to send multiple content blocks, you would typically:

1. Send notifications with partial content as separate JSON-RPC messages
2. Each notification would be a complete JSON-RPC message in its own SSE event
3. Finally send the complete response as the last message

This allows for streaming responses while maintaining the JSON-RPC message integrity that MCP requires.

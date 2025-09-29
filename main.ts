import { withSimplerAuth } from "simplerauth-client";

export default {
  fetch: withSimplerAuth(
    (request: Request, env: any, ctx: any) => {
      const url = new URL(request.url);
      if (url.pathname === "/mcp") {
        return handleChatMcp(request, {
          accessToken: ctx.accessToken,
          authenticated: ctx.authenticated,
        });
      }
      return new Response(
        `Connect 'npx @modelcontextprotocol/inspector' with ${url.origin}/mcp`
      );
    },
    {
      oauthProviderHost: "openrouter.simplerauth.com",
      scope: "api",
      isLoginRequired: false,
    }
  ),
};

interface ChatMcpConfig {
  accessToken?: string;
  authenticated: boolean;
  /** defaults to 2025-03-26 */
  protocolVersion?: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  stream?: boolean;
}

interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
}

interface ChatCompletionStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      content?: string;
    };
    finish_reason?: string;
  }>;
}

export async function handleChatMcp(
  request: Request,
  config: ChatMcpConfig
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (!config.authenticated || !config.accessToken) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "Authentication required. Please login with OpenRouter OAuth.",
        },
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  try {
    const message: any = await request.json();

    // Handle initialize
    if (message.method === "initialize") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: config.protocolVersion || "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: {
              name: "Chat-MCP-OAuth-Server",
              version: "1.0.0",
            },
          },
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, Accept",
          },
        }
      );
    }

    // Handle initialized notification
    if (message.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }

    // Handle tools/list
    if (message.method === "tools/list") {
      const tools = [
        {
          name: "chat_completion",
          title: "Chat Completion (OpenRouter OAuth)",
          description:
            "Generate chat completion using OpenRouter API with OAuth authentication",
          inputSchema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The prompt to send to the chat model",
              },
              model: {
                type: "string",
                description:
                  "The model to use (default: anthropic/claude-3.5-sonnet)",
                default: "anthropic/claude-3.5-sonnet",
              },
            },
            required: ["prompt"],
          },
        },
      ];

      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: { tools },
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, Accept",
          },
        }
      );
    }

    // Handle tools/call
    if (message.method === "tools/call") {
      const { name, arguments: args, _meta } = message.params;
      console.log({ _meta });
      if (name !== "chat_completion") {
        return createError(message.id, -32602, `Unknown tool: ${name}`);
      }

      if (!args.prompt) {
        return createError(
          message.id,
          -32602,
          "Missing required parameter: prompt"
        );
      }

      try {
        // Check accept header from original request
        const acceptHeader = request.headers.get("accept");
        const isStreaming = acceptHeader?.includes("text/event-stream");

        // Use provided model or default to Claude 3.5 Sonnet
        const model = args.model || "anthropic/claude-3.5-sonnet";

        const chatRequest: ChatCompletionRequest = {
          model: model,
          messages: [{ role: "user", content: args.prompt }],
          stream: isStreaming,
        };

        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.accessToken}`,
              "HTTP-Referer": "https://chat-mcp-oauth.example.com", // Required by OpenRouter
              "X-Title": "Chat MCP OAuth Server", // Required by OpenRouter
            },
            body: JSON.stringify(chatRequest),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `Error: ${response.status} ${response.statusText}\n${errorText}`,
                  },
                ],
                isError: true,
              },
            }),
            {
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers":
                  "Content-Type, Authorization, Accept",
              },
            }
          );
        }

        if (isStreaming) {
          // Handle streaming response with Server-Sent Events
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("No response body");
          }

          const decoder = new TextDecoder();
          let accumulatedContent = ""; // Track full content
          let buffer = ""; // ✅ Buffer for incomplete lines

          // Create a readable stream that will emit SSE events
          const stream = new ReadableStream({
            start(controller) {
              const processStream = async () => {
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                      // ✅ Process any remaining buffer content
                      if (buffer.trim()) {
                        processBuffer(buffer);
                      }
                      break;
                    }

                    const chunk = decoder.decode(value, { stream: true });
                    buffer += chunk; // ✅ Add new chunk to buffer

                    // ✅ Process complete lines
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || ""; // ✅ Keep the last incomplete line in buffer

                    for (const line of lines) {
                      processLine(line);
                    }
                  }
                } catch (error) {
                  // Send error response
                  const errorResponse = JSON.stringify({
                    jsonrpc: "2.0",
                    id: message.id,
                    error: {
                      code: -32603,
                      message: `Error during streaming: ${error.message}`,
                    },
                  });
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${errorResponse}\n\n`)
                  );
                  controller.close();
                } finally {
                  reader.releaseLock();
                }
              };

              // ✅ Helper function to process a single line
              const processLine = (line: string) => {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6);
                  if (data === "[DONE]") {
                    // Send final response (with id)
                    const finalResponse = JSON.stringify({
                      jsonrpc: "2.0",
                      id: message.id,
                      result: {
                        content: [
                          {
                            type: "text",
                            text: accumulatedContent,
                          },
                        ],
                        isError: false,
                      },
                    });
                    controller.enqueue(
                      new TextEncoder().encode(`data: ${finalResponse}\n\n`)
                    );
                    controller.close();
                    return;
                  }

                  try {
                    const parsed: ChatCompletionStreamResponse =
                      JSON.parse(data);
                    const delta = parsed.choices[0]?.delta;
                    if (delta?.content) {
                      accumulatedContent += delta.content;

                      //  Send notification (no id = notification)
                      const notification = JSON.stringify({
                        jsonrpc: "2.0",
                        method: "notifications/progress",
                        params: {
                          progressToken: _meta.progressToken,
                          progress: Math.round(accumulatedContent.length / 5),
                          message: `Generating response with ${model}...`,
                        },
                      });
                      const event = `data: ${notification}\n\n`;
                      console.log(event);
                      controller.enqueue(new TextEncoder().encode(event));
                    }
                  } catch (e) {
                    console.log("unparsable line:", line);
                    // Skip invalid JSON lines
                  }
                }
              };

              // ✅ Helper function to process buffer content
              const processBuffer = (bufferContent: string) => {
                const lines = bufferContent.split("\n");
                for (const line of lines) {
                  if (line.trim()) {
                    processLine(line);
                  }
                }
              };

              processStream();
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers":
                "Content-Type, Authorization, Accept",
            },
          });
        } else {
          // Handle non-streaming response
          const chatResponse: ChatCompletionResponse = await response.json();
          const content = chatResponse.choices[0]?.message?.content || "";

          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              result: {
                content: [
                  {
                    type: "text",
                    text: content,
                  },
                ],
                isError: false,
              },
            }),
            {
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers":
                  "Content-Type, Authorization, Accept",
              },
            }
          );
        }
      } catch (error) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Error executing chat completion: ${error.message}`,
                },
              ],
              isError: true,
            },
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers":
                "Content-Type, Authorization, Accept",
            },
          }
        );
      }
    }

    return createError(
      message.id,
      -32601,
      `Method not found: ${message.method}`
    );
  } catch (error) {
    return createError(null, -32700, "Parse error");
  }
}

function createError(id: any, code: number, message: string) {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message },
    }),
    {
      status: 200, // JSON-RPC errors use 200 status
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
      },
    }
  );
}

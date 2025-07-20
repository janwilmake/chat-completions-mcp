export default {
  fetch: (request: Request, env: Env) => {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      return handleChatMcp(request, {
        apiKey: env.LLM_SECRET,
        basePath: env.LLM_BASEPATH,
        model: env.LLM_MODEL,
      });
    }
    return new Response(
      `Connect 'npx @modelcontextprotocol/inspector' with ${url.origin}/mcp`
    );
  },
};

type Env = { LLM_SECRET: string; LLM_BASEPATH: string; LLM_MODEL: string };

interface ChatMcpConfig {
  basePath: string;
  model: string;
  apiKey: string;
  /** defaults to 2025-03-26 */
  protocolVersion?: string;
  /** If provided will use this to fetch, rather than regular fetch */
  fetcher?: Fetcher;
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
              name: "Chat-MCP-Server",
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
          title: "Chat Completion",
          description: "Generate chat completion using the configured model",
          inputSchema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The prompt to send to the chat model",
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

        const chatRequest: ChatCompletionRequest = {
          model: config.model,
          messages: [{ role: "user", content: args.prompt }],
          stream: isStreaming,
        };

        const fetchFn = config.fetcher?.fetch || fetch;

        const response = await fetchFn(`${config.basePath}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(chatRequest),
        });

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
                          message: "Accumulating response",
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

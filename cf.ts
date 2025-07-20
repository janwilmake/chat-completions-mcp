import { env } from "cloudflare:workers";
import { handleChatMcp } from "./main";
// Should be possible now, see https://x.com/threepointone/status/1946861220121706514
type Env = {
  LLM_SECRET: string;
  LLM_BASEPATH: string;
  LLM_MODEL: string;
  LLM_FETCHER?: Fetcher;
  LLM_MCP_PROTOCOL_VERSION?: string;
};
const {
  LLM_BASEPATH,
  LLM_MODEL,
  LLM_SECRET,
  LLM_FETCHER,
  LLM_MCP_PROTOCOL_VERSION,
} = env as Env;
export const mcpFromEnv = (request: Request) =>
  handleChatMcp(request, {
    apiKey: LLM_SECRET,
    basePath: LLM_BASEPATH,
    model: LLM_MODEL,
    fetcher: LLM_FETCHER,
    protocolVersion: LLM_MCP_PROTOCOL_VERSION,
  });

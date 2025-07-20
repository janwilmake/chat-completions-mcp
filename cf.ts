import { env } from "cloudflare:workers";
import { handleChatMcp } from "./main";
type Env = { LLM_SECRET: string; LLM_BASEPATH: string; LLM_MODEL: string };
const { LLM_BASEPATH, LLM_MODEL, LLM_SECRET } = env as Env;
export const chatMcp = (request: Request) =>
  handleChatMcp(request, {
    apiKey: LLM_SECRET,
    basePath: LLM_BASEPATH,
    model: LLM_MODEL,
  });

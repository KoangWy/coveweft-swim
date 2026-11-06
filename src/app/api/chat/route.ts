import { chatDependencies, handleChatRequest } from "@/server/assistant";

// A turn may run several model requests and tool calls.
export const maxDuration = 60;

export function POST(request: Request): Promise<Response> {
  return handleChatRequest(request, chatDependencies);
}

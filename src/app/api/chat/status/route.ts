import { chatDependencies, getChatStatus } from "@/server/assistant";

export async function GET(): Promise<Response> {
  return Response.json(await getChatStatus(chatDependencies), {
    headers: { "Cache-Control": "no-store" },
  });
}

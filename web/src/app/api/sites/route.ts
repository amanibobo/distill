import { listSites } from "@/lib/events-source";

export async function GET() {
  return Response.json(await listSites());
}

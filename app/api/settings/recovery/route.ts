import { ConfigurationError, configurationHistory } from "@/lib/configuration";
import { writeConfigurationRequest } from "@/lib/configuration-write";
import { limitRequestTraffic, securityErrorResponse } from "@/lib/security";

export async function GET(request: Request) {
  try {
    await limitRequestTraffic(request, "recovery");
    const id = new URL(request.url).searchParams.get("history");
    if (!id) throw new ConfigurationError("復元する履歴・控え・初期値を選んでください。");
    return Response.json(await configurationHistory(id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConfigurationError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    return securityErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  return writeConfigurationRequest(request, true);
}

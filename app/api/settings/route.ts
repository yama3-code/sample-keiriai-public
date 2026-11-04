import { ConfigurationError, configurationHistory, editableConfiguration } from "@/lib/configuration";
import { writeConfigurationRequest } from "@/lib/configuration-write";
import { limitRequestTraffic, requestAddress, securityErrorResponse } from "@/lib/security";

export async function GET(request?: Request) {
  try {
    if (request) await limitRequestTraffic(request, "settings", requestAddress(request));
    const historyId = request ? new URL(request.url).searchParams.get("history") : null;
    return Response.json(historyId === null ? await editableConfiguration() : await configurationHistory(historyId), { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) {
    if (error instanceof ConfigurationError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    return securityErrorResponse(error);
  }
}
export async function PUT(request: Request) {
  return writeConfigurationRequest(request, false);
}

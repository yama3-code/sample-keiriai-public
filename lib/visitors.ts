import { digestValue, randomId } from "@/lib/security";

// ログインは不要。回答の続きと実行回数を同じブラウザに結び付けるだけの識別情報。
export const VISITOR_COOKIE = "keiri_visitor";
export type Visitor = { id: string; token: string; isNew: boolean };
export function visitorForRequest(request: Request): Visitor {
  const value = request.headers.get("cookie")?.split(/;\s*/)
    .find((cookie) => cookie.startsWith(`${VISITOR_COOKIE}=`))?.slice(VISITOR_COOKIE.length + 1);
  const valid = typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  const token = valid ? value : randomId();
  return { id: digestValue("visitor", token), token, isNew: !valid };
}
export function rememberVisitor(response: Response, visitor: Visitor): Response {
  if (visitor.isNew) {
    response.headers.append("Set-Cookie", `${VISITOR_COOKIE}=${visitor.token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  }
  return response;
}

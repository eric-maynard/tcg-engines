/**
 * Auth: in-memory token map, request → userId resolution, and /api/auth/* routes.
 */

import { authenticateUser, createUser, getUserById } from "../src/db/user-repo";
import { SANDBOX_ENABLED } from "./config";
import { corsHeaders, json } from "./http";
import type { RouteCtx, RouteResult } from "./state";

// Simple token-based auth (maps token → userId)
export const authTokens = new Map<string, string>();

export function generateToken(userId: string): string {
  const token = crypto.randomUUID();
  authTokens.set(token, userId);
  return token;
}

export function getUserIdFromRequest(req: Request): string | null {
  // Check Authorization header first
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const userId = authTokens.get(token);
    if (userId) {return userId;}
  }
  // Fall back to cookie
  const cookies = req.headers.get("Cookie") ?? "";
  const match = cookies.match(/rb_token=([^;]+)/);
  if (match) {
    const token = decodeURIComponent(match[1]);
    return authTokens.get(token) ?? null;
  }
  return null;
}

export async function handleAuthRoutes(req: Request, url: URL, _ctx: RouteCtx): RouteResult {
  const { pathname } = url;

  // POST /api/auth/register
  if (pathname === "/api/auth/register" && req.method === "POST") {
    const body = (await req.json()) as { username: string; password: string; displayName?: string };
    if (!body.username || !body.password) {
      return json({ error: "Username and password required" }, 400);
    }
    try {
      const displayName = body.displayName ? body.displayName.slice(0, 32) : undefined;
      const user = createUser(body.username, body.password, displayName);
      const token = generateToken(user.id);
      return new Response(JSON.stringify({ token, user }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `rb_token=${token}; Path=/; Max-Age=${30 * 86_400}; SameSite=Lax`,
          ...corsHeaders,
        },
        status: 201,
      });
    } catch {
      return json({ error: "Username already taken" }, 409);
    }
  }

  // POST /api/auth/login
  if (pathname === "/api/auth/login" && req.method === "POST") {
    const body = (await req.json()) as { username: string; password: string };
    const user = authenticateUser(body.username, body.password);
    if (!user) {return json({ error: "Invalid credentials" }, 401);}
    const token = generateToken(user.id);
    return new Response(JSON.stringify({ token, user }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `rb_token=${token}; Path=/; Max-Age=${30 * 86_400}; SameSite=Lax`,
        ...corsHeaders,
      },
      status: 200,
    });
  }

  // GET /api/auth/me
  if (pathname === "/api/auth/me") {
    const userId = getUserIdFromRequest(req);
    if (!userId) {return json({ error: "Not authenticated" }, 401);}
    const user = getUserById(userId);
    if (!user) {return json({ error: "User not found" }, 404);}
    return json({ user });
  }

  // GET /api/auth/dev-credentials — dev auto-login. Never discloses the
  // password: when DEFAULT_USERNAME/DEFAULT_PASSWORD are set AND sandbox mode is
  // on AND the request comes from loopback, the server performs the login itself
  // and returns {available, token, user, username} with the session cookie set.
  if (pathname === "/api/auth/dev-credentials" && req.method === "GET") {
    const username = process.env.DEFAULT_USERNAME;
    const password = process.env.DEFAULT_PASSWORD;
    const host = (req.headers.get("host") ?? "").split(":")[0];
    const loopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
    if (!username || !password || !SANDBOX_ENABLED || !loopback) {
      return json({ available: false });
    }
    const user = authenticateUser(username, password);
    if (!user) {return json({ available: false });}
    const token = generateToken(user.id);
    return new Response(JSON.stringify({ available: true, token, user, username }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `rb_token=${token}; Path=/; Max-Age=${30 * 86_400}; SameSite=Lax`,
        ...corsHeaders,
      },
      status: 200,
    });
  }

  return null;
}

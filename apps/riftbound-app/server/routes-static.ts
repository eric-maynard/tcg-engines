/**
 * Card image proxy (/images/*, /card-image/*) and static page/file serving,
 * including the sandbox-only /play/test auto-game route.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { cardImageUrls } from "./cards";
import { IMAGES_DIR, SANDBOX_ENABLED, STATIC_DIR } from "./config";
import { buildDefaultDeck } from "./decks";
import { gameLogger } from "./log";
import { createGameFromDecks, finalizePregame } from "./pregame";
import { type RouteCtx, type RouteResult, gameSessions } from "./state";

export async function handleImageRoutes(_req: Request, url: URL, _ctx: RouteCtx): RouteResult {
  const { pathname } = url;

  // GET /images/:set/:filename — serve local card images
  if (pathname.startsWith("/images/")) {
    const parts = pathname.split("/").slice(2);
    const imagePath = path.join(IMAGES_DIR, ...parts);

    if (fs.existsSync(imagePath)) {
      const file = Bun.file(imagePath);
      return new Response(file, {
        headers: { "Cache-Control": "public, max-age=86400", "Content-Type": "image/png" },
      });
    }
    return new Response("Image not found", { status: 404 });
  }

  // GET /card-image/:cardId — serve card image by ID.
  // Prefers local downloads/card-images/; falls back to the official CDN
  // imageUrl from set JSON when local files aren't present.
  if (pathname.startsWith("/card-image/")) {
    const cardId = pathname.split("/")[2];
    for (const setDir of ["ogn", "ogs", "sfd", "unl", "ven"]) {
      const dir = path.join(IMAGES_DIR, setDir);
      if (!fs.existsSync(dir)) {continue;}
      const files = fs.readdirSync(dir);
      const match = files.find((f) => f.includes(cardId));
      if (match) {
        const file = Bun.file(path.join(dir, match));
        return new Response(file, {
          headers: { "Cache-Control": "public, max-age=86400", "Content-Type": "image/png" },
        });
      }
    }
    const cdnUrl = cardImageUrls.get(cardId);
    if (cdnUrl) {
      return new Response(null, {
        headers: { "Cache-Control": "public, max-age=86400", "Location": cdnUrl },
        status: 302,
      });
    }
    return new Response("Image not found", { status: 404 });
  }

  return null;
}

export async function handleStaticRoutes(_req: Request, url: URL, _ctx: RouteCtx): RouteResult {
  const { pathname } = url;

  // Serve login page
  if (pathname === "/login" || pathname === "/login.html") {
    const loginPath = path.join(STATIC_DIR, "login.html");
    if (fs.existsSync(loginPath)) {
      return new Response(Bun.file(loginPath), {
        headers: { "Content-Type": "text/html" },
      });
    }
  }

  // Serve decks page
  if (pathname === "/decks" || pathname === "/decks.html") {
    const decksPath = path.join(STATIC_DIR, "decks.html");
    if (fs.existsSync(decksPath)) {
      return new Response(Bun.file(decksPath), {
        headers: { "Content-Type": "text/html" },
      });
    }
  }

  // Redirect root to decks page
  if (pathname === "/") {
    return Response.redirect("/decks", 302);
  }

  // Serve index.html for builder
  if (pathname === "/builder" || pathname === "/index.html") {
    const indexPath = path.join(STATIC_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
      return new Response(Bun.file(indexPath), {
        headers: { "Content-Type": "text/html" },
      });
    }
  }

  // DEV ONLY: auto-create goldfish game for testing (requires SANDBOX_ENABLED=true)
  if (pathname === "/play/test" && SANDBOX_ENABLED) {
    const deck = buildDefaultDeck();
    const session = createGameFromDecks(deck, deck, undefined, {
      firstPlayer: "player-1", gameMode: "duel", names: { "player-1": "Tester", "player-2": "Goldfish" },
      sandbox: true,
    });
    // Auto-complete mulligan
    session.pregame?.mulliganComplete.add("player-1");
    session.pregame?.mulliganComplete.add("player-2");
    finalizePregame(session);

    const testGameId = crypto.randomUUID();
    gameSessions.set(testGameId, session);
    gameLogger.logGameCreated(testGameId, session.players, "duel", "random", {
      sandbox: true,
      source: "test",
    });

    const gamePath = path.join(STATIC_DIR, "gameplay.html");
    let html = fs.readFileSync(gamePath, "utf8");
    const inject = `<script>sessionStorage.setItem("rb_game",${JSON.stringify(JSON.stringify({
      gameId: testGameId, isSandbox: true, lobbyRole: "host",
      playerNames: { "player-1": "Tester", "player-2": "Goldfish" }, viewingPlayer: "player-1",
    }))});</script>`;
    html = html.replace("</head>", inject + "</head>");
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }

  // Serve gameplay.html
  if (pathname === "/play" || pathname === "/gameplay" || pathname === "/gameplay.html") {
    const gamePath = path.join(STATIC_DIR, "gameplay.html");
    if (fs.existsSync(gamePath)) {
      return new Response(Bun.file(gamePath), {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Content-Type": "text/html" },
      });
    }
  }

  // Serve other static files
  const staticPath = path.join(STATIC_DIR, pathname);
  if (fs.existsSync(staticPath) && !fs.statSync(staticPath).isDirectory()) {
    // JS/CSS/HTML must not be cached — they change frequently and stale
    // copies leave players on a broken mix of old markup + new script.
    const noCache = /\.(?:js|css|html)$/i.test(pathname);
    return new Response(Bun.file(staticPath), noCache ? {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    } : undefined);
  }

  return null;
}

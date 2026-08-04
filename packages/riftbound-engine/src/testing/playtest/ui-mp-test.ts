#!/usr/bin/env bun
import { chromium } from "playwright";

const b = await chromium.launch();

async function login(ctx: any, email: string) {
  const p = await ctx.newPage({ viewport: { width: 1440, height: 810 } });
  p.on("console", (m: any) => { if (m.type() === "error") console.log(`[${email} page]`, m.text()); });
  p.on("websocket", (ws: any) => {
    ws.on("framereceived", (ev: any) => console.log(`[${email} ws←]`, String(ev.payload).slice(0, 300)));
    ws.on("framesent", (ev: any) => console.log(`[${email} ws→]`, String(ev.payload).slice(0, 200)));
  });
  await p.goto("http://localhost:3000/login", { waitUntil: "networkidle", timeout: 15000 });
  await p.fill('#loginUser', email);
  await p.fill('#loginPass', "dev");
  await p.click('#loginBtn');
  await p.waitForTimeout(800);
  await p.goto("http://localhost:3000/play", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await p.goto("http://localhost:3000/play", { waitUntil: "networkidle" });
  return p;
}

const ctx1 = await b.newContext({ viewport: { width: 1440, height: 810 } });
const ctx2 = await b.newContext({ viewport: { width: 1440, height: 810 } });

const p1 = await login(ctx1, "dev@riftbound.local");
const p2 = await login(ctx2, "dev2@riftbound.local");

// P1: Host
console.log("\n=== P1 hosts ===");
await p1.locator('button', { hasText: 'Host' }).first().click();
await p1.waitForTimeout(800);
const code = await p1.evaluate(() => document.getElementById('lobbyCode')?.textContent);
console.log("Lobby code:", code);
if (!code || code.length !== 4) throw new Error("No lobby code! got: " + JSON.stringify(code));

// P2: Join
console.log("\n=== P2 joins ===");
await p2.locator('button', { hasText: 'Join' }).first().click();
await p2.waitForTimeout(300);
await p2.fill('#joinCodeInput', code);
await p2.locator('#joinForm button', { hasText: 'Join' }).click();
await p2.waitForTimeout(800);
const joinErr = await p2.evaluate(() => document.getElementById('joinError')?.textContent);
if (joinErr) console.log("Join error:", joinErr);

// Both select deck index 1
console.log("\n=== Both select deck ===");
await p1.selectOption('#deckSelect', { index: 1 });
await p2.selectOption('#deckSelect', { index: 1 });
await p1.waitForTimeout(800);

// P1 starts
console.log("\n=== P1 starts game ===");
const startDisabled = await p1.evaluate(() => (document.getElementById('lobbyStartBtn') as HTMLButtonElement)?.disabled);
console.log("Start button disabled:", startDisabled);
await p1.click('#lobbyStartBtn');
await p1.waitForTimeout(2000);

// Check for coin/mulligan overlay on both
const check = (p: any, label: string) => p.evaluate(() => ({
  coinVisible: document.getElementById('coinOverlay')?.classList.contains('visible'),
  pregameVisible: document.getElementById('pregameOverlay')?.classList.contains('visible'),
  startScreenHidden: document.getElementById('startScreen')?.classList.contains('hidden'),
  lobbyStatus: document.getElementById('lobbyStatus')?.textContent,
  coinDetail: document.getElementById('coinDetail')?.textContent,
})).then((d: any) => { console.log(`[${label}]`, JSON.stringify(d)); return d; });

const d1 = await check(p1, "P1 after start");
const d2 = await check(p2, "P2 after start");

await p1.screenshot({ path: "/tmp/mp-1.png" });
await p2.screenshot({ path: "/tmp/mp-2.png" });

// If coin overlay visible on winner, click choose
for (const [p, label] of [[p1,"P1"],[p2,"P2"]] as const) {
  const btn = await p.$('.coin-choose-btn:visible');
  if (btn) { console.log(`${label} has coin-choose-btn, clicking`); await btn.click(); }
}
await p1.waitForTimeout(3000);
const e1 = await check(p1, "P1 after coin choice");
const e2 = await check(p2, "P2 after coin choice");
await p1.screenshot({ path: "/tmp/mp-1b.png" });
await p2.screenshot({ path: "/tmp/mp-2b.png" });

const p1Reached = d1.coinVisible || d1.pregameVisible || e1.pregameVisible || e1.startScreenHidden;
const p2Reached = d2.coinVisible || d2.pregameVisible || e2.pregameVisible || e2.startScreenHidden;
console.log("\n=== RESULT ===");
console.log("P1 reached coin/mulligan:", p1Reached);
console.log("P2 reached coin/mulligan:", p2Reached);

await b.close();

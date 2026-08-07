import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell" });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs: string[] = [];
p.on("console", m => { if (m.type() === "error") errs.push(`[console] ${m.text()}`); });
p.on("pageerror", e => errs.push(`[pageerror] ${String(e)}`));
await p.goto("http://localhost:3917/login", { waitUntil: "networkidle" });
await p.fill("#loginUser", "dev@riftbound.local"); await p.fill("#loginPass", "dev"); await p.click("#loginBtn"); await p.waitForLoadState("networkidle").catch(()=>{});
await p.waitForTimeout(600);
await p.goto("http://localhost:3917/play?cb=" + Date.now(), { waitUntil: "domcontentloaded" });
await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await p.goto("http://localhost:3917/play?cb=" + Date.now(), { waitUntil: "networkidle" });
await p.click('.mode-card:has-text("Goldfish")');
await p.waitForTimeout(400);
await p.click('#soloDeckPicker button.start-btn');
await p.waitForSelector('#pregameOverlay.visible, #player-hand .card', { timeout: 10000 }).catch(() => {});
for (let i = 0; i < 12; i++) {
  if (!(await p.$('#pregameOverlay.visible, #coinOverlay.visible'))) break;
  const btns = await p.locator('#pregameOverlay button:not([disabled]), .mulligan-btn-keep, .bf-choice').all();
  if (btns.length) { await btns[0].click().catch(() => {}); await p.waitForTimeout(800); } else await p.waitForTimeout(400);
}
await p.waitForSelector('#player-hand .card', { timeout: 10000 }).catch(() => {});
await p.waitForTimeout(600);

const moves = () => p.evaluate(() => ((window as any).__rbAvailableMoves || []).map((m: any) => ({ moveId: m.moveId, params: m.params })));
const exec = async (m: any) => { await p.evaluate((m) => (window as any).executeMove(m.moveId, m.params), m); await p.waitForTimeout(700); };
const gs = () => p.evaluate(() => (window as any).__rbGameState);

let unitId: string | null = null;
outer: for (let turn = 0; turn < 12; turn++) {
  // exhaust all runes
  for (let i = 0; i < 12; i++) {
    const ms = await moves();
    const ex = ms.find((m: any) => m.moveId === "exhaustRune");
    if (!ex) break; await exec(ex);
  }
  let ms = await moves();
  const st = await gs();
  const baseUnits = (st.zones.base || []).filter((c: any) => c.cardType === "unit" && c.owner === "player-1");
  const ready = baseUnits.find((c: any) => !c.meta?.exhausted);
  const sm = ms.find((m: any) => m.moveId === "standardMove" && ready && m.params.unitIds?.[0] === ready.id);
  if (sm) { unitId = ready.id;
    const src = p.locator(`#player-base .card[data-card-id="${ready.id}"]`).first();
    const dst = p.locator(`.battlefield[data-bf-id="${sm.params.destination}"] .bf-art`).first();
    await src.dragTo(dst, { timeout: 5000 });
    await p.waitForTimeout(1200);
    console.log("dragged", ready.id, "->", sm.params.destination);
    break outer; }
  const pu = ms.find((m: any) => m.moveId === "playUnit" && m.params.location === "base");
  if (pu) await exec(pu);
  ms = await moves();
  const et = ms.find((m: any) => m.moveId === "endTurn");
  if (et) await exec(et);
  await p.waitForTimeout(1500);
  // handle pending choices/chain crudely
  for (let i = 0; i < 6; i++) {
    const ms2 = await moves();
    const pass = ms2.find((m: any) => /pass|resolvePendingChoice/i.test(m.moveId));
    const st2 = await gs();
    if (st2.turn?.activePlayer === "player-1" && st2.turn?.phase === "main" && !st2.interaction?.chain?.active) break;
    if (pass) await exec(pass); else await p.waitForTimeout(800);
  }
}
await p.waitForTimeout(800);
const r = await p.evaluate((unitId) => {
  const gs: any = (window as any).__rbGameState;
  const bfz = Object.fromEntries(Object.keys(gs.zones).filter(k => k.startsWith("battlefield-")).map(k => [k, gs.zones[k].map((c: any) => ({ id: c.id, name: c.name, owner: c.owner, exh: c.meta?.exhausted, meta: c.meta }))]));
  const el = unitId ? document.querySelector(`#battlefieldRow .card[data-card-id="${unitId}"]`) : null;
  return {
    unitId, bfz, showdown: gs.interaction?.showdown,
    found: !!el, cls: el?.className, transform: el ? getComputedStyle(el).transform : null,
    bfExh: document.querySelectorAll('#battlefieldRow .card.card--exhausted').length,
    bfCards: [...document.querySelectorAll('#battlefieldRow .card')].map(e => ({ id: e.getAttribute("data-card-id"), cls: e.className })),
  };
}, unitId);
console.log(JSON.stringify(r, null, 1));
await p.screenshot({ path: "/tmp/claude-999/-root-src-anthropic/d48e3a2d-1aa8-4d74-b4c6-a677aa8236c2/scratchpad/my_bf.png" });
console.log("errs", errs);
await b.close();

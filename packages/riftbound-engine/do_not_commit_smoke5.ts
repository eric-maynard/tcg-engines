import { BrowserBackend, attachBrowserGame } from "./src/harness/browser";
const t = () => new Date().toISOString().slice(14, 23);
for (let i = 0; i < 6; i++) {
  const backend = await BrowserBackend.launch({ mode: "test", actMode: "visual" });
  const errs: string[] = [];
  backend.page.on("console", (m: any) => { if (m.type() === "error") errs.push(m.text()); });
  backend.page.on("pageerror", (e: any) => errs.push("PAGEERR " + String(e)));
  backend.page.on("dialog", (d: any) => { errs.push("DIALOG " + d.message()); d.dismiss(); });
  const game = attachBrowserGame(backend);
  const p1 = game.p1;
  await p1.tapRune(); await p1.tapRune();
  let opt = p1.legal().find(o => o.moveId === "playUnit");
  let unit: string;
  if (opt) unit = opt.card!; else unit = (await backend.tutor("sfd-018-221")).cardId;
  await p1.play(unit);
  await game.settle({ policy: "first" });
  const { cardId: cleave } = await backend.tutor("ogn-004-298");
  await p1.cast(cleave, { targets: unit });
  console.log(t(), i, "cast done; chain", game.chain().length, "decision", game.decision()?.kind, (game.decision() as any)?.context, (game.decision() as any)?.passKey);
  const watchdog = setTimeout(async () => {
    console.log(t(), i, "WATCHDOG: pass hung; errs", errs);
    try { await backend.screenshot(`/tmp/claude-999/-root-src-anthropic/d48e3a2d-1aa8-4d74-b4c6-a677aa8236c2/scratchpad/hang${i}.png`); console.log("shot ok"); } catch (e) { console.log("shot failed", String(e)); }
  }, 6000);
  await p1.pass();
  clearTimeout(watchdog);
  await game.settle();
  console.log(t(), i, "ok", game.zoneOf(cleave), backend.visualLog.at(-2)?.gesture, "errs", errs.length, errs.slice(0,3));
  await backend.close();
}

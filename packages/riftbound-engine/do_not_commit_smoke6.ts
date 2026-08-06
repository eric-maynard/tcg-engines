import { BrowserBackend, attachBrowserGame } from "./src/harness/browser";
import { withTimeout } from "./src/harness/browser/playwright-loader";
const t = () => new Date().toISOString().slice(14, 23);
const mode = (process.argv[2] ?? "visual") as "visual" | "semantic";
for (let i = 0; i < 14; i++) {
  let backend: BrowserBackend | undefined;
  const errs: string[] = [];
  try {
    backend = await BrowserBackend.launch({ mode: "test", actMode: mode, settle: false });
    backend.rawPage.on("console", (m: any) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + ": " + m.text()); });
    backend.rawPage.on("pageerror", (e: any) => errs.push("PAGEERR " + String(e)));
    backend.rawPage.on("crash", () => errs.push("CRASH"));
    await backend.settleOpening();
    const game = attachBrowserGame(backend);
    await game.p1.tapRune(); await game.p1.tapRune();
    console.log(t(), i, mode, "ok energy", game.p1.energy());
  } catch (e) {
    console.log(t(), i, mode, "FAILED:", String(e).slice(0, 200));
    console.log("errs:", errs);
    if (backend) {
      const alive = await withTimeout(backend.rawPage.evaluate<number>("1+1"), 3000, "probe").catch((e) => "probe failed: " + String(e).slice(0, 100));
      console.log("trivial evaluate:", alive);
      const gs = await withTimeout(backend.rawPage.evaluate<unknown>("typeof window.__rbGameState + ':' + (window.__rbGameState ? Object.keys(window.__rbGameState).length : 0) + ':' + lastSeq"), 3000, "probe2").catch((e) => "probe2 failed: " + String(e).slice(0, 100));
      console.log("gs probe:", gs);
      const big = await withTimeout(backend.rawPage.evaluate<unknown>("JSON.stringify(window.__rbGameState).length"), 3000, "probe3").catch((e) => "probe3 failed: " + String(e).slice(0, 100));
      console.log("json len:", big);
      const rf = await withTimeout(backend.rawPage.evaluate<unknown>("(() => { const gs = window.__rbGameState; return { seq: lastSeq, state: gs }; })()"), 5000, "probe4").then(() => "ok").catch((e) => "probe4 failed: " + String(e).slice(0, 100));
      console.log("state via evaluate:", rf);
      const rf2 = await withTimeout(backend.rawPage.evaluate<unknown>("(() => JSON.parse(JSON.stringify(window.__rbGameState)))()"), 5000, "probe5").then(() => "ok").catch((e) => "probe5 failed: " + String(e).slice(0, 100));
      console.log("state via JSON roundtrip:", rf2);
    }
  }
  await backend?.close();
}

import { BrowserBackend } from "./src/harness/browser";
import { READ_FRAME } from "./src/harness/browser/page-scripts";
import { withTimeout } from "./src/harness/browser/playwright-loader";
const t = () => new Date().toISOString().slice(14, 23);
const backend = await BrowserBackend.launch({ mode: "test", settle: false });
const len = await backend.rawPage.evaluate<number>(`JSON.stringify((${READ_FRAME.trim().replace(/\)\(\)$/, ")")})()).length`).catch(e => String(e));
console.log("READ_FRAME json length", len);
const which = process.argv[2] ?? "big";
const script = which === "big" ? READ_FRAME : `(() => ({ seq: lastSeq, n: Object.keys(window.__rbGameState.zones).length }))()`;
let stalls = 0;
for (let i = 0; i < 600; i++) {
  const t0 = Date.now();
  try {
    await withTimeout(backend.rawPage.evaluate(script), 5000, "ev");
  } catch (e) {
    stalls++;
    console.log(t(), i, "STALL", String(e).slice(0, 80));
    // is it recoverable?
    const again = await withTimeout(backend.rawPage.evaluate("1"), 5000, "probe").then(() => "recovered").catch(() => "still stuck");
    console.log("  probe:", again);
    if (again === "still stuck") break;
  }
  const dt = Date.now() - t0;
  if (dt > 500) console.log(t(), i, "slow", dt);
}
console.log("done", which, "stalls", stalls);
await backend.close();
process.exit(0);

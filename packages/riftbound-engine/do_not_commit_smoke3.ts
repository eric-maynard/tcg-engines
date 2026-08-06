import { BrowserBackend, attachBrowserGame } from "./src/harness/browser";
for (let i = 0; i < 3; i++) {
const backend = await BrowserBackend.launch({ mode: "test", actMode: "visual" });
const game = attachBrowserGame(backend);
const p1 = game.p1;
console.log("launch log", backend.visualLog);
const r = await p1.tapRune();
console.log("tap1", backend.visualLog.at(-1), r.executed[0]);
const r2 = await p1.tapRune();
console.log("tap2", backend.visualLog.at(-1));
await backend.close();
}

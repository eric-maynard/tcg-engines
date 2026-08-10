import { test, expect } from "bun:test";
import { P1, P2, scenario } from "../harness";
test("dbg", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 5, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", "ogn-096-298", "sentry")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, "unl-120-219", "rengar")
      .build();
  await game.p2.move("raider", "bf1");
  await game.p2.pass(); await game.p1.pass();
  for (let i = 0; i < 12; i++) {
    const d:any = game.decision();
    console.log(i, d?.kind, d?.context, d?.seat, d?.prompt, JSON.stringify(game.chain().map(c=>c.cardId)), "ctrl", game.gameState.battlefields.bf1?.controller, "pts",game.p1.points(), game.p2.points(), "canRengar", game.p1.can("play","rengar"), game.zoneOf("sentry"), JSON.stringify(game.gameState.interaction?.showdownStack?.map(s=>({a:s.active,bf:s.battlefieldId}))));
    if (d?.kind==="distribute") { await game.seat(d.seat).distribute(d.defaultAllocation); continue; }
    if (game.chain().some(c=>c.cardId==="sentry") && game.p1.can("play","rengar")) { console.log(JSON.stringify(game.p1.option("play","rengar")?.fields)); await game.p1.play("rengar", {to:"bf1"}); continue; }
    if (d?.kind==="action" && d.context!=="main") await game.acting().pass(); else break;
  }
  console.log(game.locationOf("rengar"), JSON.stringify(game.gameState.battlefields.bf1), game.p1.points(), game.p2.points(), game.zoneOf("raider"), game.p1.hand());
});

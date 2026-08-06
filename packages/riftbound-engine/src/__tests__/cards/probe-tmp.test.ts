import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";
const CARD = "ogs-008-024";
test("probe", async () => {
  const game = await scenario()
    .resources(P1, { energy: 6, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4 }, "foe").unit(P2, "base", { might: 6 }, "home").unit(P1, "base", { might: 2 }, "ally").unit(P1, "bf1", { might: 3 }, "ally2")
    .hand(P1, CARD, "duel").build();
  console.log(JSON.stringify(game.p1.option("cast","duel")?.fields));
  await game.p1.cast("duel", { targets: ["ally", "foe"] });
  console.log(game.p1.resources());
  let s = await game.settle(); console.log(s.reason, JSON.stringify(game.decision()).slice(0,300));
  console.log(game.zoneOf("ally"), game.state("ally").might, game.state("ally").damage, game.zoneOf("foe"), game.has("foe") && game.state("foe").damage);
});

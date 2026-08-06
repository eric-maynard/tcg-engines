/**
 * Cull the Weak — ogn-209-298 · Spell · Order · 2 energy + [order]
 *
 *   Each player kills one of their units.
 *
 * Every player (caster included) chooses one unit THEY control and kills it;
 * a player with no units does nothing. No [Action]/[Reaction]: playable only
 * on your own turn in a Neutral Open state (rules 310.1.a / 316.5.b).
 * Where the engine asks the caster for a choice while playing, we feed it
 * "myWeak" via `answers` so the outcome clauses can still be checked.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-209-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 1, name: "MyWeak" }, "myWeak")
    .unit(P1, "base", { might: 5, name: "MyBig" }, "myBig")
    .unit(P2, "bf1", { might: 1, name: "FoeWeak" }, "foeWeak")
    .unit(P2, "base", { might: 5, name: "FoeBig" }, "foeBig")
    .hand(P1, CARD, "cull");
}

describe("Cull the Weak (ogn-209-298)", () => {
  test("the caster kills the unit they chose among their own; pays 2 energy + 1 order; spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("cull", { answers: ["myWeak"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("myWeak")).toBe("trash");
    expect(game.zoneOf("myBig")).toBe("base");
    expect(game.zoneOf("cull")).toBe("trash");
  });

  test.failing("BUG: EACH player kills one of their units — the opponent loses the unit they pick too", async () => {
    // Expected: P1 kills myWeak and P2 (choosing for themselves) kills foeWeak; the big units survive.
    // Actual: the spell is executed as "kill a unit" — only the caster's single pick dies.
    const game = await board().script(P2, ["foeWeak"]).build();
    await game.p1.cast("cull", { answers: ["myWeak"] });
    await game.settle();
    if (game.decision()?.kind === "pick" && game.actingSeat() === P2) {
      await game.p2.pick("foeWeak");
      await game.settle();
    }
    expect(game.zoneOf("myWeak")).toBe("trash");
    expect(game.zoneOf("foeWeak")).toBe("trash");
    expect(game.zoneOf("myBig")).toBe("base");
    expect(game.zoneOf("foeBig")).toBe("base");
  });

  test.failing("BUG: 'one of THEIR units' — the caster may only choose among units they control; the opponent chooses theirs", async () => {
    // Expected: P1's choice is limited to myWeak/myBig, and P2 is the one asked about foeWeak/foeBig.
    // Actual: the caster is offered all four units as a single target and P2 is never asked.
    const game = await board().build();
    const offered = (game.p1.option("cast", "cull")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(offered.flat()).not.toContain("foeWeak");
    expect(offered.flat()).not.toContain("foeBig");
    await game.p1.cast("cull", { answers: ["myBig"] });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  });

  test("a player with no units kills nothing; the other player still loses one (caster has none → only the foe's unit dies)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .unit(P2, "base", { might: 3, name: "Lonely" }, "lonely")
      .script(P2, ["lonely"])
      .hand(P1, CARD, "cull")
      .build();
    await game.p1.cast("cull", { answers: ["lonely"] });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("lonely")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
  });

  test("no [Action] keyword: not playable on the opponent's turn, not even during a showdown (rule 316.5.b)", async () => {
    const game = await board().active(P2).battlefield("bf2").unit(P2, "base", { might: 1 }, "walker").build();
    expect(game.p1.can("cast", "cull")).toBe(false);
    await game.p2.move("walker", "bf2");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "cull")).toBe(false);
  });

  test("cost: unaffordable without the order power or with 1 energy", async () => {
    const noOrder = await board().resources(P1, { energy: 2, power: { order: 0 } }).build();
    expect(noOrder.p1.can("cast", "cull")).toBe(false);
    const low = await board().resources(P1, { energy: 1, power: { order: 1 } }).build();
    expect(low.p1.can("cast", "cull")).toBe(false);
  });
});

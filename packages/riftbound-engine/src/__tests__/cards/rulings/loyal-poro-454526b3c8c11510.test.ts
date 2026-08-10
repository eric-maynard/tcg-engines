/**
 * Ruling 454526b3c8c11510 — Loyal Poro (UNL-156 → unl-156-219) · Unit · Order · [3] · 3 Might · Poro
 *   "[Deathknell] If I didn't die alone, draw 1. (I wasn't alone if there were other friendly units here.)"
 *
 * Q: If Loyal Poro dies at a battlefield when attacked by two enemy units, does it die alone?
 * A: Enemy units are irrelevant — "alone" only looks at OTHER FRIENDLY units at that location at the moment of death.
 *    No other friendly unit there ⇒ it died alone (no draw); one or more other friendly units there ⇒ not alone (draw 1).
 * Rules: 741.1 / 740.2.a (alone = no other friendly units at the same location), 808 (Deathknell), 323.4 (look-back at
 *        the moment of death).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LOYAL_PORO = "unl-156-219";

/** P2's turn. P1 holds bf1 with the Poro (and optionally a 6-Might Guard). P2 attacks with TWO units, Fang (4) and Claw (4). */
function board(withGuard: boolean) {
  const s = scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LOYAL_PORO, "poro")
    .unit(P2, "base", { might: 4, name: "Fang" }, "fang")
    .unit(P2, "base", { might: 4, name: "Claw" }, "claw")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
  return withGuard ? s.unit(P1, "bf1", { might: 6, name: "Guard" }, "guard") : s;
}

describe("Ruling 454526b3c8c11510 — two enemy attackers don't keep Loyal Poro company: 'alone' counts friendly units only", () => {
  test("Poro is P1's only unit at bf1 and dies to two attackers: it died ALONE — the Deathknell resolves but draws nothing", async () => {
    const game = await board(false).build();
    await game.p2.move(["fang", "claw"], "bf1");
    expect(game.p2.units("bf1").toSorted()).toEqual(["claw", "fang"]); // two enemy units present at the moment of death
    expect(game.p1.units("bf1")).toEqual(["poro"]);
    await game.settle();
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
      await game.settle();
    }
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toEqual([]); // no draw
    expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("same two attackers, but a friendly Guard is also at bf1 when the Poro dies: NOT alone — the Deathknell draws exactly 1", async () => {
    const game = await board(true).build();
    await game.p2.move(["fang", "claw"], "bf1");
    // Let both pass; when P2 (attacker) assigns its 8 damage, make sure the Poro takes lethal and the Guard survives.
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "distribute" && d.seat === P2) {
        await game.p2.distribute({ guard: 5, poro: 3 });
      } else if (d.kind === "distribute") {
        await game.seat(d.seat).distribute(d.defaultAllocation ?? {});
      } else if (d.kind === "order") {
        await game.acceptTriggerOrder();
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "action") {
        const proc = d.options.find((o) => o.verb === "resolveCombat");
        if (!proc) {
          break;
        }
        await game.seat(d.seat).choose(proc.key);
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // the friendly unit that was "here" when it died
    expect(game.p1.hand()).toEqual(["d1"]); // drew exactly 1
    expect(game.violations()).toEqual([]);
  });
});

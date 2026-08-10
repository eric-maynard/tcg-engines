/**
 * Ruling 25fd3cb1638d6ed5 — Determined Sentry (UNL-111 → unl-111-219) · Unit · 1 Might "I can't move to base."
 *   × Lonely Poro (SFD-036 → sfd-036-221) · Unit · 2 Might "[Deathknell] — If I died alone, draw 1. (I'm alone if there are
 *     no other friendly units here.)"
 *   × Bellows Breath (SFD-080 → sfd-080-221) · Spell · 1 + [mind] · [Action] · [Repeat] [1][mind]
 *     "Deal 1 to up to three units at the same location."
 *
 * Q: Sentry + Poro in my base; the opponent plays Bellows Breath (Repeat paid) into my base. Do I draw? How does Repeat sit
 *    on the chain?
 * A: No draw. If the damage is lethal to both they die SIMULTANEOUSLY, and "alone" is checked at the moment of death — the
 *    Sentry was still there, so the Poro did not die alone. Repeat does not add a second chain item: Bellows Breath is ONE
 *    item whose instruction is executed a second time during the same resolution (by then the units are already dead).
 * Rules: 820.1.d / 820.1.d.1 (Repeat = execute the instructions again within one item), 808 + 323.4 (Deathknell notes the
 *        state at death), 740.2.a ("alone").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DETERMINED_SENTRY = "unl-111-219";
const LONELY_PORO = "sfd-036-221";
const BELLOWS_BREATH = "sfd-080-221";

/**
 * P2's turn with exactly 2 energy + 2 mind (Bellows Breath + its Repeat). P1's base: Determined Sentry (1) and a Lonely
 * Poro (2) already carrying 1 damage this turn — so a single 1-damage execution is lethal to BOTH, the case the answer rules on.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2, power: { mind: 2 } })
    .unit(P1, "base", DETERMINED_SENTRY, "sentry")
    .unit(P1, "base", LONELY_PORO, "poro", { damage: 1 })
    .hand(P2, BELLOWS_BREATH, "bb");
}

describe("Ruling 25fd3cb1638d6ed5 — Poro and Sentry die together to a Repeated Bellows Breath: not 'alone', no draw; Repeat is one chain item", () => {
  test("Repeat paid: Bellows Breath is a SINGLE chain item (not two), costing 1+[mind] plus the 1+[mind] Repeat", async () => {
    const game = await board().build();
    const opt = game.p2.option("cast", "bb");
    expect(opt?.fields.find((f) => f.arg === "repeat")?.options).toEqual([1]);
    await game.p2.cast("bb", { repeat: 1, targets: ["sentry", "poro"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "bb", controller: P2, triggered: false, type: "spell" });
    expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["poro", "sentry"]);
  });

  test("on resolution the first execution kills BOTH units simultaneously; the Poro was not alone when it died → its Deathknell does not draw; nothing is left for the second execution", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    const deckBefore = game.p1.deck().length;
    await game.p2.cast("bb", { repeat: 1, targets: ["sentry", "poro"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore); // no draw
    expect(game.p1.deck()).toHaveLength(deckBefore);
    // No Poro trigger lingered on the chain / no prompt for P1.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: the same Bellows Breath on a Poro that IS alone in base → it dies alone and P1 draws 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2, power: { mind: 2 } })
      .unit(P1, "base", LONELY_PORO, "poro", { damage: 1 })
      .hand(P2, BELLOWS_BREATH, "bb")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p2.cast("bb", { repeat: 1, targets: ["poro"] });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
  });
});

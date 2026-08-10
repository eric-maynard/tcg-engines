/**
 * Ruling c45d1d9cb11f29ab — Nidalee, Cat Form (UNL-114 → unl-114-219) · Unit · Body · 3+[body] · 4 Might
 *     "[Ambush] (You may play me as a Reaction to a battlefield where you have units.) When I win a combat, draw 1."
 *   × Wuju Bladesman - Starter (Yi legend, OGS-019 → ogs-019-024) "While a friendly unit defends alone, it gets +2 Might."
 *
 * Q: With the Yi legend, my unit defends my battlefield alone (+2). The attacker plays spells; in reaction I Ambush in
 *    Nidalee to defend too. Does my original unit keep the +2?
 * A: No. Yi's bonus is a continuous "while … alone" passive checked constantly; the moment Nidalee arrives the unit is no
 *    longer alone and the +2 disappears immediately (no chain, no trigger).
 * Rules: 364.3 (continuous passives re-evaluated constantly), 741.1 (alone), Ambush 807 (play as a Reaction to a
 *        battlefield where you have units).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NIDALEE_CAT_FORM = "unl-114-219";
const WUJU_BLADESMAN_STARTER = "ogs-019-024";
/** The attacker's "spell": a cheap Action self-pump, just to open a chain P1 can react to. */
const RALLY_CRY = {
  abilities: [{ effect: { amount: 1, duration: "turn", target: { controller: "friendly", type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Rally Cry",
  timing: "action",
} as const;

/** P2's turn. P1 (Yi legend) holds bf1 with a lone Disciple (3) and has Nidalee with exactly 3+[body]. P2: Attacker (4) in base, Rally Cry + [1]. */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, WUJU_BLADESMAN_STARTER, "yi")
    .resources(P1, { energy: 3, power: { body: 1 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Disciple" }, "disciple")
    .unit(P2, "base", { might: 4, name: "Attacker" }, "attacker")
    .hand(P1, NIDALEE_CAT_FORM, "nidalee")
    .hand(P2, RALLY_CRY, "rally");
}

/** Attacker enters bf1 (Disciple defends alone); P2 casts Rally Cry on the Attacker and passes → P1 holds priority. */
async function attackedAndSpellPending(game: Game): Promise<void> {
  expect(game.state("disciple").might).toBe(3);
  await game.p2.move("attacker", "bf1");
  expect(game.state("disciple").combatRole).toBe("defender");
  expect(game.state("disciple").might).toBe(5); // defending ALONE: Yi's +2 is on
  await game.p2.cast("rally", { targets: "attacker" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling c45d1d9cb11f29ab — Ambushing Nidalee in ends Yi's 'defends alone' +2 at once", () => {
  test("premise: while the Disciple defends bf1 alone it is 3 + 2 = 5, and in the reaction window P1 may Ambush Nidalee in — only to bf1 (where P1 has units)", async () => {
    const game = await board().build();
    await attackedAndSpellPending(game);
    expect(game.p1.can("play", "nidalee")).toBe(true);
    const where = game.p1.option("playUnit", "nidalee")?.fields.find((f) => f.arg === "to" || f.name === "location")?.options ?? [];
    expect(where).toEqual(["battlefield-bf1"]);
  });

  test("P1 plays Nidalee to bf1 as a Reaction (3+[body]): the instant she is there the Disciple is no longer alone — its Might is back to 3 immediately, before the pending spell even resolves (no trigger, no chain item for it)", async () => {
    const game = await board().build();
    await attackedAndSpellPending(game);
    await game.p1.play("nidalee", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("nidalee")).toBe("battlefield-bf1");
    expect(game.zoneOf("rally")).toBe("chain"); // the attacker's spell is still pending …
    expect(game.state("disciple").might).toBe(3); // … yet the +2 is already gone
    expect(game.chain().some((c) => c.cardId === "yi")).toBe(false); // a passive: nothing of Yi's on the chain
  });

  test("after the chain empties both defend (Disciple 3, Nidalee 4 — neither is 'alone', so no +2 for either); the 5-Might Attacker then loses the combat and P1 keeps bf1", async () => {
    const game = await board().build();
    await attackedAndSpellPending(game);
    await game.p1.play("nidalee", { to: "bf1" });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("attacker").might).toBe(5); // Rally Cry resolved
    expect(game.state("disciple")).toMatchObject({ combatRole: "defender", might: 3 });
    expect(game.state("nidalee")).toMatchObject({ combatRole: "defender", might: 4 });
    await game.settle();
    expect(game.zoneOf("attacker")).toBe("trash"); // 5 vs 3 + 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});

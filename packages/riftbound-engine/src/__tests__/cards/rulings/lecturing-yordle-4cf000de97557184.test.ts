/**
 * Ruling 4cf000de97557184 — Lecturing Yordle (OGN-087 → ogn-087-298) · 2 Might · [Tank] "When you play me, draw 1."
 *   × Ahri, Inquisitive (OGN-119 → ogn-119-298) · 3 Might "When I attack or defend, give an enemy unit here -2 [Might] this
 *     turn, to a minimum of 1 [Might]."
 *   × Nine-Tailed Fox (Ahri Legend, ogn-255-298) "When an enemy unit attacks a battlefield you control, give it -1 [Might]
 *     this turn, to a minimum of 1 [Might]."
 *   × Cleave (OGN-004 → ogn-004-298) · Action · [1] "Give a unit [Assault 3] this turn."
 *
 * Q: Attacking with Lecturing Yordle into Ahri (Inquisitive) under the Ahri Legend — Cleave before or after the showdown starts?
 * A: After. Before: 2 +3 (Assault, once attacking) -1 (Legend) -2 (Ahri) = 2. After: 2 -1 (Legend) -0 (Ahri: already at the
 *    floor of 1, so nothing is applied) then +3 from Cleave = 4. The "minimum 1" reductions are fixed when they resolve.
 * Rules: 807 (Assault only while attacking), 383.3.d (P2 orders its two triggers), 43x "to a minimum of" = apply only as
 *        much reduction as keeps the unit at ≥1 at that moment (locked thereafter).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LECTURING_YORDLE = "ogn-087-298";
const AHRI_INQUISITIVE = "ogn-119-298";
const NINE_TAILED_FOX = "ogn-255-298";
const CLEAVE = "ogn-004-298";

type OrderD = Extract<Decision, { kind: "order" }>;

/** P1's turn with [1] for Cleave. P2 (Nine-Tailed Fox legend) holds bf1 with Ahri, Inquisitive. Yordle ready in P1's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .legend(P2, NINE_TAILED_FOX, "fox")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", AHRI_INQUISITIVE, "ahri")
    .unit(P1, "base", LECTURING_YORDLE, "yordle")
    .hand(P1, CLEAVE, "cleave");
}

/**
 * Yordle attacks bf1. Both of P2's triggers fire at once → P2 is asked to order them; `legendFirst` puts the Legend on top
 * (resolves first, as in the ruling's arithmetic). Then resolve the whole initial chain and stop at P1's Focus.
 */
async function attackAndResolveTriggers(game: Game, legendFirst: boolean): Promise<void> {
  await game.p1.move("yordle", "bf1");
  expect(game.state("yordle").combatRole).toBe("attacker");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "order", seat: P2 });
  const items = (d as OrderD).items;
  expect(items.map((i) => i.card).toSorted()).toEqual(["ahri", "fox"]);
  const key = (card: string) => items.find((i) => i.card === card)!.key;
  // first = bottom, last = top (resolves first)
  await game.p2.order(legendFirst ? [key("ahri"), key("fox")] : [key("fox"), key("ahri")]);
  for (let i = 0; i < 10; i++) {
    const cur = game.decision();
    if (cur?.kind === "pick" && cur.seat === P2) {
      await game.p2.answer({ keys: [cur.options[0]!.key], kind: "pick" }); // Ahri's "an enemy unit here" — only the Yordle
    } else if (cur?.kind === "action" && cur.context === "chain") {
      await game.seat(cur.seat).passPriority();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

describe("Ruling 4cf000de97557184 — Cleave on Lecturing Yordle vs Ahri + Ahri Legend: after the showdown starts (4) beats before (2)", () => {
  test("Cleave BEFORE moving: in base the Yordle is still 2 (Assault only counts while attacking); on attacking it is 5", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "yordle" });
    await game.settle();
    expect(game.state("yordle").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("yordle").might).toBe(2);
    await game.p1.move("yordle", "bf1");
    expect(game.state("yordle").might).toBe(5); // 2 + Assault 3, before any trigger resolves
    expect(game.decision()).toMatchObject({ kind: "order", seat: P2 }); // P2 orders Legend + Ahri triggers
  });

  test("Cleave BEFORE, triggers resolved Legend then Ahri (the ruling's sequence): 5 − 1 = 4, − 2 = 2 → the Yordle fights at 2", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "yordle" });
    await game.settle();
    await attackAndResolveTriggers(game, true);
    expect(game.state("yordle").might).toBe(2);
    expect(game.state("yordle").mightModifier).toBe(-3);
  });

  // The order of P2's two reductions does not matter here: the "minimum 1" floor is measured against CURRENT Might,
  // which includes the Cleave-granted Assault while attacking (807.1.c).
  test("Cleave BEFORE, triggers resolved Ahri then Legend: 5 − 2 = 3, − 1 = 2 → the Yordle also fights at 2", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "yordle" });
    await game.settle();
    await attackAndResolveTriggers(game, false);
    expect(game.state("yordle").might).toBe(2);
  });

  test("Cleave AFTER the showdown starts: 2 − 1 (Legend) = 1, Ahri's −2 applies nothing (already at the floor), then Cleave in the showdown: 1 + 3 = 4", async () => {
    const game = await board().build();
    await attackAndResolveTriggers(game, true);
    // Both "minimum 1" reductions have resolved: net −1, Yordle at 1.
    expect(game.state("yordle").might).toBe(1);
    expect(game.state("yordle").mightModifier).toBe(-1);
    // Now (P1 has Focus, empty chain) the Action-speed Cleave is playable inside the showdown.
    expect(game.p1.can("cast", "cleave")).toBe(true);
    await game.p1.cast("cleave", { targets: "yordle" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("yordle").combatRole).toBe("attacker");
    expect(game.state("yordle").might).toBe(4); // the earlier reductions stay locked at −1; they do not re-clamp
    expect(game.violations()).toEqual([]);
  });

  test("Cleave AFTER, other trigger order (Ahri then Legend): 2 − 1 (Ahri, floored) = 1, Legend applies nothing, + 3 = 4 as well", async () => {
    const game = await board().build();
    await attackAndResolveTriggers(game, false);
    expect(game.state("yordle").might).toBe(1);
    await game.p1.cast("cleave", { targets: "yordle" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("yordle").might).toBe(4);
  });
});

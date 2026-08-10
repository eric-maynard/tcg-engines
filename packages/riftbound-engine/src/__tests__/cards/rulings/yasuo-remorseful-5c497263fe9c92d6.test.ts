/**
 * Ruling 5c497263fe9c92d6 — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Unit · Calm · [6] · 6 Might
 *   "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Nine-Tailed Fox (OGN-255 → ogn-255-298) · Legend — "When an enemy unit attacks a battlefield you control,
 *     give it -1 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Yasuo attacks a battlefield controlled by the Nine-Tailed Fox player. In what order do the two triggers go on
 *    the chain?
 * A: The Attacker (who has Focus) adds theirs first, the Defender last: Yasuo's "When I attack" is FIRST, the Fox's
 *    "When an enemy unit attacks" is SECOND. LIFO ⇒ the Fox resolves first (Yasuo −1), then Yasuo's trigger.
 * Rules: Combat-initiated showdown initial chain ordering (Focus player → … → Defender), 340 (LIFO resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const NINE_TAILED_FOX = "ogn-255-298";

/** P1's turn. P2 (Nine-Tailed Fox legend) controls bf1 with a 7-Might Wall. Yasuo ready in P1's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
    .legend(P2, NINE_TAILED_FOX, "fox")
    .unit(P1, "base", YASUO, "yasuo");
}

/** Yasuo attacks bf1; answer his target prompt (Wall) / a soft trigger-order offer if surfaced; stop at the first priority window. */
async function yasuoAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "bf1");
  for (let i = 0; i < 6; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      const opt = d.options.find((o) => (o.card ?? o.key) === "wall");
      expect(opt).toBeDefined();
      await game.p1.answer({ keys: [opt!.key], kind: "pick" });
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.state("yasuo").combatRole).toBe("attacker");
  expect(game.state("wall").combatRole).toBe("defender");
  return game;
}

describe("Ruling 5c497263fe9c92d6 — attacker's trigger (Yasuo) goes on the chain before the defender's (Nine-Tailed Fox)", () => {
  test("initial chain order: Yasuo's 'When I attack' (P1, attacker) FIRST, Nine-Tailed Fox's trigger (P2, defender) SECOND — on top", async () => {
    const game = await yasuoAttacks();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true, targets: ["wall"] }),
      expect.objectContaining({ cardId: "fox", controller: P2, triggered: true }),
    ]);
    expect(game.state("yasuo").might).toBe(6);
    expect(game.state("wall").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("LIFO: the Fox's trigger resolves first — Yasuo drops to 5 Might while his own trigger still waits", async () => {
    const game = await yasuoAttacks();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    expect(game.state("yasuo").might).toBe(5);
    expect(game.state("wall").damage).toBe(0);
  });

  test("then Yasuo's trigger resolves for his CURRENT Might: Wall takes 5 (not 6)", async () => {
    const game = await yasuoAttacks();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("yasuo").might).toBe(5);
    expect(game.state("wall").damage).toBe(5);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});

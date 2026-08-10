/**
 * Interaction: Mystic Reversal (ogn-080-298) · Spell (Reaction) · Calm · 4 + [calm][calm][calm]
 *     "Gain control of a spell. You may make new choices for it."
 *   × Discipline (ogn-058-298) · Spell (Reaction) · Calm · 2
 *     "Give a unit +2 [Might] this turn. Draw 1."
 *   × Jae Medarda (sfd-142-221) · Unit · Chaos · 5 + [chaos][chaos] · 5 Might
 *     "When you choose me with a spell, draw 1."
 *
 * Question: P1's turn. P2 controls Jae Medarda in base; P1 controls unit A.
 *   YES case: P1 Disciplines A; P2 answers with Mystic Reversal, gains control and re-targets Discipline
 *   onto Jae. Does Jae's "when you choose me" fire for P2 at the re-choice, and how many cards does P2 net?
 *   NO case: P1 Disciplines Jae directly (legal — "a unit"). Does Jae trigger when P1 chooses her? P2 then
 *   Mystic Reversals and keeps Jae as the target. Does Jae trigger now?
 *
 * Rules: 751.1 (new choices must be objects not previously chosen), 752.1 (targets are re-choosable),
 * 753 (any subset), 754 (a newly-targeted object's Targeting Effects trigger at that time), 359.3.d
 * (resolved spell → OWNER's trash), 340.4 (after an item resolves, the controller of the newest chain
 * item gains priority).
 *
 * Expected:
 *   YES: the re-target is a new targeting event (754) and the chooser is the spell's controller P2 = Jae's
 *   controller → Jae triggers; the trigger lands above Discipline and resolves first (P2 draws 1), then
 *   Discipline resolves under P2: Jae +2 Might this turn, P2 draws 1. Net P2 +2 cards. Discipline → P1's
 *   trash; P1's 2 energy is not refunded.
 *   NO: P1 choosing Jae does not trigger her ("you" = Jae's controller). After the steal Jae is already the
 *   target, so keeping her is not a new choice (751.1) and nothing triggers (754). Discipline resolves
 *   under P2: Jae +2, P2 draws 1. Net P2 +1 card.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MYSTIC_REVERSAL = "ogn-080-298";
const DISCIPLINE = "ogn-058-298";
const JAE_MEDARDA = "sfd-142-221";

/** P1's turn. A (P1, 3 Might, base) · Jae (P2, base). P1 exactly affords Discipline; P2 exactly affords Mystic Reversal. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 4, power: { calm: 3 } })
    .unit(P1, "base", { might: 3, name: "Unit A" }, "a")
    .unit(P2, "base", JAE_MEDARDA, "jae")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, MYSTIC_REVERSAL, "mr");
}

/**
 * P1 Disciplines `target`, passes; P2 answers with Mystic Reversal; both pass so Mystic Reversal
 * resolves (LIFO) and P2 is now looking at its "you may make new choices" prompt for Discipline.
 */
async function stolen(target: "a" | "jae"): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("disc", { targets: target });
  await game.p1.passPriority();
  await game.p2.cast("mr");
  expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "mr"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

describe("Mystic Reversal re-targets Discipline onto Jae Medarda — does 'When you choose me' fire?", () => {
  // ---- shared setup facets --------------------------------------------------------------------------

  test("setup: after Mystic Reversal resolves P2 controls Discipline and is offered new choices (current target A; Jae and A listed)", async () => {
    const game = await stolen("a");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P2, targets: ["a"] })]);
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(d?.kind).toBe("pick");
    if (d?.kind === "pick") {
      expect(d.allowDecline).toBe(true); // "you MAY make new choices"
      expect(d.options.map((o) => o.card ?? o.key)).toContain("jae");
    }
    expect(game.zoneOf("mr")).not.toBe("hand");
  });

  // ---- YES case: Discipline on A, re-targeted onto Jae ------------------------------------------------

  // 754: choosing Jae as a NEW target during Mystic Reversal's resolution is a targeting event by the
  // spell's controller P2 = Jae's controller, so her trigger becomes a chain item above Discipline.
  test("YES — re-targeting onto Jae puts Jae's 'when you choose me' trigger on the chain above Discipline, controlled by P2 (754)", async () => {
    const game = await stolen("a");
    await game.p2.pick("jae");
    const chain = game.chain();
    expect(chain[0]).toMatchObject({ cardId: "disc", controller: P2, targets: ["jae"] });
    expect(chain).toHaveLength(2);
    expect(chain[1]).toMatchObject({ cardId: "jae", controller: P2, triggered: true });
  });

  // Jae's trigger resolves first (P2 draws 1), then Discipline under P2 (P2 draws 1) → net +2.
  test("YES — P2 nets +2 cards (Jae's trigger draw + Discipline's draw as its controller) (754, 359.3.d)", async () => {
    const game = await stolen("a");
    const p2Hand = game.p2.hand().length; // Mystic Reversal already left the hand
    const p2Deck = game.p2.deck().length;
    await game.p2.pick("jae");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p2.deck()).toHaveLength(p2Deck - 2);
  });

  test("YES — Discipline resolves under P2 on Jae: Jae 5→7 this turn, A untouched, P1 draws nothing", async () => {
    const game = await stolen("a");
    const p1Hand = game.p1.hand().length;
    await game.p2.pick("jae");
    expect(game.chain()[0]).toMatchObject({ cardId: "disc", controller: P2, targets: ["jae"] });
    await game.settle();
    expect(game.state("jae").might).toBe(7);
    expect(game.state("a").might).toBe(3);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p2.hand().length).toBeGreaterThanOrEqual(1); // at least Discipline's own draw went to P2
  });

  test("YES — Discipline goes to its OWNER P1's trash, Mystic Reversal to P2's; nobody is refunded (359.3.d)", async () => {
    const game = await stolen("a");
    await game.p2.pick("jae");
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p1.trash()).toContain("disc");
    expect(game.p2.trash()).not.toContain("disc");
    expect(game.p2.trash()).toContain("mr");
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("YES — the +2 is 'this turn': Jae is back to 5 after the turn ends", async () => {
    const game = await stolen("a");
    await game.p2.pick("jae");
    await game.settle();
    expect(game.state("jae").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("jae").might).toBe(5);
  });

  // ---- NO case: Discipline on Jae directly, then stolen and kept ---------------------------------------

  test("NO — P1 may Discipline the enemy Jae ('a unit'), and P1 choosing her does NOT trigger 'when YOU choose me'", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("disc", { targets: "jae" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P1, targets: ["jae"] })]);
    expect(game.p2.hand()).toHaveLength(p2Hand); // no draw for P2
    // let it resolve without any reversal: Jae +2, P1 draws, P2 still nothing
    const p1Hand = game.p1.hand().length;
    await game.settle();
    expect(game.state("jae").might).toBe(7);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  test("NO — after the steal the new-choices prompt shows Jae as the CURRENT target with A as the alternative", async () => {
    const game = await stolen("jae");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P2, targets: ["jae"] })]);
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(d?.kind).toBe("pick");
    if (d?.kind === "pick") {
      expect(d.allowDecline).toBe(true);
      expect(d.options.map((o) => o.card ?? o.key)).toContain("a");
    }
  });

  test("NO — keeping Jae (declining new choices) is not a new choice: no trigger, Discipline resolves under P2 → Jae 7, P2 nets exactly +1", async () => {
    const game = await stolen("jae");
    const p2Hand = game.p2.hand().length;
    const p1Hand = game.p1.hand().length;
    await game.p2.decline();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P2, targets: ["jae"] })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("jae").might).toBe(7);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p1.trash()).toContain("disc");
  });

  test("NO — re-selecting the already-chosen Jae is a no-op, not a re-target event (751.1/754): still no trigger, P2 nets exactly +1", async () => {
    const game = await stolen("jae");
    const p2Hand = game.p2.hand().length;
    const d = game.decision();
    const offersJae = d?.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "jae");
    if (offersJae) {
      await game.p2.pick("jae");
    } else {
      await game.p2.decline();
    }
    // no Jae trigger item was added either way
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P2, targets: ["jae"] })]);
    await game.settle();
    expect(game.state("jae").might).toBe(7);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.energy()).toBe(0);
  });

  // Expected (340.4): once Mystic Reversal has finished resolving (new choices answered), the controller
  // of the newest chain item — Discipline, now controlled by P2 — gains priority.
  // Actual: priority is handed to P1 (the turn player / Discipline's original controller).
  test("after Mystic Reversal resolves, priority goes to the controller of the newest item — P2, Discipline's new controller (340.4)", async () => {
    const game = await stolen("jae");
    await game.p2.decline();
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d?.seat).toBe(P2);
  });
});

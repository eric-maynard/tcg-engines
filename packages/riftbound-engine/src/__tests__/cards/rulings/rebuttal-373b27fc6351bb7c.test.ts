/**
 * Ruling 373b27fc6351bb7c — Rebuttal (VEN-152 → ven-152-166) · Reaction · Mind/Chaos · 1 + [C]
 *     "Choose a spell with Energy cost no more than [4]. You may pay [rainbow]. If you do, gain control of it and
 *      you may make new choices for it. Otherwise, counter it."
 *   × Mel, Newly Awakened (VEN-069 → ven-069-166) · Champion "[Empowered][>] Your spells and abilities can't be
 *     countered. …"
 *
 * Q: If I control an Empowered Mel, can my opponent Rebuttal a spell of mine?
 * A: Yes — Rebuttal only checks Energy cost ≤ 4, so it is legal. If they PAY the [rainbow] they take control of
 *    the spell (a control change, not a counter — Mel does nothing). If they DECLINE, the "counter it" is simply
 *    ignored (can't beats can) and your spell resolves normally.
 * Rules: 54 ("can't" beats "can"), 425 (counter), 356.1 (pay during resolution), 359.3.f.4 ("your" = controller).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUTTAL = "ven-152-166";
const MEL = "ven-069-166";
const SKULKER = "ogn-175-298";
/** P1's 2-cost spell: "Draw 2." — whoever controls it on resolution draws. */
const INSIGHT = {
  abilities: [{ effect: { amount: 2, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 2,
  name: "Insight",
  timing: "action",
};

/** P1's turn with Empowered Mel in base and exactly 2 for Insight. P2 holds Rebuttal with 1 + [chaos] and `extra` power. */
function board(extra: Record<string, number>) {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { chaos: 1, ...extra } })
    .unit(P1, "base", MEL, "mel", { empowered: true })
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["a1", "a2", "a3"])
    .deck(P2, [SKULKER, SKULKER, SKULKER], ["b1", "b2", "b3"])
    .hand(P1, INSIGHT, "insight")
    .hand(P2, REBUTTAL, "reb");
}

/** P1 casts Insight and passes; P2 answers with Rebuttal on it; everyone passes until Rebuttal resolves (P2's pay prompt). */
async function rebutted(extra: Record<string, number>): Promise<Game> {
  const game = await board(extra).build();
  expect(game.state("mel").isEmpowered).toBe(true);
  await game.p1.cast("insight");
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  // Legal despite Mel: Rebuttal's only requirement is Energy cost ≤ 4.
  expect(game.p2.can("cast", "reb")).toBe(true);
  const offered = (game.p2.option("cast", "reb")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
  expect(offered).toContain("insight");
  await game.p2.cast("reb", { targets: "insight" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["insight", "reb"]);
  while (game.decision()?.kind === "action" && game.chain().some((c) => c.cardId === "reb")) {
    await game.acting().passPriority();
  }
  return game;
}

describe("Ruling 373b27fc6351bb7c — Rebuttal vs a spell protected by Empowered Mel", () => {
  test("pay [rainbow]: P2 is asked (yes-no, P2), pays, and takes CONTROL of Insight — Mel does not stop a control change; Insight then draws 2 for P2, none for P1", async () => {
    const game = await rebutted({ rainbow: 1 });
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    await game.p2.yes();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    expect(game.zoneOf("reb")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "insight", controller: P2, countered: false })]);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    // Decline any "make new choices" offer (Insight has none) and let it resolve.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P2) {
        await game.p2.no();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p2.hand()).toEqual(expect.arrayContaining(["b1", "b2"]));
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.zoneOf("insight")).toBe("trash");
    expect(game.p1.trash()).toContain("insight"); // owner's trash
    expect(game.violations()).toEqual([]);
  });

  test("decline to pay: the fallback 'counter it' is IGNORED (Mel: can't be countered) — Insight is not countered and resolves normally: P1 draws 2", async () => {
    const game = await rebutted({}); // no [rainbow] to pay with
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P2) {
      expect(d.canAccept).toBe(false);
      await game.p2.no();
    }
    // Rebuttal has resolved; Insight is still on the chain, still P1's, NOT countered.
    expect(game.zoneOf("reb")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "insight", controller: P1, countered: false })]);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.p1.hand()).toHaveLength(p1Hand + 2);
    expect(game.p1.hand()).toEqual(expect.arrayContaining(["a1", "a2"]));
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.zoneOf("insight")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // Rebuttal's own cost is still spent
  });

  test("control: WITHOUT an Empowered Mel, declining to pay counters Insight — nobody draws", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 1, power: { chaos: 1 } })
      .unit(P1, "base", MEL, "mel") // not empowered
      .deck(P1, [SKULKER, SKULKER, SKULKER], ["a1", "a2", "a3"])
      .hand(P1, INSIGHT, "insight")
      .hand(P2, REBUTTAL, "reb")
      .build();
    expect(game.state("mel").isEmpowered).toBe(false);
    await game.p1.cast("insight");
    await game.p1.passPriority();
    await game.p2.cast("reb", { targets: "insight" });
    while (game.decision()?.kind === "action" && game.chain().some((c) => c.cardId === "reb")) {
      await game.acting().passPriority();
    }
    if (game.decision()?.kind === "yes-no" && game.actingSeat() === P2) {
      await game.p2.no();
    }
    const p1Hand = game.p1.hand().length;
    await game.settle();
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.zoneOf("insight")).toBe("trash");
  });
});

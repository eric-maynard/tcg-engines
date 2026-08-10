/**
 * Ruling baa2b50a3f9283dd — Lotus Trap (UNL-013 → unl-013-219) · Spell · [Hidden][Reaction] · "Choose a unit. Double all damage that
 *     would be dealt to it this turn."
 *   × Katarina, Reckless (UNL-023 → unl-023-219) · 5 Might · "When you hide a card, ready me. When you play a card from face down,
 *     deal 2 to an enemy unit."
 *
 * Q: If I play a spell from hidden that creates a replacement effect (Lotus Trap), does it apply to the damage from a "when you
 *    play a card from face down" trigger (Katarina)?
 * A: Yes. The card played from hidden fully RESOLVES before the "when you play" trigger is put on the chain; Lotus Trap's doubling
 *    is therefore already active when Katarina's 2 damage resolves → the chosen unit takes 4.
 * Rules: 811 (playing from face down), 383.4.a / 412 (a spell is "played" as it resolves — the play trigger follows), 366–372
 *        (replacement effect applies to later damage events this turn), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LOTUS_TRAP = "unl-013-219";
const KATARINA_RECKLESS = "unl-023-219";

/**
 * P2's turn 3. P1 holds bf1 with Katarina, Reckless (5) and has Lotus Trap face down there (hidden on an earlier turn).
 * P2's Bruiser (8) attacks bf1; P2 passes Focus so P1 may act.
 */
async function showdownP1ToAct(): Promise<Game> {
  const game = await scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", KATARINA_RECKLESS, "kat")
    .facedown(P1, "bf1", LOTUS_TRAP, "lotus")
    .unit(P2, "base", { might: 8, name: "Bruiser" }, "bruiser")
    .build();
  await game.p2.move("bruiser", "bf1");
  if (game.actingSeat() === P2) {
    await game.p2.passFocus();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "lotus")).toBe(true);
  return game;
}

/** P1 flips Lotus Trap choosing the Bruiser (here). */
async function flipLotusOnBruiser(game: Game): Promise<void> {
  await game.p1.reveal("lotus", { answers: ["bruiser"] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("bruiser");
  }
}

describe("Ruling baa2b50a3f9283dd — Lotus Trap from hidden resolves before Katarina's play-from-face-down trigger, so that 2 becomes 4", () => {
  test("right after the flip ONLY Lotus Trap is on the chain (targeting the Bruiser) — Katarina's 'when you play a card from face down' item is NOT there yet", async () => {
    const game = await showdownP1ToAct();
    await flipLotusOnBruiser(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lotus", controller: P1, targets: ["bruiser"] })]);
    expect(game.chain().some((c) => c.cardId === "kat")).toBe(false);
    expect(game.state("bruiser").damage).toBe(0);
  });

  test("Lotus Trap resolves (both pass): the Bruiser now carries the doubling for the turn, and only NOW does Katarina's trigger sit on the chain, aimed at the (only) enemy unit", async () => {
    const game = await showdownP1ToAct();
    await flipLotusOnBruiser(game);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("lotus")).toBe("trash");
    expect(game.state("bruiser").grantedKeywords.map((k) => k.keyword)).toContain("DoubleIncomingDamage");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("bruiser");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kat", controller: P1, targets: ["bruiser"], triggered: true })]);
    expect(game.state("bruiser").damage).toBe(0);
  });

  test("Katarina's trigger then resolves under the active replacement effect: 2 doubled → the Bruiser takes 4", async () => {
    const game = await showdownP1ToAct();
    await flipLotusOnBruiser(game);
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("bruiser");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("bruiser").damage).toBe(4);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });

  test("control: the same flip with a NON-doubling target choice (Lotus on Katarina herself) leaves Katarina's ping at its printed 2", async () => {
    const game = await showdownP1ToAct();
    await game.p1.reveal("lotus", { answers: ["kat"] });
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.some((o) => (o.card ?? o.key) === "kat") && game.chain().every((c) => c.cardId !== "kat") ? "kat" : "bruiser");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.state("bruiser").damage).toBe(2);
  });
});

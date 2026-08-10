/**
 * Ruling c7fc34f9f1b2de48 — Kha'Zix, Evolving Hunter (UNL-119 → unl-119-219) · Unit · [5][body] · 5 Might · [Hunt]
 *   "When I attack, you may spend 3 XP to deal damage equal to my Might to an enemy unit here."
 *   × Diana, Lunari (UNL-079 → unl-079-219) · Unit · [3] · 3 Might
 *   "When a showdown begins here, you may pay [1]. If you do, [Predict], then reveal the top card of your Main
 *    Deck. If it's a spell, draw it."
 *   × Tactical Retreat (UNL-175 → unl-175-219) · Reaction · [2] — "Choose a friendly unit. The next time it would
 *     die this turn, heal it, exhaust it, and recall it instead."
 *
 * Q: Opponent attacks my Diana with Kha'Zix; Tactical Retreat is on top of my deck. Can I draw it off Diana and
 *    play it before Kha'Zix's ability kills Diana?
 * A: No. Diana's "showdown begins here" trigger goes on the SAME chain as Kha'Zix's attack trigger but triggers
 *    FIRST (before attacker/defender triggers), so Kha'Zix's trigger sits on top and resolves first (LIFO).
 * Rules: 340–342 (showdown start → initial chain), 383 (trigger ordering), LIFO resolution.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KHAZIX = "unl-119-219";
const DIANA = "unl-079-219";
const TACTICAL_RETREAT = "unl-175-219";

/** P2's turn with 3 XP; Kha'Zix ready in base. P1 holds bf1 with Diana, has [3] (Diana's [1] + Retreat's [2]); Retreat on top of P1's deck. */
function board() {
  return scenario()
    .active(P2)
    .xp(P2, 3)
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", DIANA, "diana")
    .unit(P2, "base", KHAZIX, "khazix")
    .deck(P1, [TACTICAL_RETREAT], ["tr"])
    .hand(P2, { cardType: "unit", energyCost: 9, might: 1, name: "Filler" }); // keeps P2's hand non-empty; irrelevant
}

const isOptIn = (d: Decision | null, seat: string, card: string) =>
  d?.kind === "yes-no" && d.seat === seat && (d.source?.cardId === card || d.prompt.includes(card === "diana" ? "Diana" : "Kha'Zix"));

/** Kha'Zix attacks; both players opt into their triggers (Kha'Zix aims at Diana). Stops at the first priority window. */
async function attack(game: Game): Promise<void> {
  await game.p2.move("khazix", "bf1");
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (isOptIn(d, P1, "diana")) {
      await game.p1.yes();
    } else if (isOptIn(d, P2, "khazix")) {
      await game.p2.yes();
    } else if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick("diana");
    } else if (d?.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
}

describe("Ruling c7fc34f9f1b2de48 — Diana's showdown trigger is UNDER Kha'Zix's attack trigger, so Kha'Zix kills her first", () => {
  test("the initial chain has Diana's trigger first (bottom) and Kha'Zix's attack trigger on top of it", async () => {
    const game = await board().build();
    await attack(game);
    expect(game.chain().map((c) => ({ cardId: c.cardId, controller: c.controller, triggered: c.triggered }))).toEqual([
      { cardId: "diana", controller: P1, triggered: true },
      { cardId: "khazix", controller: P2, triggered: true },
    ]);
    expect(game.chain()[1]).toMatchObject({ targets: ["diana"] });
    expect(game.p2.xp()).toBe(0); // 3 XP spent
    // In P1's only window before Kha'Zix resolves, Tactical Retreat is still on top of the deck — not in hand.
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("tr")).toBe("mainDeck");
    expect(game.p1.hand()).not.toContain("tr");
    expect(game.p1.legal().some((o) => o.card === "tr")).toBe(false);
  });

  test("Kha'Zix's trigger resolves first: 5 damage kills Diana (3) while her own trigger is still on the chain and Retreat is still in the deck", async () => {
    const game = await board().build();
    await attack(game);
    await game.p2.passPriority();
    await game.p1.passPriority(); // top item (Kha'Zix) resolves
    expect(game.zoneOf("diana")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "diana", controller: P1, triggered: true })]);
    expect(game.zoneOf("tr")).toBe("mainDeck");
  });

  test("only afterwards does Diana's trigger resolve (pay [1], Predict, reveal Tactical Retreat → draw it) — too late: Diana is already in the trash and Retreat has no Diana to save", async () => {
    const game = await board().build();
    await attack(game);
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes(); // pay [1]
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.decline(); // Predict: keep Tactical Retreat on top so the reveal finds it
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("diana")).toBe("trash");
    expect(game.p1.energy()).toBe(2);
    expect(game.zoneOf("tr")).toBe("hand"); // drawn off the reveal — after the fact
    // Retreat needs a friendly unit; Diana is gone, so even with [2] left it cannot target her.
    const targets = (game.p1.option("cast", "tr")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).not.toContain("diana");
  });
});

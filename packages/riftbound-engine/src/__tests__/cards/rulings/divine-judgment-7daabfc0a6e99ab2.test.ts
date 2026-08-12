/**
 * Ruling 7daabfc0a6e99ab2 — Divine Judgment (OGN-244 → ogn-244-298) · Spell · Order · [7][order][order]
 *   "Each player chooses 2 units, 2 gear, 2 runes, and 2 cards in their hands. Recycle the rest."
 *
 * Q: Does Divine Judgment recycle cards in the trash and in banishment?
 * A: No. It only touches the categories it names — units, gear and runes on the board, plus cards in hand.
 *    Trash and banishment are untouched, and so are hidden (facedown) cards, which are none of those things.
 * Rules: 355.10 (the effect applies only to the objects it names), 416 (recycle), 811 (hidden cards are not
 *        units/gear/runes/hand cards while facedown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIVINE_JUDGMENT = "ogn-244-298";
const HIDDEN_BLADE = "ogn-213-298"; // has [Hidden], used as the facedown card

/** Answer every "pick N to recycle" prompt Divine Judgment raises, taking the first legal options. */
async function resolveJudgment(game: Game): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const stop = await game.settle();
    const d = game.decision();
    if (stop.reason !== "unanswered" || !d) break;
    if (d.kind === "pick") await game.seat(d.seat).pick(...d.options.slice(0, Math.max(1, d.min)).map((o) => o.key));
    else if (d.kind === "yes-no") await game.seat(d.seat).no();
    else break;
  }
}

/** P1's turn. P1 has four units, two cards in the trash, one in banishment and a hidden card at bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 1, name: "Unit 1" }, "u1")
    .unit(P1, "base", { might: 1, name: "Unit 2" }, "u2")
    .unit(P1, "base", { might: 1, name: "Unit 3" }, "u3")
    .trash(P1, { cardType: "unit", might: 1, name: "Trashed Unit" }, "trashed1")
    .trash(P1, { cardType: "spell", energyCost: 1, name: "Trashed Spell" }, "trashed2")
    .banishment(P1, { cardType: "spell", energyCost: 1, name: "Banished Spell" }, "banished")
    .facedown(P1, "bf1", HIDDEN_BLADE, "hid")
    .hand(P1, DIVINE_JUDGMENT, "judgment");
}

describe("Ruling 7daabfc0a6e99ab2 — Divine Judgment leaves the trash, banishment and hidden cards alone", () => {
  test("setup: the trash holds two cards, banishment one, and a hidden card sits facedown at bf1", async () => {
    const game = await board().build();
    expect(game.zoneOf("trashed1")).toBe("trash");
    expect(game.zoneOf("trashed2")).toBe("trash");
    expect(game.zoneOf("banished")).toBe("banishment");
    expect(game.zoneOf("hid")).toBe("facedown-bf1");
  });

  test("after it resolves the board is cut down to 2 units, but every card in the trash / banishment / facedown is exactly where it was", async () => {
    const game = await board().build();
    await game.p1.cast("judgment");
    await resolveJudgment(game);

    expect(game.p1.units()).toHaveLength(2); // "choose 2 units … recycle the rest"
    expect(game.zoneOf("trashed1")).toBe("trash");
    expect(game.zoneOf("trashed2")).toBe("trash");
    expect(game.zoneOf("banished")).toBe("banishment");
    expect(game.zoneOf("hid")).toBe("facedown-bf1"); // hidden cards are none of the named categories
    expect(game.p1.trash()).toContain("trashed1");
    expect(game.p1.trash()).toContain("trashed2");
    expect(game.p1.banishment()).toEqual(["banished"]);
    expect(game.violations()).toEqual([]);
  });

  test("Divine Judgment itself goes to the trash when it finishes — the only thing that lands there", async () => {
    const game = await board().build();
    const trash0 = game.p1.trash().length;
    await game.p1.cast("judgment");
    await resolveJudgment(game);
    expect(game.zoneOf("judgment")).toBe("trash");
    // Only the spell itself plus the two recycled units left the board; recycled cards go to the DECK, not the trash.
    expect(game.p1.trash()).toHaveLength(trash0 + 1);
  });
});

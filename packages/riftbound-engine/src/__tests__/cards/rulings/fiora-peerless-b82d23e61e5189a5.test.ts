/**
 * Ruling b82d23e61e5189a5 — Fiora, Peerless (SFD-110 → sfd-110-221) · Unit · [3][body] · 3 Might
 *   "When I attack or defend one on one, double my Might this combat."
 *   × Teemo, Scout (OGN-197 → ogn-197-298) · Unit · [2] · 1 Might · "[Hidden] · When you play me, give me
 *     +3 [Might] this turn." — the hidden second defender.
 *
 * Q: Fiora attacks one on one; the defender reveals a hidden Teemo in reaction to the attack trigger. Does
 *    her Might still double?
 * A: Yes. "When…" checks its condition only when the trigger is put on the Chain, never again on resolution.
 *    The item is already "double my Might this combat", so the extra defender arriving afterwards changes
 *    nothing. (A "while…" static would keep re-checking and would stop applying.)
 * Rules: 383.3 (trigger condition checked as the item is added), 359.3.e.5 (resolution does not re-check
 *        the condition), 700s (statics are continuous).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "sfd-110-221";
const TEEMO_SCOUT = "ogn-197-298";

/** P2 holds bf1 with a single visible blocker and (optionally) a face-down Teemo behind it. */
function oneOnOne(withHiddenTeemo: boolean) {
  const s = scenario()
    .autoProcedures(false)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Blocker" }, "blocker")
    .unit(P1, "base", FIORA, "fiora");
  return withHiddenTeemo ? s.facedown(P2, "bf1", TEEMO_SCOUT, "teemo") : s;
}

async function bothPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling b82d23e61e5189a5 — Fiora's 'when' condition is checked at trigger time only", () => {
  test("attacking alone into a lone defender puts the doubling trigger on the Chain (Might not yet changed)", async () => {
    const game = await oneOnOne(true).build();
    await game.p1.move("fiora", "bf1");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "fiora", controller: P1, triggered: true }),
    ]);
    expect(game.state("fiora").might).toBe(3);
    expect(game.state("fiora").combatRole).toBe("attacker");
  });

  test("the defender reveals the hidden Teemo in response — and Fiora's Might still doubles to 6", async () => {
    const game = await oneOnOne(true).build();
    await game.p1.move("fiora", "bf1");
    await game.p1.passPriority();
    expect(game.p2.can("reveal", "teemo")).toBe(true);
    await game.p2.reveal("teemo");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fiora", "teemo"]);
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1"); // a second defender is now present
    await bothPass(game); // Teemo's own play trigger
    await bothPass(game); // Fiora's doubling
    expect(game.p2.units("bf1").toSorted()).toEqual(["blocker", "teemo"]); // no longer one on one…
    expect(game.state("fiora").might).toBe(6); // …but the item was already "double my Might"
    expect(game.violations()).toEqual([]);
  });

  test("contrast — with TWO defenders already there when she attacks, the condition fails and nothing doubles", async () => {
    const game = await oneOnOne(false)
      .unit(P2, "bf1", { might: 2, name: "Second Blocker" }, "blocker2")
      .build();
    await game.p1.move("fiora", "bf1");
    expect(game.chain()).toEqual([]); // the trigger never went on the Chain
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.state("fiora").might).toBe(3);
  });

  test("the doubling is 'this combat' — after the combat ends Fiora is back to 3", async () => {
    const game = await oneOnOne(false).build();
    await game.p1.move("fiora", "bf1");
    await bothPass(game);
    expect(game.state("fiora").might).toBe(6);
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.p1.choose("resolveFullCombat:bf1");
    await game.settle();
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.state("fiora").might).toBe(3);
  });
});

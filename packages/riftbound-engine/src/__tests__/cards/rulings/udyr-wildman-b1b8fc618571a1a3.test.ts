/**
 * Ruling b1b8fc618571a1a3 — Udyr, Wildman (OGN-157 → ogn-157-298) · Body champion · [6][body] · 6 Might
 *   "Spend my buff: Choose one you've not chosen this turn — Deal 2 to a unit at a battlefield. / Stun a unit
 *    at a battlefield. / Ready me. / Give me [Ganking] this turn."
 *
 * Q: Can Udyr spend his buff whenever, or only on his own turn?
 * A: Only at base speed. "Spend my buff: …" is an activated ability in `cost: effect` form with neither
 *    [Action] nor [Reaction], so it may be activated only during YOUR turn, in an Open State — no chain on the
 *    chain, no showdown running. (Spells that say "spend a buff" follow spell timing instead.)
 * Rules: 340.2 / 344.1 (base speed = your turn, Open State), 400.1.b (an activated ability has the speed of its
 *        card unless it says otherwise), 702.2.b (spend a buff as a cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UDYR = "ogn-157-298";
/** A plain slow spell used only to open a chain while P1 still has priority. */
const PONDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Ponder",
  timing: "standard",
} as const;

/** Buffed Udyr holds bf1 for P1; P2 has a Rival at bf2 and a raider in base. `active` says whose turn it is. */
function board(active = P1) {
  return scenario()
    .turn(3)
    .active(active)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", UDYR, "udyr", { buffed: true })
    .unit(P2, "bf2", { might: 4, name: "Rival" }, "rival")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, PONDER, "ponder");
}

describe("Ruling b1b8fc618571a1a3 — Udyr's 'Spend my buff:' ability is base speed: your turn, Open State only", () => {
  test("your own turn, open main phase, nothing on the chain: the ability IS available", async () => {
    const game = await board().build();
    expect(game.state("udyr").isBuffed).toBe(true);
    expect(game.p1.can("activateAbility", "udyr")).toBe(true);
    const ok = await game.p1.try((p) => p.activate("udyr", 0));
    expect(ok.ok).toBe(true);
  });

  test("on the OPPONENT'S turn it is not available at all, buff or no buff", async () => {
    const game = await board(P2).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("activateAbility", "udyr")).toBe(false);
    const bad = await game.p1.try((p) => p.activate("udyr", 0));
    expect(bad.ok).toBe(false);
    expect(game.state("udyr").isBuffed).toBe(true); // nothing was spent
  });

  test("your turn but a CHAIN is open (a spell of yours is waiting to resolve): base speed is locked out", async () => {
    const game = await board().build();
    await game.p1.cast("ponder");
    expect(game.chain()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.p1.can("activateAbility", "udyr")).toBe(false);
    const bad = await game.p1.try((p) => p.activate("udyr", 0));
    expect(bad.ok).toBe(false);
  });

  test("your turn but a SHOWDOWN is running (you moved into the enemy battlefield): still locked out", async () => {
    const game = await board().unit(P1, "base", { might: 5, name: "Striker" }, "striker").build();
    await game.p1.move("striker", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.p1.can("activateAbility", "udyr")).toBe(false);
    const bad = await game.p1.try((p) => p.activate("udyr", 0));
    expect(bad.ok).toBe(false);
    expect(game.state("udyr").isBuffed).toBe(true);
  });

  test("once the chain empties and the position is open again on your turn, the very same activation is legal", async () => {
    const game = await board().build();
    await game.p1.cast("ponder");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activateAbility", "udyr")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});

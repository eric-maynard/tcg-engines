/**
 * Ruling c2cd7218339a4a5f — Rocket Barrage (SFD-077 → sfd-077-221) · Spell · Mind · 4 + [mind]
 *     "[Repeat] [4][mind]. Choose one — Deal 4 to a unit in a base. Kill a gear."
 *
 * Q: What speed is Rocket Barrage? Can it be played as a reaction?
 * A: Base speed — it prints neither [Action] nor [Reaction]. So it can only be played on your own turn in an Open State
 *    (empty chain, no showdown): not during a Showdown, and never in response to something on the chain.
 *    (The ruling self-flags as not fully verified against the rules text.)
 * Rules: 336/343 (Open vs Closed state), 346 (base-speed cards: your turn, open state), 347 ([Action] adds showdowns),
 *        348 ([Reaction] adds closed states).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ROCKET_BARRAGE = "sfd-077-221";
const CLEAVE = "ogn-004-298"; // [Action] control spell
/** A 0-cost Reaction for P2, used to keep a chain open with priority back on P1. */
const P2_REACTION = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Quick Thought",
  timing: "reaction",
} as const;

/** P1's turn. P1: 4 + [mind], Rocket Barrage in hand, Scout (2) in base; P2: Sitter (3) in base, Holder (2) on bf1, a gear, a 0-cost Reaction. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 3, name: "Sitter" }, "sitter")
    .unit(P2, "bf1", { might: 2, name: "Holder" }, "holder")
    .gear(P2, { cardType: "gear", name: "Trinket" }, "trinket")
    .hand(P1, ROCKET_BARRAGE, "barrage")
    .hand(P2, P2_REACTION, "quick");
}

describe("Ruling c2cd7218339a4a5f — Rocket Barrage is base speed: own turn, open state only", () => {
  test("on P1's turn with an empty chain and no showdown it is playable: mode 'Deal 4 to a unit in a base' kills P2's 3-Might Sitter", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "barrage")).toBe(true);
    await game.p1.cast("barrage", { mode: 0, targets: "sitter" });
    await game.settle();
    expect(game.zoneOf("barrage")).toBe("trash");
    expect(game.zoneOf("sitter")).toBe("trash");
  });

  test("it cannot be played in RESPONSE to something on the chain (not a Reaction): with a chain open (Barrage #1, then P2's Reaction) and priority back on P1, a second Barrage is illegal", async () => {
    const game = await board().hand(P1, ROCKET_BARRAGE, "barrage2").resources(P1, { energy: 8, power: { mind: 2 } }).build();
    await game.p1.cast("barrage", { mode: 0, targets: "sitter" });
    await game.p1.passPriority();
    await game.p2.cast("quick");
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["barrage", "quick"]);
    expect(game.p1.can("cast", "barrage2")).toBe(false);
    expect((await game.p1.try((p) => p.cast("barrage2", { mode: 0, targets: "scout" }))).ok).toBe(false);
  });

  test("it cannot be played on the opponent's turn", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "barrage")).toBe(false);
  });

  test("no [Action] keyword ⇒ not playable during a Showdown even while holding Focus (a real [Action] spell, Cleave, IS playable there as the control)", async () => {
    const game = await board().hand(P1, CLEAVE, "cleave").resources(P1, { energy: 5, power: { mind: 1 } }).build();
    await game.p1.move("scout", "bf1"); // opens a combat showdown at bf1, P1 (attacker) has Focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(true);
    expect(game.p1.can("cast", "barrage")).toBe(false);
    const r = await game.p1.try((p) => p.cast("barrage", { mode: 0, targets: "sitter" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("barrage")).toBe("hand");
  });
});

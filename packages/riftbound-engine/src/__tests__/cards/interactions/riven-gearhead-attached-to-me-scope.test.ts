/**
 * Interaction: Riven, Shattered (ven-041-166, Calm champion unit, 3, 3 Might)
 *     "[Weaponmaster] … When I attack, choose an enemy unit here. Deal 2 to it for each Equipment attached to me."
 *   × Gearhead (sfd-068-221, Mind unit, 5, 3 Might)
 *     "[Accelerate] … Each Equipment attached to me gives double its base Might bonus."
 *   × three copies of Brutalizer (sfd-042-221, Calm Equipment, +1 Might, NOT [Unique])
 *     "[Equip] [calm] … If this was attached to me this turn, I have an additional +2 [Might]."
 *   × Angle Shot (sfd-011-221, [Reaction]) as the tool that detaches an Equipment mid-chain.
 *
 * Board: P1's turn. Riven wears Brutalizer A (attached LAST turn); Gearhead at bf2 wears Brutalizer B
 * (attached THIS turn); P2's defender D at bf1 wears Brutalizer C (attached this turn). Riven attacks bf1
 * and her trigger chooses D.
 *
 * Question:
 *  (a) How much damage — 2 (only Riven's own Equipment), 4 (every Equipment P1 controls), or 6 (all three)?
 *  (b) What is Gearhead's Might — does "Each Equipment attached to ME" reach Brutalizer A or C?
 *  (c) Brutalizer's Effect Text says "If this was attached to me this turn, I have an additional +2 [Might]" —
 *      whose unit is "me", and does P2's D get the +2?
 *  (d) If Brutalizer A is detached from Riven in reaction to the trigger, what does the trigger deal —
 *      0, or does it fall back on the two Brutalizers still on the board?
 *
 * Rules: 053.1 ("I"/"me" on a unit is that unit), 717 / 718.5.d / 719.1 (Attach links ONE attached card to ONE
 * Top-Most card), 718.2 / 718.3 (printed text Inactive while attached; the Effect Text is appended to the
 * Top-Most card's rules text — so its "me" is the WEARER), 718.4 / 137.3 (the Might Bonus modulates the
 * Top-Most card), 355.9.b (targeting restrictions), 359.3.f.2 (referents are re-read when the instruction executes).
 *
 * Expected: (a) 2 — the for-each counts only Brutalizer A. The clause carries no controller filter and no
 * location filter, so it can neither widen to P1's other Equipment (4) nor to P2's (6).
 * (b) 7 = 3 + 2 (B's printed +1 doubled) + 2 (B's Effect Text, attached this turn — a keyword bonus, not a
 * "base Might bonus", so it is NOT doubled). Brutalizers A and C are untouched by Gearhead, and Gearhead's
 * doubling never reaches Riven: with A attached this turn Riven is base + 1 + 2 = 6, not base + 2 + 2 = 7.
 * (c) The Effect Text's "me" is the wearer, so P2's D gets its own +2 (4 + 1 + 2 = 7) — the same printed
 * words buff an ENEMY unit and give P1 nothing.
 * (d) 0. "Attached to me" is re-read when the instruction executes (359.3.f.2); with A detached Riven has
 * zero Equipment attached. It does not fall back on B (on Gearhead) or C (on D) — a board-wide reading
 * would deal 4 here.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIVEN = "ven-041-166";
const GEARHEAD = "sfd-068-221";
const BRUTALIZER = "sfd-042-221";
const ANGLE_SHOT = "sfd-011-221";

/**
 * Turn 2, P1 active. Three separate Brutalizers, one per unit. `brutATurn` is the turn on which
 * Brutalizer A was attached to Riven — 1 = "last turn" (default), 2 = "this turn".
 *
 * Seeding an attachment writes BOTH halves of the link (rule 717: the Equipment's `attachedTo` and the
 * Top-Most card's `equippedWith`), which is what the real Attach game action does.
 */
function board(brutATurn = 1) {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 4, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", RIVEN, "riven", { equippedWith: ["brutA"] })
    .card("brutA", { def: BRUTALIZER, meta: { attachedOnTurn: brutATurn, attachedTo: "riven" }, owner: P1, zone: "base" })
    .unit(P1, "bf2", GEARHEAD, "gearhead", { equippedWith: ["brutB"] })
    .card("brutB", { def: BRUTALIZER, meta: { attachedOnTurn: 2, attachedTo: "gearhead" }, owner: P1, zone: "bf2" })
    .unit(P2, "bf1", { might: 4, name: "D" }, "d", { equippedWith: ["brutC"] })
    .card("brutC", { def: BRUTALIZER, meta: { attachedOnTurn: 2, attachedTo: "d" }, owner: P2, zone: "bf1" })
    .hand(P1, ANGLE_SHOT, "shot");
}

describe("Riven / Gearhead / three Brutalizers — the scope of \"attached to me\"", () => {
  test("(a) Riven's attack trigger deals 2 — one Equipment attached to HER, not 4 (every Equipment P1 controls) or 6 (the whole board)", async () => {
    const game = await board().build();
    await game.p1.move("riven", "bf1"); // moving into P2's occupied battlefield = an attack
    // The trigger is on the chain with its only legal "enemy unit here" already bound (402.2).
    expect(game.chain()).toMatchObject([{ cardId: "riven", triggered: true }]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("d").damage).toBe(2);
    expect(game.state("d").damage).not.toBe(4); // "every Equipment P1 controls"
    expect(game.state("d").damage).not.toBe(6); // "every Equipment on the board"
    expect(game.violations()).toEqual([]);
  });

  test("(a) the count is the attachment relation, not a controller scope: Brutalizer B stays attached to Gearhead the whole time (718.5.d — one Top-Most card at a time)", async () => {
    const game = await board().build();
    expect(game.state("riven").attachments).toEqual(["brutA"]);
    expect(game.state("gearhead").attachments).toEqual(["brutB"]);
    expect(game.state("d").attachments).toEqual(["brutC"]);
    expect(game.state("brutB").attachedTo).toBe("gearhead");
    await game.p1.move("riven", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("brutB").attachedTo).toBe("gearhead");
    expect(game.state("brutC").attachedTo).toBe("d");
  });

  test("(b) Gearhead is 7 = 3 + 2×1 (Brutalizer B's base Might Bonus doubled, 137.3/718.4) + 2 (B's Effect Text, attached this turn — not a base Might bonus, so not doubled)", async () => {
    const game = await board().build();
    expect(game.state("gearhead")).toMatchObject({ attachments: ["brutB"], baseMight: 3, might: 7 });
    expect(game.state("gearhead").might).not.toBe(9); // doubling the Effect Text's +2 as well
    expect(game.state("gearhead").might).not.toBe(5); // forgetting the Effect Text
  });

  test("(b) Gearhead's doubling reaches neither Brutalizer A nor C: Riven is 3 + 1 = 4 (A attached LAST turn) and D is unaffected by Gearhead", async () => {
    const game = await board().build();
    expect(game.state("riven")).toMatchObject({ baseMight: 3, might: 4 });
    expect(game.state("riven").might).not.toBe(5); // 3 + 2×1 would mean the doubling crossed units
    expect(game.state("d").might).toBe(7); // 4 + 1 + 2, no doubling
  });

  test("(b) with Brutalizer A attached THIS turn Riven is base + 1 + 2 = 6, not base + 2 + 2 = 7 — only Gearhead doubles", async () => {
    const game = await board(2).build();
    expect(game.state("riven")).toMatchObject({ baseMight: 3, might: 6 });
    expect(game.state("gearhead").might).toBe(7); // unchanged: A is not attached to Gearhead
  });

  test("(c) the Effect Text's \"me\" is the WEARER (718.2/718.3/053.1): P2's D gets its own +2 from Brutalizer C — an ENEMY unit buffed, and nothing for P1", async () => {
    const game = await board().build();
    expect(game.state("d")).toMatchObject({ attachments: ["brutC"], baseMight: 4, might: 7 });
    // The same printed words on P1's side buff P1's units only; C contributes nothing to Riven or Gearhead.
    expect(game.state("riven").might).toBe(4);
    expect(game.state("gearhead").might).toBe(7);
    // And C never widens Riven's for-each either — it is attached to D, not to Riven.
    await game.p1.move("riven", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("d").damage).toBe(2);
  });

  test("(d) detaching Brutalizer A in reaction (Angle Shot) makes the trigger deal 0 — \"attached to me\" is re-read on execution (359.3.f.2), with no fallback to B or C", async () => {
    const game = await board().build();
    await game.p1.move("riven", "bf1");
    expect(game.chain()).toHaveLength(1);
    // Angle Shot is a [Reaction]: choose a unit and an Equipment with the same controller — Riven
    // already wears Brutalizer A, so the pair detaches it (434/435).
    await game.p1.cast("shot", { targets: ["riven", "brutA"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("brutA").attachedTo).toBeUndefined();
    expect(game.state("riven").attachments).toEqual([]);
    expect(game.state("riven").might).toBe(3); // 137.3.a — the Might Bonus stopped applying
    // Now the attack trigger resolves with zero Equipment attached to Riven.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("d").damage).toBe(0);
    expect(game.state("d").damage).not.toBe(4); // the board-wide reading (B + C still attached)
    expect(game.violations()).toEqual([]);
  });
});

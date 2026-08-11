/**
 * Interaction: En Garde (ogn-046-298) × Shen, Kinkou (ogn-241-298) × Flash (ogs-011-024)
 *
 *   En Garde — Spell · Calm · 1     "[Reaction] Give a friendly unit +1 [Might] this turn, then an additional
 *                                    +1 [Might] this turn if it is the only unit you control there."
 *   Shen, Kinkou — Champion Unit · Order · 3 · 3 Might   "[Reaction] [Shield 2] [Tank]"
 *   Flash — Spell · Chaos · 2       "[Reaction] Move up to 2 friendly units to base."
 *
 * Rules: 355.5 + 355.15 (the LOCKED half — "a friendly unit" is a choice of a specific game object made as the
 * spell is finalized and never re-made afterwards), 355.10.d (the unit COUNT is programmatic, not a target — no
 * prompt), 135.2.b.5.a (the RE-CHECKED half — "if it is the only unit you control there" is the condition of the
 * second instruction, read when that instruction executes), 359.3.f.1 / 359.3.f.2 ("there" is a referent tied to
 * the target, checked on execution), 359.3.e.2 (a target that stayed on the board is still legal), 359.3.e.6 /
 * 359.3.e.11 (an instruction whose condition is false is ignored), 337.2 (a Reaction unit resolves immediately
 * once finalized).
 *
 * Board: P2 attacks P1's battlefield bf1 with a Raider; P1 defends with A and answers in the showdown.
 *
 * Question: A is En Garded, then the board changes before the spell resolves. (a) alone throughout. (b) Shen
 * arrives at bf1 in the same window — may P1 move En Garde onto the better recipient? (c) A and B at bf1, En
 * Garde on A, then B is Flashed home. (d) A itself is Flashed home — still a legal target, and against WHICH
 * location is "there" read?
 *
 * Expected: the recipient never moves off A (355.15), while the aloneness clause is judged at resolution.
 * (a) +2. (b) +1 only, and still on A — Shen is never offered. (c) +2: a clause false at the choice that becomes
 * true must fire. (d) A is still legal and "there" re-reads as P1's BASE — +1 with a unit at home, +2 with an
 * empty base. Note: "the only unit you control there" counts P1's own units, not battlefield control.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EN_GARDE = "ogn-046-298";
const SHEN_KINKOU = "ogn-241-298";
const FLASH = "ogs-011-024";

/** P2's turn. P1 controls bf1 and defends it with A; P1 holds En Garde, Shen and Flash with runes for all three. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 10, power: { calm: 2, chaos: 2, order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "A" }, "a")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, EN_GARDE, "eg")
    .hand(P1, SHEN_KINKOU, "shen")
    .hand(P1, FLASH, "flash");
}

/** P2 attacks bf1 and passes focus → P1 is the acting seat inside the showdown. */
async function openShowdown(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  expect(game.actingSeat()).toBe(P1);
}

/** Let the top of the chain resolve: caster passes, opponent passes. */
async function resolveTop(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("(a) baseline — A is the only unit P1 controls at bf1 when En Garde is played AND when it resolves", () => {
  test("both instructions execute: +1 then the conditional +1 → A ends at base +2", async () => {
    const game = await board().build();
    await openShowdown(game);
    await game.p1.cast("eg", { targets: "a" });
    await resolveTop(game);
    expect(game.state("a")).toMatchObject({ baseMight: 2, might: 4, mightModifier: 2 });
    expect(game.zoneOf("eg")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("355.10.d — the aloneness count asks nothing: casting with `targets` supplied leaves no open prompt", async () => {
    const game = await board().build();
    await openShowdown(game);
    await game.p1.cast("eg", { targets: "a" });
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 }); // priority, not a question
    expect(game.chain().map((c) => c.cardId)).toEqual(["eg"]);
  });
});

describe("(b) 337.2 + 355.15 — Shen arrives before En Garde resolves: the clause turns FALSE, the recipient does not move", () => {
  test("Shen enters bf1 immediately as a Reaction while En Garde is still on the chain", async () => {
    const game = await board().build();
    await openShowdown(game);
    await game.p1.cast("eg", { targets: "a" });
    await game.p1.play("shen", { to: "bf1" });
    expect(game.locationOf("shen")).toBe("bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["eg"]); // the unit did not queue behind the spell
  });

  test("En Garde stays aimed at A — Shen is never offered as a new recipient and takes no Might modifier", async () => {
    const game = await board().build();
    await openShowdown(game);
    await game.p1.cast("eg", { targets: "a" });
    await game.p1.play("shen", { to: "bf1" });
    expect(game.chain()[0]?.targets).toEqual(["a"]);
    const d = game.decision();
    expect(d?.kind === "pick").toBe(false); // no re-target question
    await resolveTop(game);
    expect(game.state("shen").mightModifier).toBe(0);
  });

  test("only the first instruction executes — A ends at +1, not +2 (359.3.e.6 / 359.3.e.11)", async () => {
    const game = await board().build();
    await openShowdown(game);
    await game.p1.cast("eg", { targets: "a" });
    await game.p1.play("shen", { to: "bf1" });
    await resolveTop(game);
    expect(game.state("a")).toMatchObject({ baseMight: 2, might: 3, mightModifier: 1 });
  });
});

describe("(c) 135.2.b.5.a — a clause FALSE when the target was chosen becomes TRUE at resolution and must fire", () => {
  test("A and B share bf1 when En Garde is cast; B is Flashed home first, so A resolves alone and gets the full +2", async () => {
    const game = await board().unit(P1, "bf1", { might: 2, name: "B" }, "b").build();
    await openShowdown(game);
    await game.p1.cast("eg", { targets: "a" });
    await game.p1.cast("flash", { targets: ["b"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["eg", "flash"]);
    await resolveTop(game); // Flash resolves: B goes home
    expect(game.locationOf("b")).toBe("base");
    expect(game.state("a").mightModifier).toBe(0); // En Garde has not resolved yet
    await resolveTop(game); // En Garde resolves with A alone at bf1
    expect(game.state("a")).toMatchObject({ baseMight: 2, might: 4, mightModifier: 2 });
    expect(game.state("b").mightModifier).toBe(0);
  });
});

describe("(d) 359.3.e.2 + 359.3.f.2 — A itself leaves bf1: still a legal target, and 'there' re-reads as its NEW location", () => {
  test("A is Flashed to base and En Garde still resolves on it — 'a friendly unit' carries no location restriction", async () => {
    const game = await board().build();
    await openShowdown(game);
    await game.p1.cast("eg", { targets: "a" });
    await game.p1.cast("flash", { targets: ["a"] });
    await resolveTop(game); // Flash resolves: A goes home
    expect(game.locationOf("a")).toBe("base");
    await resolveTop(game); // En Garde resolves against A in base
    expect(game.state("a").mightModifier).toBeGreaterThan(0);
  });

  test("with P1's base otherwise EMPTY, A is alone there → the conditional fires → +2", async () => {
    const game = await board().build();
    await openShowdown(game);
    await game.p1.cast("eg", { targets: "a" });
    await game.p1.cast("flash", { targets: ["a"] });
    await resolveTop(game);
    await resolveTop(game);
    expect(game.state("a")).toMatchObject({ baseMight: 2, might: 4, mightModifier: 2 });
  });

  test("with a Homebody already at home, A is NOT alone in base → +1 only, even though it was alone at bf1 when chosen", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Homebody" }, "home").build();
    await openShowdown(game);
    await game.p1.cast("eg", { targets: "a" });
    await game.p1.cast("flash", { targets: ["a"] });
    await resolveTop(game);
    expect(game.locationOf("a")).toBe("base");
    await resolveTop(game);
    expect(game.state("a")).toMatchObject({ baseMight: 2, might: 3, mightModifier: 1 });
  });

  test("battlefield CONTROL is irrelevant to the count: an attacker who does not control bf1 still satisfies 'the only unit you control there'", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10, power: { calm: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 2, name: "A" }, "a")
      .hand(P1, EN_GARDE, "eg")
      .build();
    await game.p1.move("a", "bf1"); // P1 attacks; bf1 is still P2's
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    await game.p1.cast("eg", { targets: "a" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("a")).toMatchObject({ baseMight: 2, might: 4, mightModifier: 2 });
  });
});

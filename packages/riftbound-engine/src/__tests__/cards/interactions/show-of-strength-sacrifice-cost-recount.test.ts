/**
 * Interaction: Show of Strength (sfd-106-221) · Reaction spell · Body · 2 + [body]
 *     "Draw 1 for each of your [Mighty] units. (A unit is Mighty while it has 5+ [Might].)"
 *   × Sacrifice (unl-173-219) · Reaction spell · Order · 1
 *     "As an additional cost to play this, kill a friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Smoke Screen (ogn-093-298) · Reaction spell · Mind · 2 + [mind]
 *     "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Question: P1 controls exactly two Mighty units in base — G (5) and H (6) — and has 3 energy + [body].
 *   (a) P1 casts Show of Strength, keeps priority and immediately casts Sacrifice killing G. When is G
 *       actually killed — on playing Sacrifice or on its resolution — and does Show of Strength (played while
 *       P1 had two Mighty units) draw 2 or 1? Total cards drawn?
 *   (b) Instead, P2 responds to Show of Strength with Smoke Screen on G: draw 2 or 1?
 *   (c) Show of Strength with no response.
 *
 * Rules: 356.2 / 357.2 (additional costs are paid in the Pay Costs step of PLAYING the card), 359.3.f.2
 * (quantities an effect counts are read when it executes), 359.3.d, 327 (chain resolves LIFO, priority
 * between items), 425.1.c (paid costs are not refunded).
 *
 * Expected: (a) G dies the moment Sacrifice is played (cost), before either spell resolves; chain bottom→top
 * Show of Strength, Sacrifice; Sacrifice resolves: draw 2 + channel 1 rune exhausted; Show of Strength then
 * counts Mighty units NOW → only H → draw 1. Net 3 cards drawn, not 4. (b) Smoke Screen resolves first: G is
 * 1 Might, not Mighty when Show of Strength executes → draw 1. (c) two Mighty units at resolution → draw 2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHOW_OF_STRENGTH = "sfd-106-221";
const SACRIFICE = "unl-173-219";
const SMOKE_SCREEN = "ogn-093-298";

/**
 * P1's turn. P1: G (5) and H (6) — both Mighty — plus a non-Mighty S (2) in base; Show of Strength + Sacrifice in
 * hand; exactly 3 energy + [body]. P2: Smoke Screen in hand with exactly 2 + [mind]. No battlefields matter.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { body: 1 } })
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .unit(P1, "base", { might: 5, name: "Vanilla G" }, "G")
    .unit(P1, "base", { might: 6, name: "Vanilla H" }, "H")
    .unit(P1, "base", { might: 2, name: "Vanilla S" }, "S")
    .hand(P1, SHOW_OF_STRENGTH, "sos")
    .hand(P1, SACRIFICE, "sac")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

/** Cards P1 has drawn since `deck0` (deck shrinkage). */
const drawn = (game: Game, deck0: number) => deck0 - game.p1.deck().length;

describe("Show of Strength counts 'your Mighty units' on resolution — Sacrifice's cost kill / Smoke Screen shrink change the count", () => {
  test("premise: G (5) and H (6) are P1's only Mighty units (S is 2); Show of Strength chooses no targets; Sacrifice offers exactly the Mighty G / H as its cost", async () => {
    const game = await board().build();
    expect(game.state("G").might).toBe(5);
    expect(game.state("H").might).toBe(6);
    expect(game.state("S").might).toBe(2);
    expect(game.p1.option("cast", "sos")?.fields ?? []).toEqual([]); // nothing locked at play
    const sacField = game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice");
    expect([...((sacField?.options as string[] | undefined) ?? [])].toSorted()).toEqual(["G", "H"]);
    expect((await game.p1.try((p) => p.cast("sac", { sacrifice: "S" }))).ok).toBe(false); // S is not Mighty
  });

  // ---- (a) Show of Strength, then Sacrifice (kill G) on top ---------------------------------------

  test("(a) after casting Show of Strength P1 KEEPS priority and may cast Sacrifice at once; paying its cost kills G IMMEDIATELY — G is in the trash while both spells sit on the chain unresolved (356.2 / 357.2)", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p1.cast("sos");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0 } });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 still has priority
    expect(game.p1.can("cast", "sac")).toBe(true);
    await game.p1.cast("sac", { sacrifice: "G" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("G")).toBe("trash"); // the cost, paid now
    expect(game.chain().map((c) => c.cardId)).toEqual(["sos", "sac"]); // bottom → top
    expect(drawn(game, deck0)).toBe(0); // nothing has resolved
    expect(game.p1.units().toSorted()).toEqual(["H", "S"]);
  });

  test("(a) Sacrifice resolves first (LIFO): P1 draws 2 and channels 1 rune EXHAUSTED; G stays dead; Show of Strength is still on the chain and both players get priority again (327)", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    const runes0 = game.p1.runes().length;
    await game.p1.cast("sos");
    await game.p1.cast("sac", { sacrifice: "G" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sacrifice resolves
    expect(game.zoneOf("sac")).toBe("trash");
    expect(drawn(game, deck0)).toBe(2);
    const newRunes = game.p1.runes().filter((r) => game.state(r).isExhausted);
    expect(game.p1.runes()).toHaveLength(runes0 + 1);
    expect(newRunes).toHaveLength(1);
    expect(game.zoneOf("G")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sos"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) Show of Strength then counts Mighty units AT RESOLUTION — only H is left → it draws exactly 1, not the 2 it 'saw' when played (359.3.f.2): total drawn 3, hand = 3, energy 0", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    const hand0 = game.p1.hand().length; // sos + sac
    await game.p1.cast("sos");
    await game.p1.cast("sac", { sacrifice: "G" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sacrifice: +2
    const afterSac = drawn(game, deck0);
    await game.settle(); // Show of Strength: +1
    expect(drawn(game, deck0) - afterSac).toBe(1);
    expect(drawn(game, deck0)).toBe(3); // 2 + 1, not 2 + 2
    expect(game.p1.hand()).toHaveLength(hand0 - 2 + 3);
    expect(game.zoneOf("sos")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) contrast: Sacrifice killing H instead leaves G (5) as the lone Mighty unit — Show of Strength again draws 1 (total 3)", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p1.cast("sos");
    await game.p1.cast("sac", { sacrifice: "H" });
    expect(game.zoneOf("H")).toBe("trash");
    await game.settle();
    expect(drawn(game, deck0)).toBe(3);
    expect(game.state("G")).toMatchObject({ might: 5, zone: "base" });
  });

  // ---- (b) Smoke Screen on G in response ------------------------------------------------------------

  test("(b) P2 answers Show of Strength with Smoke Screen on G: it resolves first, G is 1 Might (5 − 4, floor 1) and no longer Mighty when Show of Strength executes → P1 draws exactly 1", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p1.cast("sos");
    await game.p1.passPriority();
    expect(game.p2.can("cast", "smoke")).toBe(true);
    await game.p2.cast("smoke", { targets: "G" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sos", "smoke"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Smoke Screen resolves
    expect(game.state("G")).toMatchObject({ might: 1, zone: "base" });
    expect(drawn(game, deck0)).toBe(0);
    await game.settle(); // Show of Strength resolves
    expect(drawn(game, deck0)).toBe(1);
    expect(game.zoneOf("G")).toBe("base"); // shrunk, not dead
    expect(game.zoneOf("sac")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("(b) contrast: Smoke Screen on H (6 → 2) likewise leaves one Mighty unit (G) → draw 1; Smoke Screen on the non-Mighty S changes nothing → draw 2", async () => {
    const onH = await board().build();
    const d0 = onH.p1.deck().length;
    await onH.p1.cast("sos");
    await onH.p1.passPriority();
    await onH.p2.cast("smoke", { targets: "H" });
    await onH.settle();
    expect(onH.state("H").might).toBe(2);
    expect(drawn(onH, d0)).toBe(1);

    const onS = await board().build();
    const d1 = onS.p1.deck().length;
    await onS.p1.cast("sos");
    await onS.p1.passPriority();
    await onS.p2.cast("smoke", { targets: "S" });
    await onS.settle();
    expect(onS.state("S").might).toBe(1); // 2 − 4, floor 1
    expect(drawn(onS, d1)).toBe(2);
  });

  // ---- (c) no response -----------------------------------------------------------------------------

  test("(c) Show of Strength with no response: two Mighty units at resolution → P1 draws 2; costs 2 + [body]; G and H untouched", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    const hand0 = game.p1.hand().length;
    await game.p1.cast("sos");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0 } });
    await game.settle();
    expect(drawn(game, deck0)).toBe(2);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 2);
    expect(game.zoneOf("sos")).toBe("trash");
    expect(game.state("G")).toMatchObject({ might: 5, zone: "base" });
    expect(game.state("H")).toMatchObject({ might: 6, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("(c) it is a Reaction P1 may also cast on P2's turn in response to a P2 spell, still counting at resolution (2 Mighty → draw 2)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { body: 1 } })
      .resources(P2, { energy: 2, power: { mind: 1 } })
      .unit(P1, "base", { might: 5, name: "Vanilla G" }, "G")
      .unit(P1, "base", { might: 6, name: "Vanilla H" }, "H")
      .unit(P2, "base", { might: 3, name: "Vanilla T" }, "T")
      .hand(P1, SHOW_OF_STRENGTH, "sos")
      .hand(P2, SMOKE_SCREEN, "smoke")
      .build();
    expect(game.p1.can("cast", "sos")).toBe(false); // closed state on the opponent's turn: nothing to react to
    await game.p2.cast("smoke", { targets: "T" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "sos")).toBe(true);
    const deck0 = game.p1.deck().length;
    await game.p1.cast("sos");
    await game.settle();
    expect(drawn(game, deck0)).toBe(2);
  });
});

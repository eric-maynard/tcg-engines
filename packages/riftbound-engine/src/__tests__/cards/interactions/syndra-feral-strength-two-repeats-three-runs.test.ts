/**
 * Interaction: Syndra, Transcendent (unl-146-219) · Champion Unit · Chaos · 6 + [chaos] · 6 Might
 *     "While I'm in a showdown, your spells have [Repeat] [2][chaos]."
 *   × Feral Strength (sfd-034-221) · Spell · Calm · 2 · Reaction
 *     "[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.) Give a unit +2 [Might] this turn."
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · Reaction
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   (+ an inline 6-damage Reaction "Test Bolt 6" in P2's hand, only to remove the 6-Might Syndra herself
 *    in response — Gust cannot, she is too big.)
 *
 * Question: multiple Repeat instances (820.3) on a targeted spell. P2's turn: P2 attacks P1's bf1 with a
 * 6-Might Bruiser; P1 defends with Syndra + a 2-Might Ally; a third P1 unit (Homebody, 3) sits in base.
 * With Focus, P1 plays Feral Strength holding exactly 2 + 2 + 2 energy + 1 chaos.
 *   (a) One merged Repeat or two separately payable instances? Paying both → executions / chain items /
 *       'spell played' count?
 *   (b) Are all three '+2' choices made at play time and public; may they be three different units, the
 *       same unit thrice, a unit in base?
 *   (c) P2 responds: a TARGET (the Ally) is Gusted → that execution only is skipped. Syndra herself is
 *       removed after finalization → the already-paid granted Repeat does not evaporate.
 *   (d) Control: Syndra in base (not in the showdown) → only the printed Repeat; 'repeat 2' is illegal.
 *
 * Rules: 820.1.c.2 / 820.1.c.3 (each Repeat instance is its own optional additional cost, payable once),
 * 820.1.d, 820.2 / 820.2.a (choices for every execution are made as the spell is played and may differ),
 * 820.3 / 820.3.a (N paid instances → 1+N executions, still Played once), 355.1.a, 359.3.e.2 / 359.3.e.5
 * (an execution whose target left the board is skipped; nothing retargets), 364.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SYNDRA = "unl-146-219";
const FERAL_STRENGTH = "sfd-034-221";
const GUST = "ogn-169-298";

/** Inline 6-damage Reaction so P2 can remove the 6-Might Syndra in response (Gust only reaches ≤3). */
const BOLT6 = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt 6",
  timing: "reaction",
} as const;

/**
 * P2's turn. P1 controls bf1 with Syndra (or Syndra in base for the control case) + Ally (2); Homebody (3)
 * in P1's base. P2's ready 6-Might Bruiser in base; P2 holds Gust + the test bolt with 2 energy. P1 holds
 * Feral Strength with exactly [2] + [2] + [2][chaos].
 */
function board(syndraAt: "bf1" | "base" = "bf1") {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 6, power: { chaos: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, syndraAt, SYNDRA, "syndra")
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 3, name: "Homebody" }, "home")
    .unit(P2, "base", { might: 6, name: "Bruiser" }, "bruiser")
    .hand(P1, FERAL_STRENGTH, "fs")
    .hand(P2, GUST, "gust")
    .hand(P2, BOLT6, "bolt");
}

/** Bruiser attacks bf1; P2 (attacker) passes Focus → P1 holds Focus in the combat showdown. */
async function p1HasFocus(syndraAt: "bf1" | "base" = "bf1"): Promise<Game> {
  const game = await board(syndraAt).build();
  await game.p2.move("bruiser", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

const repeatField = (game: Game) => game.p1.option("cast", "fs")?.fields.find((f) => f.arg === "repeat");

/**
 * Feral Strength with BOTH Repeats paid and one target per execution: Ally, Homebody, Syndra.
 * The cast menu does not enumerate per-execution target lists for repeat 2 (see the BUG test), so the
 * play is submitted as the raw engine move — the engine itself validates and accepts it.
 */
async function castThreeWays(game: Game): Promise<void> {
  await game.p1.do("playSpell", { cardId: "fs", repeatCount: 2, targets: ["ally", "home", "syndra"] });
}

describe("(a) two Repeat instances, each payable once → three executions, one chain item, played once", () => {
  test("in Syndra's showdown Feral Strength offers repeat 0..2 (printed [2] + granted [2][chaos]) — two instances, not one merged cost (820.1.c.2, 820.3)", async () => {
    const game = await p1HasFocus();
    expect(repeatField(game)).toMatchObject({ max: 2, min: 0, options: [1, 2] });
  });

  test("paying ONE instance costs 2 + 2 energy and no chaos (the printed [2]); two executions → +4 spread as chosen", async () => {
    const game = await p1HasFocus();
    await game.p1.cast("fs", { repeat: 1, targets: ["home", "ally"] });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("home").might).toBe(5);
    expect(game.state("ally").might).toBe(4);
    expect(game.state("syndra").might).toBe(6);
  });

  test("paying BOTH costs base [2] + [2] + [2][chaos] = 6 energy + 1 chaos, all gone; still exactly ONE chain item and ONE card played (820.3.a)", async () => {
    const game = await p1HasFocus();
    await castThreeWays(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "fs", controller: P1, triggered: false });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  test("on resolution the instruction runs 1 + 2 = THREE times: Ally 2→4, Homebody 3→5, Syndra 6→8; the spell goes to trash once", async () => {
    const game = await p1HasFocus();
    await castThreeWays(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.state("ally").might).toBe(4);
    expect(game.state("home").might).toBe(5);
    expect(game.state("syndra").might).toBe(8);
    expect(game.p1.trash()).toEqual(["fs"]);
    expect(game.violations()).toEqual([]);
  });

  test("6 energy but NO chaos: only the printed instance is affordable → repeat max 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SYNDRA, "syndra")
      .unit(P2, "base", { might: 6, name: "Bruiser" }, "bruiser")
      .hand(P1, FERAL_STRENGTH, "fs")
      .build();
    await game.p2.move("bruiser", "bf1");
    await game.p2.passFocus();
    expect(repeatField(game)?.max).toBe(1);
    expect((await game.p1.try((p) => p.cast("fs", { repeat: 2, targets: "syndra" }))).ok).toBe(false);
  });
});

describe("(b) every execution's target is chosen at play time, public, and independent", () => {
  test("all three targets sit on the chain item the moment it is finalized — visible in P2's view before P2 responds (820.2)", async () => {
    const game = await p1HasFocus();
    await castThreeWays(game);
    expect(game.p2.view().chain).toEqual([expect.objectContaining({ cardId: "fs", targets: ["ally", "home", "syndra"] })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's response window, targets already known
  });

  test("three DIFFERENT units including one in BASE ('a unit' has no location limit) is a legal play; nothing is re-chosen at resolution (no prompt ever appears)", async () => {
    const game = await p1HasFocus();
    await castThreeWays(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind).toBe("action"); // straight back to the showdown, no pick
    expect(game.state("home")).toMatchObject({ might: 5, zone: "base" });
  });

  test("the same unit thrice is equally legal: Syndra ×3 → +6 (6 → 12)", async () => {
    const game = await p1HasFocus();
    await game.p1.cast("fs", { repeat: 2, targets: "syndra" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("syndra").might).toBe(12);
    expect(game.state("ally").might).toBe(2);
    expect(game.state("home").might).toBe(3);
  });

  test.failing("BUG: the cast menu should offer one-target-per-execution variants when BOTH Repeats are paid (820.2.a) — it only does so for a single repeat", async () => {
    // Expected: `cast(fs, { repeat: 2, targets: [ally, home, syndra] })` is a listed legal variant, exactly like
    // `{ repeat: 1, targets: [home, ally] }` is. Actual: for repeatCount 2 the enumerator lists single-target
    // variants only, so the harness rejects the bundle (the raw move IS accepted by the engine — see above).
    const game = await p1HasFocus();
    await game.p1.cast("fs", { repeat: 2, targets: ["ally", "home", "syndra"] });
    expect(game.chain()[0]).toMatchObject({ cardId: "fs", targets: ["ally", "home", "syndra"] });
  });
});

describe("(c) responses after finalization: a Gusted TARGET skips only its execution; removing SYNDRA does not unpay the granted Repeat", () => {
  test("P2 Gusts the Ally (2 ≤ 3; Syndra at 6 is not offered): Gust resolves first → Ally to P1's hand; Feral Strength still pending with its three recorded targets", async () => {
    const game = await p1HasFocus();
    await castThreeWays(game);
    await game.p1.passPriority();
    const gustTargets = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(gustTargets).toEqual(["ally"]);
    await game.p2.cast("gust", { targets: "ally" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["fs", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fs", targets: ["ally", "home", "syndra"] })]);
  });

  test("…then Feral Strength resolves: the Ally execution is skipped (target left the board, 359.3.e.2/.5), the other two still apply — Homebody 5, Syndra 8; no retarget prompt", async () => {
    const game = await p1HasFocus();
    await castThreeWays(game);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "ally" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // Feral Strength resolves
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.state("home").might).toBe(5);
    expect(game.state("syndra").might).toBe(8);
    expect(game.zoneOf("ally")).toBe("hand");
    expect(game.state("ally").might).toBe(2); // printed, untouched in hand
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });

  test("Syndra killed in response (test bolt): the granting source is gone before resolution, yet the paid executions stand — Ally 4 and Homebody 5 both land; only the execution aimed at the dead Syndra is ignored (820.1.d)", async () => {
    const game = await p1HasFocus();
    await castThreeWays(game);
    await game.p1.passPriority();
    await game.p2.cast("bolt", { targets: "syndra" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // bolt resolves, Syndra dies in the Cleanup
    expect(game.zoneOf("syndra")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fs" })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Feral Strength resolves
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.state("ally").might).toBe(4);
    expect(game.state("home").might).toBe(5);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // nothing refunded
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) control — Syndra in base is not 'in a showdown': only the printed Repeat exists", () => {
  test("repeat max is 1; 'repeat 2' is rejected both as a menu choice and as a raw move; one repeat still works for 4 energy", async () => {
    const game = await p1HasFocus("base");
    expect(game.locationOf("syndra")).toBe("base");
    expect(repeatField(game)).toMatchObject({ max: 1, options: [1] });
    expect((await game.p1.try((p) => p.cast("fs", { repeat: 2, targets: "home" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.do("playSpell", { cardId: "fs", repeatCount: 2, targets: ["ally", "home", "syndra"] }))).ok).toBe(false);
    expect(game.zoneOf("fs")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 6, power: { chaos: 1 } });
    await game.p1.cast("fs", { repeat: 1, targets: ["ally", "syndra"] });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("ally").might).toBe(4);
    expect(game.state("syndra").might).toBe(8);
  });

  test("no showdown at all (P1's own open main phase, Syndra on bf1): likewise only the printed instance", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SYNDRA, "syndra")
      .hand(P1, FERAL_STRENGTH, "fs")
      .build();
    expect(repeatField(game)?.max).toBe(1);
  });
});

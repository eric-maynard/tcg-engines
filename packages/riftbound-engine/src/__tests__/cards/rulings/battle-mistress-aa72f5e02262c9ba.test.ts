/**
 * Ruling aa72f5e02262c9ba — Battle Mistress (SFD-203 → sfd-203-221) · Legend (Sivir)
 *     "When you recycle a rune, you may exhaust me to play a Gold gear token exhausted. When one or more enemy units die,
 *      ready me."
 *   × Sivir, Mercenary (SFD-143 → sfd-143-221) · 4 · "[Accelerate] … If you've SPENT at least [rainbow][rainbow] this turn, I have
 *     +2 [Might] and [Ganking]." (contrast: "spend" ≠ merely recycling)
 *
 * Q: During combat, when is the last chance to recycle a rune to trigger Battle Mistress's Gold ability, and may I recycle a
 *    rune without paying for anything?
 * A: Recycling is a rune's Reaction/[Add] ability — usable whenever you have priority (or Focus with an empty chain), no
 *    purchase needed; the power just floats. In combat: when an enemy dies, Sivir's "ready me" trigger goes on the chain even if
 *    she is exhausted; in response you may recycle a rune → exhaust Sivir for a Gold token → then the ready trigger resolves and
 *    she readies. Contrast: effects that say "spend" (Sivir, Mercenary) need the power actually paid, not just added.
 * Rules: 400.2 / 154 (Recycle is an [Add] ability, immediate), 332 (needs priority), 347 (Focus), 383 (LIFO),
 *        423 (exhausted legend still triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BATTLE_MISTRESS = "sfd-203-221";
const SIVIR_MERCENARY = "sfd-143-221";

/** P1's turn. P1: Battle Mistress (ready), two ready runes, Brute (5) in base, Sivir Mercenary (4) in base. P2 holds bf1 with a Victim (2). */
function board(legendExhausted = false) {
  return scenario()
    .card("sivir", { def: BATTLE_MISTRESS, meta: legendExhausted ? { exhausted: true } : undefined, owner: P1, zone: "legendZone" })
    .rune(P1, "fury", { alias: "r1" })
    .rune(P1, "chaos", { alias: "r2" })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 5, name: "Brute" }, "brute")
    .unit(P1, "base", SIVIR_MERCENARY, "merc")
    .unit(P2, "bf1", { might: 2, name: "Victim" }, "victim")
    .unit(P2, "base", { might: 2, name: "Other" }, "other");
}

/** Brute attacks bf1; both pass Focus; combat kills the Victim → Battle Mistress's "ready me" trigger is on the chain with P1 holding priority. */
async function victimDiesInCombat(legendExhausted = false): Promise<Game> {
  const game = await board(legendExhausted).build();
  await game.p1.move("brute", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.zoneOf("victim")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sivir", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

const goldOf = (game: Game) => game.p1.gear().filter((g) => game.state(g).isToken && game.state(g).name === "Gold");

describe("Ruling aa72f5e02262c9ba — recycling a rune (an [Add] Reaction) in response to Sivir's death-trigger to squeeze out a Gold token", () => {
  test("you may recycle a rune whenever you have priority/Focus, WITHOUT buying anything: in the open showdown P1 (Focus, empty chain) recycles r1 — the power simply floats", async () => {
    const game = await board().build();
    await game.p1.move("brute", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("recycleRune", "r1")).toBe(true);
    await game.p1.recycleRune("r1");
    expect(game.p1.power("fury")).toBe(1);
    expect(game.zoneOf("r1")).toBe("runeDeck");
    // (Battle Mistress notices: her opt-in is asked; decline here — this test is only about the recycle being legal.)
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    }
    expect(game.p1.power("fury")).toBe(1); // nothing was spent
    // Without Focus / priority, P2 could not: it is not P2's decision.
    expect(game.p2.can("recycleRune")).toBe(false);
  });

  test("the enemy Victim dies in combat → 'ready me' goes on the chain (P1 has priority); IN RESPONSE P1 recycles a rune (legal right there, nothing to pay for), opts to exhaust Sivir → an exhausted Gold token; then the ready trigger resolves and Sivir is READY again", async () => {
    const game = await victimDiesInCombat();
    expect(game.state("sivir").isReady).toBe(true);
    expect(game.p1.can("recycleRune", "r1")).toBe(true);
    await game.p1.recycleRune("r1");
    expect(game.p1.power("fury")).toBe(1);
    // Battle Mistress's recycle trigger is finalized now: "you may exhaust me".
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "sivir" } });
    await game.p1.yes();
    expect(game.state("sivir").isExhausted).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sivir", "sivir"]); // ready-trigger underneath, gold-trigger on top
    // Resolve the top item (Gold token), then the ready trigger.
    for (let i = 0; i < 6 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(goldOf(game)).toHaveLength(1);
    expect(game.state(goldOf(game)[0]!)).toMatchObject({ isExhausted: true, isToken: true, name: "Gold" });
    expect(game.state("sivir").isExhausted).toBe(true); // still exhausted until HER ready trigger resolves
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("sivir").isReady).toBe(true);
    expect(game.p1.power("fury")).toBe(1); // the recycled power was never spent on anything
    // Combat wrapped up as usual.
    expect(game.locationOf("brute")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("the death trigger fires even if Sivir is ALREADY exhausted — it readies her (no Gold this time: she can't be exhausted again to pay)", async () => {
    const game = await victimDiesInCombat(true);
    expect(game.state("sivir").isExhausted).toBe(true);
    await game.p1.recycleRune("r1");
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d).toMatchObject({ canAccept: false, seat: P1, source: { cardId: "sivir" } });
      await game.p1.no();
    }
    await game.settle();
    expect(goldOf(game)).toEqual([]);
    expect(game.state("sivir").isReady).toBe(true);
  });

  test("last opportunity: once both players pass on that chain and it resolves, combat concludes — afterwards P1 is back in the open main phase (recycling then is fine, but no longer 'during combat')", async () => {
    const game = await victimDiesInCombat();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active) ?? false).toBe(false);
    expect(game.p1.can("recycleRune", "r1")).toBe(true);
  });

  test("contrast — 'spend' means actually paying: recycling two runes (2 power floating, none spent) does NOT turn on Sivir, Mercenary's +2 [Might]", async () => {
    const game = await board().build();
    expect(game.state("merc").might).toBe(4);
    await game.p1.recycleRune("r1");
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    }
    await game.p1.recycleRune("r2");
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
    }
    await game.settle();
    expect(game.p1.power()).toBe(2);
    expect(game.state("merc").might).toBe(4);
    expect(game.state("merc").keywords).not.toContain("Ganking");
  });
});

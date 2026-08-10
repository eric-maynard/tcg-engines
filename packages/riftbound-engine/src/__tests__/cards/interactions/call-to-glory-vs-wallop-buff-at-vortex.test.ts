/**
 * Interaction: Call to Glory (ogn-207-298) · Spell · Order · 3
 *     "[Reaction] As you play this, you may spend a buff as an additional cost. If you do, ignore this
 *      spell's cost. Give a unit +3 [Might] this turn."
 *   × Wallop (ogn-146-298) · Spell · Body · 2
 *     "[Action] As you play this, you may spend a buff as an additional cost. If you do, ignore this
 *      spell's cost. Ready a unit."
 *   × Mystic Vortex (ven-160-166) · Battlefield
 *     "During showdowns here, cards with [Reaction] cost [rainbow] more to play. (Hidden cards have [Reaction].)"
 *
 * Question: a showdown / combat is in progress AT the Mystic Vortex. P1 has a buffed unit, 0 energy, and
 * holds Call to Glory and Wallop.
 *   (a) With exactly 1 power of any domain: cost of each via the buff route during this showdown?
 *   (b) With 0 power: which of the two can P1 legally play via the buff?
 *   (c) The same two plays on P1's turn with NO showdown at the Vortex (open main phase, or a showdown at
 *       a different battlefield): costs?
 *   (d) NOT spending a buff at the Vortex showdown: costs?
 *
 * Rules: 355.1.a (choosing to pay the optional additional cost is a play-time choice), 356.1.b /
 * 356.1.b.1 ("ignore this spell's cost" zeroes the BASE cost), 356.2.b.1 (the buff-spend is the
 * non-mandatory additional cost), 356.3 + 356.1.b.3 (Mystic Vortex is a cost INCREASE applied after the
 * ignore, so it survives), 356.6 (never below 0), 357.2 (the buff is removed when costs are paid, before
 * the spell resolves), 813.5 (Reaction is a referencable characteristic — Call to Glory has it, Wallop
 * does not), 806.1 (Action = permission to play in showdowns).
 *
 * Expected:
 *   (a) Call to Glory = 0 energy + 1 any-domain power + the buff; Wallop = 0 energy + 0 power + the buff.
 *   (b) 0 power: only Wallop is playable via the buff; Call to Glory is not playable at all (buff route
 *       still needs [rainbow]; plain route needs 3 + [rainbow]).
 *   (c) No Vortex showdown: both cost 0 + the buff (no runes needed).
 *   (d) No buff at the Vortex showdown: Call to Glory 3 + [rainbow]; Wallop 2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CALL_TO_GLORY = "ogn-207-298";
const WALLOP = "ogn-146-298";
const MYSTIC_VORTEX = "ven-160-166";

interface Opts {
  energy?: number;
  power?: number;
  /** where P2's defender waits: the live Vortex ("mv") or an ordinary inert battlefield ("plain"). */
  vortexIs?: "mv" | "none";
}

/**
 * P1's turn. "mv" is the Mystic Vortex (live text) held by P2's 5-Might defender; "plain" is an inert
 * battlefield held by another P2 defender. P1: 2-Might attacker A and a BUFFED 2-Might donor in base,
 * Call to Glory + Wallop in hand, `energy` (default 0) and `power` rainbow (default 1).
 */
function board(o: Opts = {}) {
  return scenario()
    .resources(P1, { energy: o.energy ?? 0, power: { rainbow: o.power ?? 1 } })
    .battlefield("mv", o.vortexIs === "none" ? { controller: P2 } : { controller: P2, def: MYSTIC_VORTEX, inert: false, owner: P2 })
    .battlefield("plain", { controller: P2 })
    .unit(P2, "mv", { might: 5, name: "Vortex Keeper" }, "keeper")
    .unit(P2, "plain", { might: 5, name: "Plain Keeper" }, "keeper2")
    .unit(P1, "base", { might: 2, name: "Attacker A" }, "a")
    .unit(P1, "base", { might: 2, name: "Buffed Donor" }, "donor", { buffed: true })
    .hand(P1, CALL_TO_GLORY, "ctg")
    .hand(P1, WALLOP, "wallop");
}

/** A attacks `bf` → combat showdown there with P1 (attacker) holding Focus and an empty chain. */
async function showdownAt(bf: "mv" | "plain", o: Opts = {}): Promise<Game> {
  const game = await board(o).build();
  await game.p1.move("a", bf);
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: bf, focusPlayer: P1 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.chain()).toEqual([]);
  return game;
}

/** The `payOptional` (spend-a-buff) values offered for casting `card` right now ([] = not castable). */
function buffRoutesOffered(game: Game, card: "ctg" | "wallop"): boolean[] {
  const opt = game.p1.option("cast", card);
  return [...((opt?.fields.find((f) => f.arg === "payOptional")?.options ?? []) as boolean[])].sort();
}

describe("Call to Glory vs Wallop — spend-a-buff 'ignore cost' under Mystic Vortex's Reaction tax", () => {
  test("setup: A's attack opens a combat showdown AT the Vortex; both spells are timed legally there for the Focus holder (813 Reaction / 806.1 Action); Call to Glory has the Reaction characteristic, Wallop does not (813.5)", async () => {
    const game = await showdownAt("mv");
    expect(game.state("mv").name).toBe("Mystic Vortex");
    expect(game.state("ctg").cardType).toBe("spell");
    expect(game.state("wallop").cardType).toBe("spell");
    expect(game.state("donor").isBuffed).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.p1.can("cast", "ctg")).toBe(true);
    expect(game.p1.can("cast", "wallop")).toBe(true);
  });

  // ---- (a) 1 power, buff route, showdown at the Vortex ------------------------------------------------

  // Expected (356.1.b → 356.3, 356.1.b.3): "ignore this spell's cost" zeroes only the BASE cost; the Vortex's
  // [rainbow] increase is applied afterwards and must still be paid → pool 0/0. Actual: the buff route waives
  // the surcharge too — the rainbow is left in the pool (the un-buffed route IS taxed, see (d)).
  test("(a) Call to Glory via the buff during the Vortex showdown = 0 energy + 1 [rainbow] + the buff: pool 0/1 → 0/0 (356.1.b, 356.3, 356.1.b.3)", async () => {
    const game = await showdownAt("mv");
    expect(buffRoutesOffered(game, "ctg")).toEqual([true]); // 0 energy: only the buff route exists
    await game.p1.cast("ctg", { payOptional: true, targets: "a" });
    expect(game.state("donor").isBuffed).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("(a) Call to Glory via the buff: the donor's buff is removed AT PAYMENT while the spell still waits on the chain (357.2), no energy is charged, and on resolution A gets +3 this turn", async () => {
    const game = await showdownAt("mv");
    await game.p1.cast("ctg", { payOptional: true, targets: "a" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("donor").isBuffed).toBe(false); // paid before resolution
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ctg", controller: P1 })]);
    expect(game.state("a").might).toBe(2);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("ctg")).toBe("trash");
    expect(game.state("a").might).toBe(5);
  });

  test("(a) Wallop via the buff during the Vortex showdown = 0 energy + 0 power + the buff: the [rainbow] is untouched — an [Action] card is not a 'card with [Reaction]' (813.5)", async () => {
    const game = await showdownAt("mv");
    expect(buffRoutesOffered(game, "wallop")).toEqual([true]);
    expect(game.state("a").isExhausted).toBe(true); // the Standard Move exhausted A
    await game.p1.cast("wallop", { payOptional: true, targets: "a" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.state("donor").isBuffed).toBe(false);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("wallop")).toBe("trash");
    expect(game.state("a").isReady).toBe(true);
  });

  test("(a) each play is a single payment of ONE buff: after Call to Glory spent the only buff, Wallop (0 energy left, no buff) is no longer castable", async () => {
    const game = await showdownAt("mv");
    await game.p1.cast("ctg", { payOptional: true, targets: "a" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Focus moved on to P2; get it back to P1 to inspect P1's menu.
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "wallop")).toBe(false);
  });

  // ---- (b) 0 power ---------------------------------------------------------------------------------------

  test("(b) 0 energy, 0 power at the Vortex showdown: Wallop IS playable via the buff (total 0 + buff) …", async () => {
    const game = await showdownAt("mv", { power: 0 });
    expect(game.p1.can("cast", "wallop")).toBe(true);
    expect(buffRoutesOffered(game, "wallop")).toEqual([true]);
    await game.p1.cast("wallop", { payOptional: true, targets: "a" });
    expect(game.state("donor").isBuffed).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  // Expected: with 0 power neither route of Call to Glory is payable at the Vortex showdown. Actual: the engine
  // offers (and accepts) the buff route for free — same root cause as (a).
  test("(b) … but Call to Glory is NOT: the buff route still owes the Vortex's [rainbow] and the plain route owes 3 + [rainbow] — not offered, cast rejected, buff kept (356.1.b.3, 358.4)", async () => {
    const game = await showdownAt("mv", { power: 0 });
    expect(game.p1.can("cast", "ctg")).toBe(false);
    expect(buffRoutesOffered(game, "ctg")).toEqual([]);
    await expect(game.p1.cast("ctg", { payOptional: true, targets: "a" })).rejects.toThrow();
    expect(game.zoneOf("ctg")).toBe("hand");
    expect(game.state("donor").isBuffed).toBe(true);
  });

  // Expected/actual as above: the buff route is wrongly offered tax-free.
  test("(b) even 3 energy + 0 power does not unlock Call to Glory at the Vortex showdown — every route needs the [rainbow] (356.3)", async () => {
    const game = await showdownAt("mv", { energy: 3, power: 0 });
    expect(game.p1.can("cast", "ctg")).toBe(false);
    expect(game.p1.can("cast", "wallop")).toBe(true);
  });

  // ---- (c) no showdown at the Vortex -----------------------------------------------------------------------

  test("(c) P1's open main phase (no showdown anywhere), 0 energy 0 power: BOTH are castable via the buff for nothing but the buff — the Vortex tax is dormant", async () => {
    const ctg = await board({ power: 0 }).build();
    expect(ctg.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(ctg.p1.can("cast", "ctg")).toBe(true);
    await ctg.p1.cast("ctg", { payOptional: true, targets: "a" });
    expect(ctg.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(ctg.state("donor").isBuffed).toBe(false);
    await ctg.settle();
    expect(ctg.state("a").might).toBe(5);

    const wal = await board({ power: 0 }).unit(P1, "base", { might: 1, name: "Sleepy" }, "sleepy", { exhausted: true }).build();
    expect(wal.p1.can("cast", "wallop")).toBe(true);
    await wal.p1.cast("wallop", { payOptional: true, targets: "sleepy" });
    expect(wal.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(wal.state("donor").isBuffed).toBe(false);
    await wal.settle();
    expect(wal.state("sleepy").isReady).toBe(true);
  });

  test("(c) a showdown at a DIFFERENT battlefield while the Vortex sits elsewhere: Call to Glory via the buff costs 0 power ('during showdowns HERE')", async () => {
    const game = await showdownAt("plain", { power: 1 });
    expect(buffRoutesOffered(game, "ctg")).toEqual([true]);
    await game.p1.cast("ctg", { payOptional: true, targets: "a" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.state("donor").isBuffed).toBe(false);

    const broke = await showdownAt("plain", { power: 0 });
    expect(broke.p1.can("cast", "ctg")).toBe(true); // no rune needed away from the Vortex
  });

  test("(c) contrast: the very same 'mv' slot as an ordinary battlefield (no Vortex text) — Call to Glory via the buff at that showdown costs 0 power", async () => {
    const game = await showdownAt("mv", { power: 0, vortexIs: "none" });
    expect(game.p1.can("cast", "ctg")).toBe(true);
    await game.p1.cast("ctg", { payOptional: true, targets: "a" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("donor").isBuffed).toBe(false);
  });

  // ---- (d) not spending the buff at the Vortex showdown ------------------------------------------------------

  test("(d) Call to Glory WITHOUT the buff at the Vortex showdown = 3 energy + 1 [rainbow]: 5/1 → 2/0, donor keeps its buff", async () => {
    const game = await showdownAt("mv", { energy: 5, power: 1 });
    expect(buffRoutesOffered(game, "ctg")).toEqual([false, true]);
    await game.p1.cast("ctg", { payOptional: false, targets: "a" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.state("donor").isBuffed).toBe(true);
  });

  test("(d) Wallop WITHOUT the buff at the Vortex showdown = 2 energy flat: 5/1 → 3/1, donor keeps its buff", async () => {
    const game = await showdownAt("mv", { energy: 5, power: 1 });
    expect(buffRoutesOffered(game, "wallop")).toEqual([false, true]);
    await game.p1.cast("wallop", { payOptional: false, targets: "a" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 1 } });
    expect(game.state("donor").isBuffed).toBe(true);
  });

  test("(d) with 3 energy but 0 power the UN-buffed Call to Glory (3 + [rainbow]) is not offered, while Wallop un-buffed for a flat 2 is (356.3, 356.6)", async () => {
    const game = await showdownAt("mv", { energy: 3, power: 0 });
    expect(buffRoutesOffered(game, "ctg")).not.toContain(false);
    await expect(game.p1.cast("ctg", { payOptional: false, targets: "a" })).rejects.toThrow();
    expect(buffRoutesOffered(game, "wallop")).toEqual([false, true]);
    await game.p1.cast("wallop", { payOptional: false, targets: "a" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 0 } });
    expect(game.state("donor").isBuffed).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});

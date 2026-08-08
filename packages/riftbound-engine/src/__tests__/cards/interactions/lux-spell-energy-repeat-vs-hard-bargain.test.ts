/**
 * Interaction: Lux, Crownguard (ogs-014-024) · Champion Unit · Order · 4 · 2 Might
 *     "[Exhaust]: [Reaction] — [Add] [2]. Use only to play spells. (Abilities that add resources can't
 *      be reacted to.)"
 *   × Desert's Call (sfd-031-221) · Spell · Calm · 2 · Action
 *     "[Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)
 *      Play a 2 [Might] Sand Soldier unit token."
 *   × Hard Bargain (sfd-136-221) · Spell · Chaos · 2 · Reaction
 *     "[Repeat] [2] … Counter a spell unless its controller pays [2]."
 *   (+ inline vanilla 2-cost and 3-cost units in P1's hand)
 *
 * Rules: 429.3 / 429.4.a (Add; restricted "use only to play spells"), 357.1 / 357.1.a (Pay Costs step of
 * playing a card — the only place Lux's energy may be applied), 820.1.c.1 (Repeat is an ADDITIONAL COST
 * paid while playing the spell → Lux energy counts), 444.1 / 444.2 (the payer allocates which resources
 * leave the pool; an instructed Pay outside cost payment may be declined / is impossible without the
 * resource), 359.3.c (Hard Bargain's "unless … pays" is executed on resolution), 425.1.c (countering
 * refunds nothing), 167 / 316.3 (all pool contents empty at end of turn).
 *
 * Question: P1 has Lux ready, 2 normal energy, and in hand Desert's Call + a 2-drop + a 3-drop. P1
 * exhausts Lux (pool = 2 normal + 2 spell-only).
 *   (a) legal(): Desert's Call plain ✔, with Repeat (4) ✔, 2-drop ✔, 3-drop ✘.
 *   (b) Cast Desert's Call plain → the spell-only 2 is spent, 2 normal remain → the 2-drop is still legal.
 *   (c) P2 Hard Bargains it. With 2 normal left P1 may pay → spell resolves (one Sand Soldier), 2-drop no
 *       longer affordable. If P1's only energy is Lux's, P1 cannot pay → countered, nothing refunded, the
 *       Lux [2] stays unspent.
 *   (d) Unspent Lux energy vanishes at end of turn — and leaves no earmark behind on next turn's energy.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LUX = "ogs-014-024";
const DESERTS_CALL = "sfd-031-221";
const HARD_BARGAIN = "sfd-136-221";
const TWO_DROP = { cardType: "unit", domain: "calm", energyCost: 2, might: 2, name: "Two Drop" };
const THREE_DROP = { cardType: "unit", domain: "calm", energyCost: 3, might: 3, name: "Three Drop" };

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn: ready Lux in base, 2 normal energy, Desert's Call + 2-drop + 3-drop in hand. P2: 2 energy + Hard Bargain. */
function board(p1Energy = 2) {
  return scenario()
    .resources(P1, { energy: p1Energy })
    .resources(P2, { energy: 2 })
    .unit(P1, "base", LUX, "lux")
    .hand(P1, DESERTS_CALL, "call")
    .hand(P1, TWO_DROP, "two")
    .hand(P1, THREE_DROP, "three")
    .hand(P2, HARD_BARGAIN, "hb");
}

function legalKeys(game: Game): string[] {
  return game.p1.legal().map((o) => o.key);
}

function sandSoldiers(game: Game): string[] {
  return game.p1.units("base").filter((u) => game.state(u).name === "Sand Soldier");
}

/** P1 casts Desert's Call (plain), P2 answers with Hard Bargain on it and passes back; HB is the top item, P1 has priority. */
async function callGetsBargained(game: Game): Promise<void> {
  await game.p1.cast("call");
  await game.p1.passPriority();
  expect(game.p2.can("cast", "hb")).toBe(true);
  await game.p2.cast("hb", { targets: "call" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["call", "hb"]);
  await game.p2.passPriority();
  expect(game.actingSeat()).toBe(P1);
}

describe("Lux spell-only energy × Desert's Call [Repeat] × Hard Bargain's ransom", () => {
  // ── premise ─────────────────────────────────────────────────────────────────────────────────

  test("premise: exhausting Lux adds [2] at once (no chain) → pool reads 4, of which 2 is earmarked for spells (429.3, 429.4.a)", async () => {
    const game = await board().build();
    expect(game.p1.energy()).toBe(2);
    await game.p1.activate("lux");
    expect(game.state("lux").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(4);
    expect(game.gameState.restrictedEnergy?.[P1]?.spell).toBe(2);
  });

  // ── (a) what legal() enumerates ─────────────────────────────────────────────────────────────

  test("(a) Desert's Call is castable plain AND with Repeat 1 (total 4 = 2 spell-only + 2 normal; Repeat is an additional cost of playing the spell, 820.1.c.1 / 357.1)", async () => {
    const game = await board().build();
    await game.p1.activate("lux");
    expect(game.p1.can("cast", "call")).toBe(true);
    const repeat = game.p1.option("cast", "call")?.fields.find((f) => f.arg === "repeat");
    expect(repeat).toBeDefined();
    expect(repeat?.options).toContain(1);
    expect(repeat?.max).toBe(1);
  });

  test("(a) the 2-cost unit is playable (2 normal energy) but the 3-cost unit is NOT — Lux's [2] cannot be applied to a unit (429.4.a)", async () => {
    const game = await board().build();
    await game.p1.activate("lux");
    expect(game.p1.can("play", "two")).toBe(true);
    expect(game.p1.can("play", "three")).toBe(false);
    expect(legalKeys(game)).toContain("playUnit:two");
    expect(legalKeys(game)).not.toContain("playUnit:three");
    await expect(game.p1.play("three")).rejects.toThrow();
    expect(game.zoneOf("three")).toBe("hand");
  });

  test("(a, control) without Lux's energy Repeat is not affordable: only the plain cast is offered with 2 energy", async () => {
    const game = await board().build();
    const repeat = game.p1.option("cast", "call")?.fields.find((f) => f.arg === "repeat");
    expect(game.p1.can("cast", "call")).toBe(true);
    expect(repeat?.options ?? []).not.toContain(1);
    await expect(game.p1.cast("call", { repeat: 1 })).rejects.toThrow();
  });

  test("(a) casting WITH Repeat spends all 4 (both pools) and yields two Sand Soldier tokens", async () => {
    const game = await board().build();
    await game.p1.activate("lux");
    await game.p1.cast("call", { repeat: 1 });
    expect(game.p1.energy()).toBe(0);
    expect(game.gameState.restrictedEnergy?.[P1]?.spell ?? 0).toBe(0);
    await game.settle();
    expect(game.zoneOf("call")).toBe("trash");
    expect(sandSoldiers(game)).toHaveLength(2);
    for (const s of sandSoldiers(game)) {
      expect(game.state(s)).toMatchObject({ isToken: true, might: 2 });
    }
  });

  // ── (b) allocation on a plain cast ──────────────────────────────────────────────────────────

  test("(b) plain cast debits the spell-only [2] first: 2 NORMAL energy remain and the earmark is used up (444.1)", async () => {
    const game = await board().build();
    await game.p1.activate("lux");
    await game.p1.cast("call");
    expect(game.zoneOf("call")).toBe("chain");
    expect(game.p1.energy()).toBe(2);
    expect(game.gameState.restrictedEnergy?.[P1]?.spell ?? 0).toBe(0);
  });

  test("(b) …so after Desert's Call resolves (one Sand Soldier) the 2-cost unit is STILL in legal() and can be played with the remaining 2", async () => {
    const game = await board().build();
    await game.p1.activate("lux");
    await game.p1.cast("call");
    await game.settle();
    expect(sandSoldiers(game)).toHaveLength(1);
    expect(legalKeys(game)).toContain("playUnit:two");
    expect(legalKeys(game)).not.toContain("playUnit:three");
    await game.p1.play("two");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("two")).toBe("base");
  });

  // ── (c) Hard Bargain's ransom ───────────────────────────────────────────────────────────────

  test("(c) with 2 NORMAL energy left when Hard Bargain resolves, P1 is asked and may pay [2]: Desert's Call survives → one Sand Soldier; pool 0; the 2-drop is no longer affordable", async () => {
    const game = await board().build();
    await game.p1.activate("lux");
    await callGetsBargained(game); // Lux's 2 went into the spell; 2 normal remain
    expect(game.p1.energy()).toBe(2);
    expect(game.gameState.restrictedEnergy?.[P1]?.spell ?? 0).toBe(0);
    await game.p1.passPriority(); // HB resolves
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, canAccept: true });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["call"]); // not countered, still waiting to resolve
    await game.settle();
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("call")).toBe("trash");
    expect(sandSoldiers(game)).toHaveLength(1);
    expect(game.p1.can("play", "two")).toBe(false);
    expect(legalKeys(game)).not.toContain("playUnit:two");
  });

  test("(c) declining to pay with 2 normal energy: Desert's Call is countered → trash, no token, the 2 energy stays and the 2-drop remains playable (444.2, 425.1.c)", async () => {
    const game = await board().build();
    await game.p1.activate("lux");
    await callGetsBargained(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("call")).toBe("trash");
    expect(game.zoneOf("hb")).toBe("trash");
    expect(sandSoldiers(game)).toHaveLength(0);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "two")).toBe(true);
  });

  test("(c) if P1's ONLY remaining energy is Lux's spell-only [2] (cast paid from normal energy, Lux exhausted in response), it cannot fund the ransom: Desert's Call is countered, no token, nothing refunded, Lux's [2] left unspent (429.3, 357.1.a, 359.3.c, 425.1.c)", async () => {
    const game = await board().build();
    await callGetsBargained(game); // paid with the 2 normal energy → pool 0
    expect(game.p1.energy()).toBe(0);
    // 429.3: Lux's Reaction-Add is usable while HB is on the chain — but the energy is spell-play-only.
    expect(game.p1.can("activate", "lux")).toBe(true);
    await game.p1.activate("lux");
    expect(game.p1.energy()).toBe(2);
    expect(game.gameState.restrictedEnergy?.[P1]?.spell).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["call", "hb"]);
    // If the engine asks anyway, P1 tries to pay — it must not succeed.
    game.script(P1, [(d) => (d.kind === "yes-no" ? true : undefined)]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("call")).toBe("trash"); // countered
    expect(sandSoldiers(game)).toHaveLength(0);
    expect(game.p1.energy()).toBe(2); // Lux's [2] untouched
    expect(game.gameState.restrictedEnergy?.[P1]?.spell).toBe(2);
    // …and that leftover still can't buy the 2-drop, only (another) spell.
    expect(game.p1.can("play", "two")).toBe(false);
  });

  test("(c) the ransom prompt, when P1 holds only Lux energy, is either not offered or offered with canAccept:false — never a payable 'yes'", async () => {
    const game = await board().build();
    await callGetsBargained(game);
    await game.p1.activate("lux");
    await game.p1.passPriority(); // HB resolves
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      expect(d.canAccept).toBe(false);
    } else {
      // skipped straight past the impossible payment
      expect(game.zoneOf("call")).toBe("trash");
      expect(sandSoldiers(game)).toHaveLength(0);
    }
  });

  // ── (d) end of turn ─────────────────────────────────────────────────────────────────────────

  test("(d) unspent Lux energy (restricted or not) empties with the pool at end of turn: P1 reads 0 energy on P2's turn (167 / 316.3)", async () => {
    const game = await board().build();
    await game.p1.activate("lux");
    expect(game.p1.energy()).toBe(4);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.energy()).toBe(0);
  });

  // Expected: the earmark dies with the pool (167.1 "any unspent Energy … are lost"), so on P1's NEXT
  // turn 2 freshly tapped rune energy is ordinary energy and the 2-cost unit is playable.
  // Actual: `restrictedEnergy[P1].spell` survives the end-of-turn emptying (still 2), so next turn the
  // engine treats P1's first 2 energy as spell-only and refuses the 2-drop (only Desert's Call is offered).
  test("(d) the spell-only earmark must not outlive the pool — next turn, 2 energy from runes plays the 2-cost unit (167.1, 429.4)", async () => {
    const game = await board().build();
    await game.p1.activate("lux");
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 turn 4 (channels 2 runes)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.gameState.restrictedEnergy?.[P1]?.spell ?? 0).toBe(0);
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "two")).toBe(true);
  });
});

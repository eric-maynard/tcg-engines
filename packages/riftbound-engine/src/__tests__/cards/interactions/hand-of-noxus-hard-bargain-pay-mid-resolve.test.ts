/**
 * Interaction: Hand of Noxus (ogn-253-298) · Legend (Darius)
 *     "[Exhaust]: [Reaction], [Legion] — [Add] [1]. (Get the effect if you've played a card this turn.)"
 *   × Hard Bargain (sfd-136-221) · Spell · Chaos · 2 · Reaction · "[Repeat] [2] … Counter a spell unless its controller pays [2]."
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1 + [fury] · Action · "Deal 3 to a unit at a battlefield."
 *   (contrast: Lux, Crownguard ogs-014-024 · Unit · "[Exhaust]: [Reaction] — [Add] [2]. Use only to play spells.")
 *
 * Board: P1's turn, legend Hand of Noxus, 3 ready Fury runes r1–r3, pool (0,{}); nothing finalized yet. P2's 3-Might
 * Target at bf1; P2 holds Hard Bargain with 2 energy (no Repeat). Line: P1 taps r1 + r2 and recycles r2 → (2,{fury:1});
 * casts Hextech Ray at Target → (1,{}); P2 answers Hard Bargain; both pass; Hard Bargain resolves and instructs P1 to
 * pay [2] while P1 holds 1 energy, one ready rune (r3) and a ready legend.
 *
 * Question:
 *   (a) At that instruction — nobody has priority, a spell is mid-resolution — may P1 exhaust Hand of Noxus and/or tap
 *       r3? Does the Add put anything on the chain or hand P2 a window / a Repeat?
 *   (b) Is Legion satisfied by Hextech Ray, still unresolved on the chain?
 *   (c) Pool trace for "exhaust Hand of Noxus → pay 2", outcome for Ray.
 *   (d) NO sides: (i) P1 declines → Ray countered, is the leftover 1E consumed or does it float to 317.2.d? (ii) legend
 *       already exhausted, no ready rune → any deferred/partial payment? (iii) a spell-only Add (Lux) can NOT fund it.
 *   (e) Does the harness's pay prompt expose the Hand of Noxus / rune-tap activations (444.2.c)?
 *
 * Rules: 444.2 / 444.2.b (an instructed Pay outside cost payment is optional; not paying just skips the "unless"),
 * 444.2.c + 429.3 / 429.3.a (Reaction Add abilities may be activated whenever a player is instructed to Pay — they
 * finalize and resolve immediately "even during the resolution of spells and abilities", no chain item, 429.2.a),
 * 812.1.c / 419.4.b (Legion keys off a DIFFERENT card FINALIZED this turn — a spell still on the chain counts),
 * 425.1.c (a countered spell's costs are not refunded), 357.1 vs 444.2.b (the ransom is not a cost of playing a spell →
 * spell-only energy is ineligible; Hand of Noxus's [1] is unrestricted), 167 / 317.2.d (unspent pool empties at end of turn).
 *
 * Expected: (a) yes and yes; nothing on the chain, P2 gets no window and Hard Bargain (already played without Repeat)
 * cannot gain one. (b) yes — listed only after Ray was finalized. (c) (0,{}) →tap,tap→ (2,{}) →recycle→ (2,{fury:1}) →Ray→
 * (1,{}) … prompt: exhaust legend → (2,{}) → pay → (0,{}); HB → trash without countering; both pass → Ray deals 3, Target
 * dies. Tapping r3 instead is equally legal. (d)(i) Ray countered → trash, no damage, the 1E is NOT taken and empties at
 * end of turn; (ii) prompt unpayable, nothing partial → countered; (iii) Lux's [2] leaves the prompt unpayable.
 * (e) the prompt is a yes-no with canAccept:false whose `actions` list activateAbility:hon and exhaustRune:r3.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HAND_OF_NOXUS = "ogn-253-298";
const HARD_BARGAIN = "sfd-136-221";
const HEXTECH_RAY = "ogn-009-298";
const LUX = "ogs-014-024";

function base() {
  return scenario()
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Target" }, "target")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P2, HARD_BARGAIN, "hb");
}

/** The question's board: ready Hand of Noxus, three ready Fury runes, empty pool. */
function board() {
  return base()
    .legend(P1, HAND_OF_NOXUS, "hon")
    .rune(P1, "fury", { alias: "r1" })
    .rune(P1, "fury", { alias: "r2" })
    .rune(P1, "fury", { alias: "r3" });
}

type YesNo = Extract<Decision, { kind: "yes-no" }>;

function ransomPrompt(game: Game): YesNo {
  const d = game.decision();
  expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
  expect((d as YesNo).prompt).toMatch(/\[2\]/);
  return d as YesNo;
}

const actionKeys = (d: YesNo): string[] => (d.actions ?? []).map((a) => a.key);

/** tap r1, tap r2, recycle r2 → (2,{fury:1}); Ray at Target → (1,{}); P2 Hard Bargains Ray; P2 passes → P1 holds priority with [ray, hb] on the chain. */
async function rayBargained(game: Game): Promise<void> {
  await game.p1.tapRune("r1");
  await game.p1.tapRune("r2");
  await game.p1.recycleRune("r2");
  await game.p1.cast("ray", { targets: "target" });
  await game.p1.passPriority();
  await game.p2.cast("hb", { targets: "ray" });
  await game.p2.passPriority();
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "hb"]);
  expect(game.actingSeat()).toBe(P1);
}

/** …and P1 passes too: Hard Bargain resolves and instructs P1 to pay [2]. Returns the prompt. */
async function toRansom(game: Game): Promise<YesNo> {
  await rayBargained(game);
  await game.p1.passPriority();
  return ransomPrompt(game);
}

describe("Hand of Noxus × Hard Bargain × Hextech Ray — a Reaction Add used mid-resolution to meet 'unless its controller pays [2]'", () => {
  // ───────────────────────────── pool trace up to the ransom / (b) Legion ─────────────────────────────

  test("(c) pool trace to the ransom: (0,{}) →tap r1,r2→ (2,{}) →recycle r2→ (2,{fury:1}) →Hextech Ray→ (1,{}); r1 tapped, r3 the only ready rune", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.p1.tapRune("r1");
    await game.p1.tapRune("r2");
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    await game.p1.recycleRune("r2"); // a tapped rune may still be recycled for its power
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    expect(game.p1.runes().sort()).toEqual(["r1", "r3"]);
    expect(game.p1.runes({ ready: true })).toEqual(["r3"]);
    await game.p1.cast("ray", { targets: "target" });
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
  });

  test("(b) Legion keys off FINALIZATION (812.1.c / 419.4.b): Hand of Noxus is NOT listed before any card is played, and IS listed the moment Hextech Ray sits finalized on the chain — unresolved", async () => {
    const game = await board().build();
    await game.p1.tapRune("r1");
    await game.p1.tapRune("r2");
    await game.p1.recycleRune("r2");
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.can("activate", "hon")).toBe(false);
    await game.p1.cast("ray", { targets: "target" });
    expect(game.zoneOf("ray")).toBe("chain");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p1.can("activate", "hon")).toBe(true);
  });

  test("premise: Hard Bargain (2, no Repeat affordable) goes on top of Ray; P2 is tapped out; with both passing it resolves into a pay-[2] question addressed to P1, Ray still on the chain, nothing charged yet", async () => {
    const game = await board().build();
    await rayBargained(game);
    expect(game.p2.energy()).toBe(0);
    const repeat = game.p2.option("cast", "hb")?.fields.find((f) => f.arg === "repeat");
    expect(repeat).toBeUndefined(); // hb already left P2's hand; nothing to repeat now
    const d = await toRansomFrom(game);
    expect(d.seat).toBe(P1);
    expect(game.chain().map((c) => `${c.cardId}:${c.countered}`)).toEqual(["ray:false"]);
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("target")).toBe("battlefield-bf1");
  });

  // ───────────────────────────── (e)/(a) the prompt surfaces the Add opportunity ─────────────────────────────

  test("(e) the ransom prompt with (1,{}) in the pool is SHOWN (not auto-declined) as canAccept:false, and its side-actions expose exactly the 444.2.c opportunities: activate Hand of Noxus, tap r3 (plus recycles/concede) — no pass, no P2 anything", async () => {
    const game = await board().build();
    const d = await toRansom(game);
    expect(d.canAccept).toBe(false);
    const keys = actionKeys(d);
    expect(keys).toContain("activateAbility:hon#0");
    expect(keys).toContain("exhaustRune:r3");
    expect(keys).not.toContain("passChainPriority:-");
    expect(game.p1.legal().map((o) => o.key)).toEqual(keys); // the seat menu IS those side-actions
    expect(game.p1.can("activate", "hon")).toBe(true);
    expect(game.p2.legal()).toEqual([]);
  });

  test("(e) 'yes' is refused while the pool is short — no partial payment of the 1 energy, Ray neither countered nor resolved, prompt still open", async () => {
    const game = await board().build();
    await toRansom(game);
    const r = await game.p1.try((p) => p.yes());
    expect(r.ok).toBe(false);
    expect(game.p1.energy()).toBe(1);
    expect(game.chain().map((c) => `${c.cardId}:${c.countered}`)).toEqual(["ray:false"]);
    ransomPrompt(game);
  });

  test("(a) exhausting Hand of Noxus AT the instruction (no priority, HB mid-resolution — 444.2.c / 429.3.a): legend exhausted, +1 at once → (2,{}), NO chain item, P2 gets no decision, the same prompt now reads canAccept:true", async () => {
    const game = await board().build();
    await toRansom(game);
    await game.p1.activate("hon");
    expect(game.state("hon").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]); // the Add never touched the chain; HB is still resolving
    expect(game.p2.legal()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);
    const d = ransomPrompt(game);
    expect(d.canAccept).toBe(true);
  });

  // ───────────────────────────── (c) the YES line ─────────────────────────────

  test("(c) exhaust legend → pay: (1,{}) → (2,{}) → (0,{}); Hard Bargain finishes WITHOUT countering and goes to P2's trash; Ray stays on the chain un-countered and priority reopens on it (P1 first)", async () => {
    const game = await board().build();
    await toRansom(game);
    await game.p1.activate("hon");
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.p2.trash()).toContain("hb");
    expect(game.chain().map((c) => `${c.cardId}:${c.countered}`)).toEqual(["ray:false"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) P2's only look-in afterwards is ordinary priority on Ray — Hard Bargain is in the trash, there is no Repeat to add and nothing else in P2's hand: P2 may only pass", async () => {
    const game = await board().build();
    await toRansom(game);
    await game.p1.activate("hon");
    await game.p1.yes();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.legal().map((o) => o.key).sort()).toEqual(["concede:-", "passChainPriority:-"]);
    expect(game.p2.can("cast", "hb")).toBe(false);
  });

  test("(c) both pass → Hextech Ray resolves: 3 damage kills the 3-Might Target; Ray → P1's trash; legend exhausted, r1 tapped, r3 still READY (never needed), pool (0,{}); P1's Open main phase, no violations", async () => {
    const game = await board().build();
    await toRansom(game);
    await game.p1.activate("hon");
    await game.p1.yes();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.p1.trash()).toContain("ray");
    expect(game.state("hon").isExhausted).toBe(true);
    expect(game.state("r1").isExhausted).toBe(true);
    expect(game.state("r3").isReady).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected: offering the legend's Reaction [Add] at the pay instruction is sanctioned by 444.2.c / 429.3.a, so a run
  // through the ransom prompt records no invariant violation. Actual: the harness invariant `pendingChoiceGatesMoves`
  // whitelists only exhaustRune / recycleRune during an opt-in Pay window and reports
  // "player-1 may activateAbility while a opt-in choice is pending" every step the (correctly offered) [Add]
  // Reaction is enumerated — whether or not it is used — so `violations()` is a false oracle on this board.
  test("reaching the ransom prompt with a ready Reaction-[Add] legend must be violation-free — `pendingChoiceGatesMoves` whitelists the 444.2.c activation", async () => {
    const game = await board().build();
    await toRansom(game);
    await game.p1.activate("hon");
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(c′) tapping r3 at the instruction instead of the legend is equally legal: (1)→(2)→pay→(0), Ray resolves and kills; the legend stays READY for later", async () => {
    const game = await board().build();
    await toRansom(game);
    await game.p1.tapRune("r3");
    expect(game.p1.energy()).toBe(2);
    expect(ransomPrompt(game).canAccept).toBe(true);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("hon").isReady).toBe(true);
    expect(game.state("r3").isExhausted).toBe(true);
  });

  test("(c″) doing BOTH (legend + r3) over-fills to 3: paying takes exactly 2 and the excess 1 floats in the pool after Ray resolves", async () => {
    const game = await board().build();
    await toRansom(game);
    await game.p1.activate("hon");
    await game.p1.tapRune("r3");
    expect(game.p1.energy()).toBe(3);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(1);
    await game.settle();
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.p1.energy()).toBe(1);
  });

  // ───────────────────────────── (d) the NO sides ─────────────────────────────

  test("(d)(i) P1 declines (444.2): Ray is COUNTERED → P1's trash, Target undamaged, HB → P2's trash; Ray's own 1+[fury] is not refunded (425.1.c) and the leftover 1 energy is NOT taken — it floats, legend and r3 still ready", async () => {
    const game = await board().build();
    await toRansom(game);
    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("target")).toBe("battlefield-bf1");
    expect(game.state("target").damage).toBe(0);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power()).toBe(0);
    expect(game.state("hon").isReady).toBe(true);
    expect(game.state("r3").isReady).toBe(true);
    expect(game.state("r2").zone).toBe("runeDeck"); // the recycled rune is gone for good
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(d)(i) …that floating 1 energy survives the rest of P1's turn and empties only at end of turn (167 / 317.2.d)", async () => {
    const game = await board().build();
    await toRansom(game);
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("(d)(i) settling without answering: the unpayable prompt is handed back once, then declined — same countered outcome, the 1 energy untouched (no auto-tap of r3, no auto-crack of the legend: paying is the player's act)", async () => {
    const game = await board().build();
    await toRansom(game);
    const first = await game.settle();
    expect(first.reason).toBe("unanswered"); // handed back once (canAccept:false)
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("target").damage).toBe(0);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("hon").isReady).toBe(true);
    expect(game.state("r3").isReady).toBe(true);
  });

  test("(d)(ii) legend ALREADY exhausted and no ready rune: the prompt still appears but is unpayable with no Add action to offer — no deferred or split payment exists; it ends countered with the 1 energy left over", async () => {
    const game = await base()
      .card("hon", { def: HAND_OF_NOXUS, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .rune(P1, "fury", { alias: "r1" })
      .rune(P1, "fury", { alias: "r2" })
      .build();
    expect(game.state("hon").isExhausted).toBe(true);
    await game.p1.tapRune("r1");
    await game.p1.tapRune("r2");
    await game.p1.recycleRune("r2");
    await game.p1.cast("ray", { targets: "target" });
    expect(game.p1.can("activate", "hon")).toBe(false); // Legion met, but [Exhaust] is unpayable
    await game.p1.passPriority();
    await game.p2.cast("hb", { targets: "ray" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    const d = ransomPrompt(game);
    expect(d.canAccept).toBe(false);
    expect(actionKeys(d).filter((k) => k.startsWith("activateAbility:") || k.startsWith("exhaustRune:"))).toEqual([]);
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("target").damage).toBe(0);
    expect(game.p1.energy()).toBe(1);
  });

  test("(d)(iii) contrast — Lux's spell-only [2] cannot fund the ransom (444.2.b is not 357.1): cracking Lux at the prompt makes the pool read 3 but the prompt stays canAccept:false and 'yes' is refused; Hand of Noxus's unrestricted [1] is what flips it", async () => {
    const game = await board().unit(P1, "base", LUX, "lux").build();
    const d = await toRansom(game);
    expect(actionKeys(d)).toEqual(expect.arrayContaining(["activateAbility:lux#0", "activateAbility:hon#0"]));
    await game.p1.activate("lux");
    expect(game.p1.energy()).toBe(3);
    expect(game.gameState.restrictedEnergy?.[P1]?.spell).toBe(2);
    expect(ransomPrompt(game).canAccept).toBe(false);
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    await game.p1.activate("hon"); // 1 ordinary + 1 ordinary = 2 spendable
    expect(game.p1.energy()).toBe(4);
    expect(ransomPrompt(game).canAccept).toBe(true);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(2); // only Lux's spell-only 2 remain
    expect(game.gameState.restrictedEnergy?.[P1]?.spell).toBe(2);
    await game.settle();
    expect(game.zoneOf("target")).toBe("trash");
  });

  // ───────────────────────────── (a) the pre-emptive line, for completeness ─────────────────────────────

  test("(a, alt) P1 may of course also crack the legend EARLIER — with priority while HB is still on the chain (Reaction timing, Closed state): +1, chain unchanged, P1 keeps priority; HB then finds (2,{}) and the prompt is payable straight away", async () => {
    const game = await board().build();
    await rayBargained(game);
    expect(game.p1.can("activate", "hon")).toBe(true);
    await game.p1.activate("hon");
    expect(game.p1.energy()).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "hb"]);
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority(); // P2 already passed → HB resolves
    expect(ransomPrompt(game).canAccept).toBe(true);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("hb")).toBe("trash");
  });
});

/** Same as toRansom but for a game already at `rayBargained`. */
async function toRansomFrom(game: Game): Promise<YesNo> {
  await game.p1.passPriority();
  return ransomPrompt(game);
}

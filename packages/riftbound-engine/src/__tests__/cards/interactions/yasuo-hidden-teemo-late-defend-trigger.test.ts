/**
 * Interaction: Yasuo, Remorseful (ogn-076-298) · Champion Unit · Calm · 6 · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Teemo, Strategist (ogn-121-298) · Champion Unit · Mind · 2 · 2 Might · [Hidden]
 *     "When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to
 *      that unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *   × Shipyard Skulker (ogn-175-298) · Unit · Chaos · 3 · 3 Might (vanilla)
 *
 * Question: P1's turn. P2 controls bf1 with a Skulker and has Teemo facedown at bf1 since a previous turn.
 * P1 moves Yasuo alone into bf1.
 *   (a) When Yasuo's attack trigger is finalized, can it target the facedown card?
 *   (b) P1 passes priority on the combat chain; may P2 — holding priority but NOT Focus — flip Teemo, and
 *       where must Teemo be played? Does Teemo become a Defender and does "When I defend" fire even though
 *       combat already opened; where does it land relative to Yasuo's trigger?
 *   (c) Resolve with P2's top 5 containing 0 Hidden cards vs 5 Hidden cards: assignment and result.
 *   (d) Contrast: P2 never flips Teemo.
 *
 * Rules: 464.2.c.3 / 464.2.c.3.a (designations at combat start; a late arrival gains its controller's
 * designation at the next Cleanup), 323.2.a, 383.4.f / 383.4.f.2 / 383.4.f.2.a (Defend triggers fire the
 * first time the designation is gained during a combat — whenever that is), 464.2.e.1, 811.1.b (a hidden
 * card gains [Reaction] and is played for [0] whenever its controller may act), 811.1.d.1 (a hidden
 * permanent is played TO its battlefield), 811.1.d.2, 346.1 (Focus stays with its holder while a chain is
 * open), 465.1 (no defending units → no damage step), 465.2.c / 465.2.c.4 (a lone unit takes all of the
 * opposing side's damage), 466.1.a.1 (survivors are healed), 466.3.a / 466.3.d (winner vs No Result),
 * 466.5 / 466.5.b / 466.5.c / 466.5.d (establish control → conquer +1; nobody left → Uncontrolled; hidden
 * cards not sharing the battlefield's controller are removed).
 *
 * Expected: (a) Only Skulker — a facedown card is not a unit. (b) Yes: priority suffices (Reaction); Teemo
 * enters bf1 exhausted for [0], becomes a Defender at the next Cleanup, his Defend trigger fires, targets
 * Yasuo (only enemy unit here) and sits ABOVE Yasuo's trigger → resolves first. (c) 0 Hidden: Teemo deals
 * 0; Yasuo's trigger kills Skulker; combat 6 → Teemo, 2 → Yasuo: Teemo dies, Yasuo healed, P1 conquers
 * (+1). 5 Hidden: Teemo deals 5 to Yasuo first (survives), Skulker still dies; combat 6 → Teemo, 2 → Yasuo
 * (7 ≥ 6): both die → No Result, bf1 Uncontrolled, no points. (d) No flip: Skulker dies to the trigger, P2
 * keeps control mid-combat so the facedown Teemo stays; no defenders → no damage step; P1 conquers (+1)
 * and the facedown Teemo is removed to P2's trash.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const TEEMO = "ogn-121-298";
const SKULKER = "ogn-175-298";
const CONSULT_THE_PAST = "ogn-083-298"; // a spell with [Hidden] — counts for Teemo's reveal

/**
 * P1's turn 3 (Teemo was hidden on an earlier turn). P2 controls bf1 with a Skulker + facedown Teemo.
 * P1's Yasuo is ready in base. P2's top 6: `hiddenTop` Hidden cards first, then plain Skulkers.
 */
function board(hiddenTop: 0 | 5) {
  const deck = [...Array<string>(hiddenTop).fill(CONSULT_THE_PAST), ...Array<string>(6 - hiddenTop).fill(SKULKER)];
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SKULKER, "skulker")
    .facedown(P2, "bf1", TEEMO, "teemo")
    .unit(P1, "base", YASUO, "yasuo")
    .deck(P2, deck, ["d1", "d2", "d3", "d4", "d5", "d6"]);
}

function showdown(game: Game) {
  return game.gameState.interaction?.showdownStack?.at(-1);
}

/** Yasuo attacks bf1 and P1 passes priority on his own finalized trigger → P2 holds priority (not Focus). */
async function p2HasPriority(hiddenTop: 0 | 5): Promise<Game> {
  const game = await board(hiddenTop).build();
  await game.p1.move("yasuo", "bf1");
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

/** …P2 flips Teemo (answering the target ask with Yasuo if the engine asks rather than auto-locks). */
async function teemoFlipped(hiddenTop: 0 | 5): Promise<Game> {
  const game = await p2HasPriority(hiddenTop);
  await game.p2.reveal("teemo");
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("yasuo");
  }
  return game;
}

/** …both triggers resolve (Teemo's first, then Yasuo's); the showdown is still open with P1's Focus. */
async function triggersResolved(hiddenTop: 0 | 5): Promise<Game> {
  const game = await teemoFlipped(hiddenTop);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Teemo's trigger resolves
  await game.p1.passPriority();
  await game.p2.passPriority(); // Yasuo's trigger resolves
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Yasuo, Remorseful attacks into a facedown Teemo, Strategist — late Defender, late Defend trigger", () => {
  // ---- (a) combat opens; Yasuo's trigger cannot see the facedown card -------------------------------------

  test("(a) the move opens combat at bf1: P1 is the Attacker with Focus, Yasuo gains Attacker, Skulker Defender, bf1 Contested by P1 but still P2's (464.2.c)", async () => {
    const game = await board(0).build();
    await game.p1.move("yasuo", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("yasuo")).toMatchObject({ combatRole: "attacker", isExhausted: true, location: "bf1" });
    expect(game.state("skulker")).toMatchObject({ combatRole: "defender", location: "bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.state("teemo")).toMatchObject({ isHidden: true, zone: "facedown-bf1" });
  });

  test("(a) Yasuo's attack trigger is the only chain item and its target is locked to Skulker — the facedown Teemo is not a unit and is never offered (464.2.e.1, 811)", async () => {
    const game = await board(0).build();
    await game.p1.move("yasuo", "bf1");
    const d = game.decision();
    if (d?.kind === "pick") {
      // If the engine asks at all, the facedown card must not be among the candidates.
      expect(d.options.map((o) => o.card)).toEqual(["skulker"]);
      await game.p1.pick("skulker");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["skulker"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 holds priority first
  });

  test("(a) while P1 still holds priority over his own trigger, P2 has nothing to do — not even the flip", async () => {
    const game = await board(0).build();
    await game.p1.move("yasuo", "bf1");
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("reveal", "teemo")).toBe(false);
  });

  // ---- (b) the flip with priority but without Focus --------------------------------------------------------

  test("(b) once P1 passes priority, P2 — holding priority but NOT Focus — is offered the flip of the facedown Teemo (811.1.b: it has [Reaction])", async () => {
    const game = await p2HasPriority(0);
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.p2.can("reveal", "teemo")).toBe(true);
    expect(game.p2.legal().map((o) => o.key)).toContain("revealHidden:teemo");
    // No location choice is offered: a hidden permanent goes to ITS battlefield (811.1.d.1).
    const to = game.p2.option("reveal", "teemo")?.fields.find((f) => f.arg === "to");
    expect(to === undefined || (to.options ?? []).every((v) => v === "bf1" || v === "battlefield-bf1")).toBe(true);
  });

  test("(b) the flip costs [0] and plays Teemo TO bf1, exhausted, no longer hidden, under P2's control (811.1.b, 811.1.d.1)", async () => {
    const game = await p2HasPriority(0);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.p2.reveal("teemo");
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("yasuo");
    }
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("teemo")).toMatchObject({ controller: P2, isExhausted: true, isHidden: false, location: "bf1", might: 2, zone: "battlefield-bf1" });
    expect(game.p2.facedown("bf1")).toEqual([]);
    expect(game.p2.units("bf1").sort()).toEqual(["skulker", "teemo"]);
  });

  test("(b) Teemo, arriving after combat opened, gains his controller's designation — DEFENDER — at the following Cleanup (464.2.c.3.a / 323.2.a); Yasuo stays the Attacker, Focus stays with P1 (346.1)", async () => {
    const game = await teemoFlipped(0);
    expect(game.state("teemo").combatRole).toBe("defender");
    expect(game.state("skulker").combatRole).toBe("defender");
    expect(game.state("yasuo").combatRole).toBe("attacker");
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P1, isCombatShowdown: true });
  });

  test("(b) gaining Defender for the first time this combat fires 'When I defend' even mid-combat (383.4.f.2): P2's trigger targets Yasuo (only enemy unit here) and is appended ABOVE Yasuo's trigger", async () => {
    const game = await p2HasPriority(0);
    await game.p2.reveal("teemo");
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d).toMatchObject({ seat: P2 });
      expect(d.options.map((o) => o.card)).toEqual(["yasuo"]); // Skulker is friendly, nothing else is here
      await game.p2.pick("yasuo");
    }
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "yasuo", controller: P1, targets: ["skulker"], triggered: true }),
      expect.objectContaining({ cardId: "teemo", controller: P2, targets: ["yasuo"], triggered: true }),
    ]);
    // P2 added the last item → P2 holds priority first over it.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(b) LIFO: after both pass, Teemo's trigger resolves FIRST (top 5 revealed and recycled) while Yasuo's is still waiting and Skulker is untouched", async () => {
    const game = await teemoFlipped(0);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", targets: ["skulker"] })]);
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.state("skulker").damage).toBe(0);
    // The five revealed cards went to the bottom; d6 is the new top.
    const deck = game.p2.deck();
    expect(deck[0]).toBe("d6");
    expect(deck.slice(-5).sort()).toEqual(["d1", "d2", "d3", "d4", "d5"]);
    expect(game.gameState.publicReveals?.at(-1)).toMatchObject({ cardIds: ["d1", "d2", "d3", "d4", "d5"], playerId: P2 });
  });

  // ---- (c) 0 Hidden revealed --------------------------------------------------------------------------------

  test("(c/0 Hidden) Teemo's trigger deals 0 to Yasuo; then Yasuo's trigger deals 6 to Skulker → Skulker dies; the showdown continues with Focus on P1, Yasuo vs Teemo", async () => {
    const game = await triggersResolved(0);
    expect(game.state("yasuo").damage).toBe(0);
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.p2.trash()).toEqual(["skulker"]);
    expect(game.p1.units("bf1")).toEqual(["yasuo"]);
    expect(game.p2.units("bf1")).toEqual(["teemo"]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 }); // control never changes mid-combat
  });

  test("(c/0 Hidden) both pass → damage step 6 → Teemo / 2 → Yasuo (lone units take it all, 465.2.c.4): Teemo dies, Yasuo survives and is healed (466.1.a.1); P1 won (466.3.a) and conquers bf1: +1 point, Contested cleared (466.5)", async () => {
    const game = await triggersResolved(0);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.p2.trash().sort()).toEqual(["skulker", "teemo"]);
    expect(game.state("yasuo")).toMatchObject({ combatRole: null, damage: 0, location: "bf1", zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ---- (c) 5 Hidden revealed --------------------------------------------------------------------------------

  test("(c/5 Hidden) Teemo's trigger resolves first and deals 5 to Yasuo (5 < 6 → survives); Yasuo's trigger still resolves and kills Skulker", async () => {
    const game = await teemoFlipped(5);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Teemo's trigger
    expect(game.state("yasuo")).toMatchObject({ damage: 5, location: "bf1", zone: "battlefield-bf1" });
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", targets: ["skulker"] })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Yasuo's trigger — a damaged Yasuo still has 6 Might
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("yasuo").damage).toBe(5);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("(c/5 Hidden) damage step 6 → Teemo, 2 → Yasuo (now 7 ≥ 6): BOTH die in the Combat Cleanup → No Result (466.3.d): bf1 becomes Uncontrolled (466.5.b), nobody scores", async () => {
    const game = await triggersResolved(5);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("trash");
    expect(game.p1.trash()).toEqual(["yasuo"]);
    expect(game.p2.trash().sort()).toEqual(["skulker", "teemo"]);
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(showdown(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ---- (d) contrast: P2 never flips ------------------------------------------------------------------------

  test("(d) no flip: Yasuo's trigger kills Skulker; P2 KEEPS control of bf1 during the combat, so the facedown Teemo is not removed yet and P2 could still flip it with Focus", async () => {
    const game = await p2HasPriority(5);
    await game.p2.passPriority(); // Yasuo's trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.state("teemo").isHidden).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "teemo")).toBe(true); // last chance
  });

  test("(d) no flip, both pass: no defending units → no damage step, nobody assigns anything (465.1); P1 won (466.3.a), conquers bf1 (+1), and the facedown Teemo — no longer sharing bf1's controller — goes to P2's trash (466.5.c)", async () => {
    const game = await p2HasPriority(5);
    let anyoneAskedToAssign = false;
    const spy = (d: { kind: string }) => {
      anyoneAskedToAssign ||= d.kind === "distribute";
      return undefined;
    };
    game.script(P1, [spy]);
    game.script(P2, [spy]);
    await game.p2.passPriority();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(anyoneAskedToAssign).toBe(false);
    expect(game.state("yasuo")).toMatchObject({ damage: 0, location: "bf1", zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.state("teemo")).toMatchObject({ isHidden: false, owner: P2, zone: "trash" });
    expect(game.p2.trash().sort()).toEqual(["skulker", "teemo"]);
    expect(game.p2.facedown("bf1")).toEqual([]);
    expect(game.p2.deck()[0]).toBe("d1"); // Teemo never triggered: nothing revealed or recycled
    expect(game.violations()).toEqual([]);
  });
});

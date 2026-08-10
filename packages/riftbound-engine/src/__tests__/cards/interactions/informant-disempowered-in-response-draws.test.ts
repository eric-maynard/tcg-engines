/**
 * Interaction: Covert Informant (ven-057-166) · Unit · Mind · 3+[mind] · 4 Might
 *     "[Empower] [3] ([3]: Empower me. Use only if not Empowered.)  [Empowered][>] When I move, draw 1."
 *   × Sanction (ven-035-166) · Spell · Calm · 3+[calm] · Reaction · "Choose one — Empower a unit. Disempower it at
 *     end of turn. / Disempower a unit that's [Empowered]. Empower it at end of turn."            — held by P2
 *   × Ride the Wind (ogn-173-298) · Spell · Chaos · 2+[chaos] · Action · "Move a friendly unit and ready it."
 *
 * Rules: 144.2 / 420.3.a (Standard Move: exhausting the unit is the COST, moving is the effect), 828.1.b.1 / 828.1.c
 * ("[Empowered][>] Text" = "while I have the Empowered status I gain Text" — the dependent trigger is only active while
 * Empowered), 383.3 / 384.2 (a met condition puts the trigger on the chain; conditions are evaluated when the event
 * happens), 406.4 (opponents may play Reactions before it resolves), 442.1 (Disempower removes the status), 441.1.c
 * (empowering an already-Empowered object does nothing more), 827.1.c.1 ([Empower] = "[Cost]: Empower this. Play only
 * if not Empowered."), 415.1 (Ready).
 *
 * Question: P1's READY, already-Empowered Informant Standard-Moves base → bf1 (P1's own, empty battlefield).
 *   (a) Does "When I move, draw 1" trigger, and can P2 respond?
 *   (b) P2 responds with Sanction mode 2 on the Informant. After Sanction resolves the Informant is no longer Empowered
 *       — does the ALREADY-PENDING draw still resolve?
 *   (c) Same turn, P1 Rides the Wind on the (exhausted, disempowered) Informant bf1 → base + ready. Draw? Is
 *       [Empower] [3] offered again?
 *   (d) End of turn: Sanction re-empowers it; next P1 turn a Standard Move draws again.
 *
 * Expected: (a) yes — trigger on the chain as P1's item, Informant at bf1 exhausted + empowered, P2 holds a Reaction
 * window and Sanction (mode 2) is legal. (b) LIFO: Sanction resolves first → empowered=false; the trigger already on
 * the chain is an independent item with no target → it still resolves and P1 draws 1. (c) the effect-move readies it
 * but it is NOT Empowered during that move → no trigger, no draw; [Empower] [3] is offered again (flag is false); if
 * P1 re-activates it, it is Empowered at once and Sanction's end-of-turn Empower then does nothing extra. (d) without
 * re-activating: end of turn → empowered=true, carried into P1's next turn, where a Standard Move draws again.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const INFORMANT = "ven-057-166";
const SANCTION = "ven-035-166";
const RIDE_THE_WIND = "ogn-173-298";
const FILLER = "ogn-175-298";
const DISEMPOWER = 1; // Sanction's printed mode order: 0 = Empower…, 1 = Disempower…

/**
 * P1's turn 2. P1: ready + Empowered Informant in base, bf1 (P1's, empty), Ride the Wind in hand, 5 energy + 1 chaos
 * (2+[chaos] for Ride the Wind, 3 for a re-Empower), known deck d1..d6. P2: Sanction in hand with exactly 3 + [calm].
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", INFORMANT, "spy", { empowered: true })
    .resources(P1, { energy: 5, power: { chaos: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P2, SANCTION, "sanction")
    .deck(P1, [FILLER, FILLER, FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4", "d5", "d6"]);
}

/** (a) P1 Standard-Moves the Informant base → bf1 and passes priority with the draw trigger pending. */
async function movedTriggerPending(): Promise<Game> {
  const game = await board().build();
  expect(game.state("spy")).toMatchObject({ isEmpowered: true, isReady: true, location: "base" });
  await game.p1.move("spy", "bf1");
  return game;
}

/** (b) …P2 answers with Sanction mode 2 on the Informant; everything resolves. */
async function sanctionedInResponse(): Promise<Game> {
  const game = await movedTriggerPending();
  await game.p1.passPriority();
  await game.p2.cast("sanction", { mode: DISEMPOWER, targets: "spy" });
  return game;
}

/** (c) …then P1 casts Ride the Wind on the Informant, sending it bf1 → base. */
async function rodeTheWindHome(): Promise<Game> {
  const game = await sanctionedInResponse();
  await game.settle();
  await game.p1.cast("rtw", { targets: "spy" });
  await game.settle();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("base");
    await game.settle();
  }
  return game;
}

describe("Covert Informant × Sanction (mode 2 in response) × Ride the Wind — does the pending draw survive losing Empowered?", () => {
  // ── (a) the Standard Move ─────────────────────────────────────────────────────────────────────────

  test("(a) Standard Move base → bf1: the Informant is EXHAUSTED (the move's cost, 144.2) at bf1, still Empowered, and its 'When I move, draw 1' is on the chain as P1's triggered item; nothing drawn yet", async () => {
    const game = await movedTriggerPending();
    expect(game.state("spy")).toMatchObject({ isEmpowered: true, isExhausted: true, location: "bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spy", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toEqual(["rtw"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) 406.4: after P1 passes, P2 holds priority with the trigger still pending and Sanction is a legal Reaction; mode 2 ('Disempower a unit that's [Empowered]') offers the Empowered Informant", async () => {
    const game = await movedTriggerPending();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(1);
    expect(game.p2.can("cast", "sanction")).toBe(true);
    expect(await game.p2.try((p) => p.cast("sanction", { mode: DISEMPOWER, targets: "spy" }))).toMatchObject({ ok: true });
  });

  // ── (b) Sanction mode 2 in response ───────────────────────────────────────────────────────────────

  test("(b) Sanction stacks on top of the trigger (P2 paid 3 + [calm]); LIFO — it resolves FIRST: the Informant is Disempowered (442.1) while the draw trigger is STILL on the chain", async () => {
    const game = await sanctionedInResponse();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spy", "sanction"]);
    expect(game.chain()[1]).toMatchObject({ controller: P2, mode: DISEMPOWER, targets: ["spy"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Sanction resolves
    expect(game.zoneOf("sanction")).toBe("trash");
    expect(game.state("spy")).toMatchObject({ isEmpowered: false, isExhausted: true, location: "bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spy", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toEqual(["rtw"]); // not yet
  });

  test("(b) the already-pending trigger is an independent chain item (383.3 / 384.2) — it still resolves although its source is no longer Empowered: P1 draws exactly 1 (d1)", async () => {
    const game = await sanctionedInResponse();
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().sort()).toEqual(["d1", "rtw"]);
    expect(game.state("spy")).toMatchObject({ isEmpowered: false, isExhausted: true, location: "bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) control — no response: the trigger resolves, P1 draws d1, and the Informant stays Empowered at bf1", async () => {
    const game = await movedTriggerPending();
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["d1", "rtw"]);
    expect(game.state("spy")).toMatchObject({ isEmpowered: true, isExhausted: true, location: "bf1" });
    expect(game.p2.hand()).toEqual(["sanction"]);
  });

  // ── (c) Ride the Wind on the disempowered Informant ───────────────────────────────────────────────

  test("(c) Ride the Wind (2 + [chaos]) moves the disempowered Informant bf1 → base by EFFECT (no exhaust cost) and READIES it (415.1); it was not Empowered during that move → no trigger, no draw (828.1.b.1)", async () => {
    const game = await rodeTheWindHome();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 0 } });
    expect(game.state("spy")).toMatchObject({ isEmpowered: false, isReady: true, location: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]); // only the card from (b); Ride the Wind spent
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) [Empower] [3] is offered again now (the flag is false — 827.1.c.1); re-activating costs exactly 3 energy and makes it Empowered immediately on resolution", async () => {
    const game = await rodeTheWindHome();
    expect(game.p1.can("activate", "spy")).toBe(true);
    await game.p1.activate("spy");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spy", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.state("spy")).toMatchObject({ isEmpowered: true, isReady: true, location: "base" });
    expect(game.p1.can("activate", "spy")).toBe(false); // "only if not Empowered"
  });

  test("(c) contrast — while it was still Empowered (before Sanction) [Empower] [3] was NOT offered even with 5 energy floating", async () => {
    const game = await board().build();
    expect(game.p1.energy()).toBe(5);
    expect(game.p1.can("activate", "spy")).toBe(false);
  });

  test("(c→d) if P1 re-Empowered it, Sanction's end-of-turn 'Empower it' does nothing extra (441.1.c): it simply stays Empowered into P2's turn and P1's next turn", async () => {
    const game = await rodeTheWindHome();
    await game.p1.activate("spy");
    await game.settle();
    expect(game.state("spy").isEmpowered).toBe(true);
    await game.advanceTurn(); // P1's Ending Step (Sanction's delayed Empower) → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("spy")).toMatchObject({ isEmpowered: true, location: "base" });
    await game.advanceTurn(); // → P1's turn 4
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("spy")).toMatchObject({ isEmpowered: true, isReady: true, location: "base" });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) Sanction's end-of-turn re-Empower, and next turn ──────────────────────────────────────────

  test("(d) without re-activating: through the rest of P1's turn it stays disempowered; at end of turn Sanction's delayed 'Empower it' fires → Empowered again during P2's turn (no duration — 442/441)", async () => {
    const game = await rodeTheWindHome();
    expect(game.state("spy").isEmpowered).toBe(false);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("spy")).toMatchObject({ isEmpowered: true, isReady: true, location: "base" });
  });

  test("(d) on P1's NEXT turn the Informant is ready + Empowered in base; a Standard Move base → bf1 puts the draw trigger on the chain again and P1 draws exactly 1 more", async () => {
    const game = await rodeTheWindHome();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1's turn 4 (draw phase: +1 card)
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("spy")).toMatchObject({ isEmpowered: true, isReady: true, location: "base" });
    const before = game.p1.hand().length;
    await game.p1.move("spy", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "spy", controller: P1, triggered: true })]);
    expect(game.state("spy")).toMatchObject({ isEmpowered: true, isExhausted: true, location: "bf1" });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(before + 1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

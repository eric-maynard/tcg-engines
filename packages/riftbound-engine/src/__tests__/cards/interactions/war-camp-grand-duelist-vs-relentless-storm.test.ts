/**
 * Interaction: Trifarian War Camp (ogn-294-298) · Battlefield · "Units here have +1 [Might]. (This includes attackers.)"
 *   × Grand Duelist (sfd-205-221) · Legend (Fiora) · "When one of your units BECOMES [Mighty], you may exhaust me to channel 1 rune
 *     exhausted."
 *   × Relentless Storm (ogn-249-298) · Legend (Volibear) · "When you PLAY a [Mighty] unit, you may exhaust me to channel 1 rune
 *     exhausted."
 *   with Vanguard Sergeant (ogn-219-298, vanilla 4, cost 4) and Yone, Blademaster (sfd-116-221, printed 5, cost 5+[body]).
 *
 * Rules: 708 (a unit IS Mighty while its Might ≥ 5), 709 (a unit BECOMES Mighty at the moment its Might changes from <5 to ≥5 —
 * a unit that was already ≥5 does not), 710 (board units are evaluated on CURRENT Might; the rule's own example is a bonus ending),
 * 711, 359.2.a (passives are active as the permanent enters), 383.2.c (a trigger's condition is evaluated right after the inciting
 * event has been processed), 144.2 (location-scoped "here" passives), 810.
 *
 * Question: War Camp is bf1, controlled by P1 (a P1 token stands there). Run each line with P1's legend = Grand Duelist and again
 * with Relentless Storm. (a) P1 plays a printed-4 vanilla DIRECTLY to War Camp — Might on arrival, which legend triggers? (b) P1
 * plays it to BASE and next turn Standard-Moves it base → War Camp — which legend triggers, and when? (c) It later moves War Camp →
 * base (5→4) and on a later turn back (4→5) — does Grand Duelist trigger AGAIN? (d) P1 plays a printed-5 unit to base — which
 * legend triggers? (e) The Might timeline the engine should expose for (a) vs (b).
 *
 * Expected: (a) the "+1 here" passive applies the instant the unit is a board object at War Camp → it is 5 the moment it exists;
 * there is never a board state where it is 4. Relentless Storm ("play a Mighty unit" checks the unit as it finishes being played)
 * → triggers. Grand Duelist ("becomes" needs an on-board <5 → ≥5 change) → does NOT. The two legends are mutually exclusive here.
 * (b) to base at 4: neither triggers. On the move into War Camp the existing object goes 4→5 → BECOMES Mighty → Grand Duelist
 * triggers right after the move (383.2.c); Relentless Storm does not (a move is not a play). (c) Yes: leaving 5→4 (no longer
 * Mighty), re-entering 4→5 is again "the moment its Might changes from <5 to ≥5" → Grand Duelist triggers again — 709 has no
 * once-per-object memory. (d) printed 5 to base: Relentless Storm triggers; Grand Duelist does not (entered at 5, no change).
 * (e) (a): [not on board] → 5 in a single step, no 4 sample; (b): 4 on the board … move … 5.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const WAR_CAMP = "ogn-294-298";
const GRAND_DUELIST = "sfd-205-221";
const RELENTLESS_STORM = "ogn-249-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const YONE_BLADEMASTER = "sfd-116-221";

type Legend = typeof GRAND_DUELIST | typeof RELENTLESS_STORM;

/**
 * P1's turn 2. bf1 = Trifarian War Camp (abilities LIVE), held by P1 via a 1-Might Recruit token standing there; bf2 a blank
 * uncontrolled battlefield. P1: the legend under test (ready), Vanguard Sergeant + Yone in hand, 9 energy + [body] (4 + 5+[body]).
 * P2 has nothing on the board, so no move ever starts a combat.
 */
function board(legend: Legend) {
  return scenario()
    .resources(P1, { energy: 9, power: { body: 1 } })
    .battlefield("bf1", { controller: P1, def: WAR_CAMP, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { isToken: true, might: 1, name: "Recruit", tags: ["Recruit"] }, "token-recruit")
    .legend(P1, legend, "legend")
    .hand(P1, VANGUARD_SERGEANT, "sarge")
    .hand(P1, YONE_BLADEMASTER, "yone");
}

/** Is the legend's "you may exhaust me…" being offered to P1 right now? */
function legendOffered(game: Game): boolean {
  const d = game.decision();
  return d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "legend";
}

/** Rune-pool snapshot: total channelled runes and how many of them are exhausted. */
const runes = (game: Game) => ({ exhausted: game.p1.runes({ ready: false }).length, total: game.p1.runes().length });

/** (b) line: Sergeant played to base on turn 2, then on P1's next turn (turn 4, it is awake) Standard-Moved base → War Camp. */
async function playedToBaseThenMovedIn(legend: Legend): Promise<{ game: Game; timeline: number[] }> {
  const game = await board(legend).build();
  const timeline: number[] = [];
  await game.p1.play("sarge", { to: "base" });
  timeline.push(game.state("sarge").might);
  await game.settle();
  await game.advanceTurn(); // → P2
  await game.advanceToTurnOf(P1); // → P1's turn 4, Sergeant readied
  timeline.push(game.state("sarge").might);
  await game.p1.move("sarge", "bf1");
  timeline.push(game.state("sarge").might);
  return { game, timeline };
}

describe("premise", () => {
  test("War Camp is live and held by P1: the 1-Might Recruit token standing there reads 2 ('Units here have +1 Might')", async () => {
    const game = await board(GRAND_DUELIST).build();
    expect(game.gameState.battlefields?.bf1?.controller).toBe(P1);
    expect(game.state("token-recruit")).toMatchObject({ location: "bf1", might: 2 });
    expect(game.state("legend").isExhausted).toBe(false);
    expect(runes(game)).toEqual({ exhausted: 0, total: 0 });
    // P1 controls War Camp → the Sergeant may be played straight there (or to base)
    expect(game.p1.option("play", "sarge")?.fields.find((f) => f.arg === "to")?.options).toEqual(["base", "battlefield-bf1"]);
  });
});

describe("(a) printed-4 Vanguard Sergeant played DIRECTLY to War Camp", () => {
  test("it is 5 the moment it exists on the board (359.2.a / 710) — the very first board sample is 5, never 4; costs 4", async () => {
    for (const legend of [GRAND_DUELIST, RELENTLESS_STORM] as const) {
      const game = await board(legend).build();
      await game.p1.play("sarge", { to: "bf1" });
      expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
      expect(game.state("sarge").might).toBe(5); // first observable board state
      expect(game.p1.energy()).toBe(5);
    }
  });

  test("Relentless Storm: 'when you PLAY a Mighty unit' — it IS Mighty as it finishes being played (708) → the optional trigger is on the chain and offered to P1", async () => {
    const game = await board(RELENTLESS_STORM).build();
    await game.p1.play("sarge", { to: "bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "legend", controller: P1, triggered: true })]);
    expect(legendOffered(game)).toBe(true);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
  });

  test("Relentless Storm: accepting exhausts the legend and channels 1 rune EXHAUSTED (+1 rune, +1 exhausted); declining does neither", async () => {
    const yes = await board(RELENTLESS_STORM).build();
    await yes.p1.play("sarge", { to: "bf1" });
    const before = runes(yes);
    await yes.p1.yes();
    await yes.settle();
    expect(yes.state("legend").isExhausted).toBe(true);
    expect(runes(yes)).toEqual({ exhausted: before.exhausted + 1, total: before.total + 1 });
    expect(yes.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });

    const no = await board(RELENTLESS_STORM).build();
    await no.p1.play("sarge", { to: "bf1" });
    await no.p1.no();
    await no.settle();
    expect(no.state("legend").isExhausted).toBe(false);
    expect(runes(no)).toEqual({ exhausted: 0, total: 0 });
    expect(yes.violations()).toEqual([]);
  });

  test("Grand Duelist: 'BECOMES Mighty' needs an on-board <5 → ≥5 change (709) — it entered AT 5, so nothing triggers: empty chain, no prompt, legend ready, straight back to P1's main phase", async () => {
    const game = await board(GRAND_DUELIST).build();
    await game.p1.play("sarge", { to: "bf1" });
    expect(game.chain()).toEqual([]);
    expect(legendOffered(game)).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(legendOffered(game)).toBe(false);
    expect(game.state("legend").isExhausted).toBe(false);
    expect(runes(game)).toEqual({ exhausted: 0, total: 0 });
    expect(game.state("sarge").might).toBe(5);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("mutually exclusive: on the identical play exactly one of the two legends asks (Relentless Storm yes, Grand Duelist no)", async () => {
    const asked: Record<string, boolean> = {};
    for (const legend of [GRAND_DUELIST, RELENTLESS_STORM] as const) {
      const game = await board(legend).build();
      await game.p1.play("sarge", { to: "bf1" });
      asked[legend] = legendOffered(game);
    }
    expect(asked).toEqual({ [GRAND_DUELIST]: false, [RELENTLESS_STORM]: true });
  });
});

describe("(b) played to BASE at 4, next turn Standard-Moved base → War Camp", () => {
  test("played to base it is 4 and NEITHER legend triggers (not Mighty when played; no crossing)", async () => {
    for (const legend of [GRAND_DUELIST, RELENTLESS_STORM] as const) {
      const game = await board(legend).build();
      await game.p1.play("sarge", { to: "base" });
      expect(game.state("sarge")).toMatchObject({ location: "base", might: 4 });
      expect(game.chain()).toEqual([]);
      expect(legendOffered(game)).toBe(false);
      const r = await game.settle();
      expect(r.reason).toBe("open");
      expect(game.state("legend").isExhausted).toBe(false);
    }
  });

  test("Grand Duelist: the move into War Camp takes the existing object 4 → 5 — it BECOMES Mighty (709/710) → the trigger is on the chain and offered right after the move is processed (383.2.c)", async () => {
    const { game } = await playedToBaseThenMovedIn(GRAND_DUELIST);
    expect(game.state("sarge")).toMatchObject({ location: "bf1", might: 5 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "legend", controller: P1, triggered: true })]);
    expect(legendOffered(game)).toBe(true);
    expect(game.turnPlayer()).toBe(P1);
  });

  test("Grand Duelist: accepting on the move-in exhausts the legend and channels 1 rune exhausted", async () => {
    const { game } = await playedToBaseThenMovedIn(GRAND_DUELIST);
    const before = runes(game);
    await game.p1.yes();
    await game.settle();
    expect(game.state("legend").isExhausted).toBe(true);
    expect(runes(game)).toEqual({ exhausted: before.exhausted + 1, total: before.total + 1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Relentless Storm: a move is not a play — nothing triggers on the move-in (empty chain, no prompt, legend ready) even though the unit is now Mighty", async () => {
    const { game } = await playedToBaseThenMovedIn(RELENTLESS_STORM);
    expect(game.state("sarge")).toMatchObject({ location: "bf1", might: 5 });
    expect(game.chain()).toEqual([]);
    expect(legendOffered(game)).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("legend").isExhausted).toBe(false);
  });
});

describe("(c) War Camp → base (5→4), later back to War Camp (4→5): Grand Duelist triggers AGAIN", () => {
  test("leaving War Camp drops it to 4 (no longer Mighty, no trigger); re-entering on a later turn is a fresh 4 → 5 crossing → Grand Duelist is offered a SECOND time (709 has no once-per-object memory)", async () => {
    const { game } = await playedToBaseThenMovedIn(GRAND_DUELIST);
    await game.p1.yes(); // first trigger taken (turn 4)
    await game.settle();
    let offers = 1;

    await game.advanceTurn();
    await game.advanceToTurnOf(P1); // turn 6 — legend and Sergeant readied
    expect(game.state("legend").isExhausted).toBe(false);
    await game.p1.move("sarge", "base");
    expect(game.state("sarge")).toMatchObject({ location: "base", might: 4 });
    expect(legendOffered(game)).toBe(false); // 5 → 4 is not "becomes Mighty"
    expect(game.chain()).toEqual([]);
    await game.settle();

    await game.advanceTurn();
    await game.advanceToTurnOf(P1); // turn 8
    const before = runes(game);
    await game.p1.move("sarge", "bf1");
    expect(game.state("sarge")).toMatchObject({ location: "bf1", might: 5 });
    expect(legendOffered(game)).toBe(true);
    offers += 1;
    expect(offers).toBe(2);
    await game.p1.yes();
    await game.settle();
    expect(game.state("legend").isExhausted).toBe(true);
    expect(runes(game)).toEqual({ exhausted: before.exhausted + 1, total: before.total + 1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) printed-5 Yone, Blademaster played to BASE", () => {
  test("Relentless Storm triggers (a Mighty unit was played): offered to P1; Yone is 5 in base; cost 5 + [body]", async () => {
    const game = await board(RELENTLESS_STORM).build();
    await game.p1.play("yone", { to: "base" });
    expect(game.state("yone")).toMatchObject({ location: "base", might: 5 });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { body: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "legend", triggered: true })]);
    expect(legendOffered(game)).toBe(true);
    const before = runes(game);
    await game.p1.yes();
    await game.settle();
    expect(game.state("legend").isExhausted).toBe(true);
    expect(runes(game)).toEqual({ exhausted: before.exhausted + 1, total: before.total + 1 });
  });

  test("Grand Duelist does NOT trigger — Yone entered the board at 5, its Might never changed from <5 to ≥5 (709; RiftJudge Yone ruling)", async () => {
    const game = await board(GRAND_DUELIST).build();
    await game.p1.play("yone", { to: "base" });
    expect(game.state("yone")).toMatchObject({ location: "base", might: 5 });
    expect(game.chain()).toEqual([]);
    expect(legendOffered(game)).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(legendOffered(game)).toBe(false);
    expect(game.state("legend").isExhausted).toBe(false);
    expect(runes(game)).toEqual({ exhausted: 0, total: 0 });
  });
});

describe("(e) the Might timeline the engine exposes", () => {
  test("(a) direct to War Camp: [in hand: printed 4, not a board object] → 5 in a single step — every board sample from arrival through settle is 5", async () => {
    const game = await board(GRAND_DUELIST).build();
    expect(game.state("sarge")).toMatchObject({ might: 4, zone: "hand" }); // printed value of a hand card, not a board evaluation
    const samples: number[] = [];
    await game.p1.play("sarge", { to: "bf1" });
    samples.push(game.state("sarge").might);
    await game.settle();
    samples.push(game.state("sarge").might);
    expect(samples).toEqual([5, 5]);
    expect(samples).not.toContain(4);
  });

  test("(b) via base: 4 (on board, base, turn 2) … 4 (still base, turn 4) … move … 5 — the 4 → 5 transition happens ON the board, which is exactly what keys 'becomes Mighty'", async () => {
    const { game, timeline } = await playedToBaseThenMovedIn(GRAND_DUELIST);
    expect(timeline).toEqual([4, 4, 5]);
    expect(legendOffered(game)).toBe(true);
    const { game: rs, timeline: rsTimeline } = await playedToBaseThenMovedIn(RELENTLESS_STORM);
    expect(rsTimeline).toEqual([4, 4, 5]);
    expect(legendOffered(rs)).toBe(false);
    expect(game.turnPlayer()).toBe(P1);
    expect(rs.turnPlayer()).toBe(P1);
  });
});

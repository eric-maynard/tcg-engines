/**
 * Interaction: Teemo, Scout (ogn-197-298) · Champion Unit (Teemo) · Chaos · 2 · 1 Might
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].)
 *      When you play me, give me +3 [Might] this turn."                    — P1's Chosen Champion, in the Champion Zone
 *   × Hallowed Tomb (ogn-281-298) · Battlefield
 *     "When you hold here, you may return your Chosen Champion from your trash to your Champion Zone
 *      if it is empty."                                                     — bf1, controlled by P1 (Keeper stands there)
 *   (+ Gust ogn-169-298 "[Reaction] Return a unit at a battlefield with 3 [Might] or less to its owner's hand" and
 *    Vengeance ogn-229-298 "Kill a unit." in P2's hand as the response / removal.)
 *
 * Rules: 811.1.b (Hidden works "while this card is in your hand OR in your Champion Zone, on your turn, during an
 * Open State … at a battlefield you control that doesn't already have a facedown card"), 811.1.c.1/.c.2 (Hide is not
 * a Play and opens no chain), 811.1.c.3 (playing from facedown does open a chain), 811.1.d.1 (a hidden permanent is
 * played TO its battlefield), 811.6 (gains Reaction from the next turn), 421.1 / 421.2 / 421.2.a (Hide = Discretionary
 * Action from hand or Champion Zone), 366.1 (off-board passives only work where their text says), 108.3.c.1 (return
 * to the Champion Zone only if no card is there), 108.3.d (played from there as normal), 108.3.e (CZ is public),
 * 107.3.f (facedown = private), 103.2.a.3 (Chosen Champion by name/tag), 384.2 / 385.1 (a permanent's trigger is only
 * evaluated on the board), 337.2 (permanent resolves immediately, its trigger goes on the chain), 143.4 (enters
 * exhausted), 124 (zone change → new object).
 *
 * Question:
 *   (a) P1's turn, Open State, P1 controls Hallowed Tomb (bf1, no facedown there), Teemo still in the CZ: may P1
 *       Hide Teemo straight from the CZ for [rainbow]? Chain / P2 priority? Is the CZ empty afterwards?
 *   (b) Same during a showdown / with a chain open / on P2's turn / to a battlefield P1 doesn't control / to bf1
 *       when it already has a facedown card.
 *   (c) A second Teemo, Scout in P1's TRASH or on the BOARD — hideable?
 *   (d) Next turn P2 attacks bf1; P1 flips Teemo as a Reaction for [0]: where, +3 trigger, can P2 Gust it?
 *   (e) Teemo later dies → trash; P1 holds the Tomb: does Teemo return to the (Hide-vacated) CZ? Once back,
 *       is Hide / normal play offered again, and does "When you play me" do anything while it sits there?
 *
 * Expected: (a) yes — CZ → facedown-bf1, [rainbow] paid, no chain, still P1's main-phase action, CZ empty.
 * (b) all illegal. (c) no — only hand/CZ copies are listed. (d) needs Focus/priority; played to bf1 for [0],
 * exhausted Defender, +3 trigger on the chain; P2 may Gust the 1-Might Teemo in response (→ P1's hand). (e) yes:
 * trash → CZ as a fresh 1-Might object; hide + playChampion offered again; no trigger, no +3 in the CZ.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_SCOUT = "ogn-197-298";
const HALLOWED_TOMB = "ogn-281-298";
const GUST = "ogn-169-298";
const VENGEANCE = "ogn-229-298";
const DISCIPLINE = "ogn-058-298"; // P1 spell used only to open a chain for (b)

/**
 * P1's turn 2, main phase, Open State. P1: inline Teemo legend (championTag "Teemo" → Teemo, Scout is the Chosen
 * Champion, 103.2.a.3) so no real legend text interferes; Teemo, Scout in the Champion Zone; Hallowed Tomb = bf1
 * (live text) controlled by P1 with a vanilla Keeper (2) on it; a Walker (2) in base; {2 energy, 1 rainbow}; Discipline
 * in hand (extra calm is added only where it is cast). P2: controls inert bf2 with a Guard (3); a Poker (1) in base; Gust + Vengeance in hand.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .legend(P1, { cardType: "legend", championTag: "Teemo", name: "Teemo Test Legend" }, "legend")
    .champion(P1, TEEMO_SCOUT, "teemo")
    .battlefield("bf1", { controller: P1, def: HALLOWED_TOMB, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Keeper" }, "keeper")
    .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
    .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 1, name: "Poker" }, "poker")
    .hand(P1, DISCIPLINE, "discipline")
    .hand(P2, GUST, "gust")
    .hand(P2, VENGEANCE, "vengeance");
}

/** (d) P1 hides Teemo at bf1 on turn 2; turn 3 (P2): the Poker attacks bf1 and P2 passes Focus → P1 holds Focus. */
async function pokerAttacksP1HasFocus(): Promise<Game> {
  const game = await board().build();
  await game.p1.hide("teemo", "bf1");
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.turnNumber()).toBe(3);
  await game.p2.move("poker", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** (d) …P1 flips Teemo; nobody responds; the +3 resolves; combat: Keeper 2 + Teemo 4 vs Poker 1 → Poker dies, P1 keeps bf1. */
async function teemoFlippedAndSurvivesCombat(): Promise<Game> {
  const game = await pokerAttacksP1HasFocus();
  await game.p1.reveal("teemo");
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.state("teemo").might).toBe(4);
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.zoneOf("poker")).toBe("trash");
  expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  return game;
}

/** (e) …then, in P2's main phase, P2 pays 4 + [order][order] and Vengeances Teemo → P1's trash; P2 ends the turn → P1's Beginning Phase. */
async function teemoDeadP1Begins(): Promise<Game> {
  const game = await teemoFlippedAndSurvivesCombat();
  await game.p2.do("addResources", { energy: 4, power: { order: 2 } });
  await game.p2.cast("vengeance", { targets: "teemo" });
  await game.settle();
  expect(game.zoneOf("teemo")).toBe("trash");
  expect(game.p1.champion()).toBeUndefined();
  expect(game.zoneOf("keeper")).toBe("battlefield-bf1");
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  if (game.decision()?.kind !== "yes-no") {
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
  }
  return game;
}

/** (e) …P1 accepts the Tomb's "you may" and settles into the main phase with Teemo back in the Champion Zone. */
async function teemoBackInChampionZone(): Promise<Game> {
  const game = await teemoDeadP1Begins();
  await game.p1.yes();
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.phase()).toBe("main");
  expect(game.zoneOf("teemo")).toBe("championZone");
  return game;
}

describe("(a) Hide straight from the Champion Zone", () => {
  test("setup: Teemo is P1's champion in the CZ (public, 108.3.e), has printed [Hidden], and 'hide' is on P1's main-phase menu with bf1 as the only destination", async () => {
    const game = await board().build();
    expect(game.p1.champion()).toBe("teemo");
    expect(game.state("teemo")).toMatchObject({ isHidden: false, keywords: ["Hidden"], might: 1, zone: "championZone" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("hide", "teemo")).toBe(true);
    expect(game.p1.option("hide", "teemo")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bf1"]);
  });

  test("YES: hide(teemo → bf1) moves it CZ → bf1's facedown zone, pays exactly [rainbow] (energy untouched), and the Champion Zone is now EMPTY (811.1.b, 421.1)", async () => {
    const game = await board().build();
    await game.p1.hide("teemo", "bf1");
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.state("teemo").isHidden).toBe(true);
    expect(game.p1.facedown("bf1")).toEqual(["teemo"]);
    expect(game.p1.champion()).toBeUndefined();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("Hide is a Discretionary Action, not a play: no chain opens, P2 gets no priority, P1 is still taking main-phase actions (811.1.c.1 / 811.1.c.2 / 421.2)", async () => {
    const game = await board().build();
    await game.p1.hide("teemo", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    // 'When you play me' did not trigger — nothing was played.
    expect(game.state("teemo").mightModifier).toBe(0);
  });

  test("the facedown card is PRIVATE to P2 (107.3.f): P2's view of facedown-bf1 shows one redacted card owned by P1; P1 still sees it is Teemo", async () => {
    const game = await board().build();
    await game.p1.hide("teemo", "bf1");
    expect(game.p2.view().zones["facedown-bf1"]).toEqual([{ hidden: true, index: 0, owner: P1, zone: "facedown-bf1" }]);
    expect(game.p1.view().zones["facedown-bf1"]?.map((c) => ("id" in c ? c.id : "?"))).toEqual(["teemo"]);
  });

  test("once Teemo has left the CZ the permission is gone with it: neither 'hide' nor 'playChampion' is listed any more", async () => {
    const game = await board().build();
    await game.p1.hide("teemo", "bf1");
    expect(game.p1.can("hide", "teemo")).toBe(false);
    expect(game.p1.can("playChampion")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "hide")).toBe(false);
  });
});

describe("(b) Hide needs: your turn + Open State + a battlefield you control with a free facedown slot", () => {
  test("during a SHOWDOWN (P1's Walker attacks bf2, P1 holds Focus): not offered, a forced attempt is rejected and Teemo stays in the CZ", async () => {
    const game = await board().build();
    await game.p1.move("walker", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("hide", "teemo")).toBe(false);
    const r = await game.p1.try((p) => p.hide("teemo", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("teemo")).toBe("championZone");
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("while a CHAIN is open (P1 cast Discipline and holds priority — a Closed State): not offered / rejected", async () => {
    const game = await board()
      .resources(P1, { energy: 4, power: { calm: 1, rainbow: 1 } })
      .build();
    await game.p1.cast("discipline", { targets: "keeper" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("hide", "teemo")).toBe(false);
    const r = await game.p1.try((p) => p.hide("teemo", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("teemo")).toBe("championZone");
  });

  test("on P2's TURN: P1 has no action at all in P2's open state, and even when P1 holds Focus in a showdown P2 started at bf1, hide is not offered / rejected", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.decision()).toBeNull();
    expect(game.p1.can("hide", "teemo")).toBe(false);
    await game.p2.move("poker", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("hide", "teemo")).toBe(false);
    const r = await game.p1.try((p) => p.hide("teemo", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("teemo")).toBe("championZone");
  });

  test("to a battlefield P1 does NOT control (bf2 is P2's): bf2 is never a listed destination and naming it is rejected", async () => {
    const game = await board().build();
    expect(game.p1.option("hide", "teemo")?.fields.find((f) => f.arg === "to")?.options).not.toContain("bf2");
    const r = await game.p1.try((p) => p.hide("teemo", "bf2"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("teemo")).toBe("championZone");
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("with NO controlled battlefield at all (Tomb uncontrolled, no Keeper): hide is not offered / rejected", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .legend(P1, { cardType: "legend", championTag: "Teemo", name: "Teemo Test Legend" }, "legend")
      .champion(P1, TEEMO_SCOUT, "teemo")
      .battlefield("bf1", { controller: null, def: HALLOWED_TOMB, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
      .build();
    expect(game.p1.can("hide", "teemo")).toBe(false);
    const r = await game.p1.try((p) => p.hide("teemo", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("teemo")).toBe("championZone");
  });

  test("bf1 ALREADY has a facedown card of P1's: the only controlled battlefield has no free slot → hide is not offered / rejected (811.1.b 'doesn't already have a facedown card')", async () => {
    const game = await board().facedown(P1, "bf1", GUST, "alreadyThere").build();
    expect(game.p1.facedown("bf1")).toEqual(["alreadyThere"]);
    expect(game.p1.can("hide", "teemo")).toBe(false);
    const r = await game.p1.try((p) => p.hide("teemo", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("teemo")).toBe("championZone");
    expect(game.p1.facedown("bf1")).toEqual(["alreadyThere"]);
  });
});

describe("(c) only hand / Champion Zone copies can be hidden (366.1)", () => {
  test("a second Teemo, Scout in P1's TRASH and a third on the BOARD are not hideable; the CZ copy and a HAND copy are — exactly those two are listed", async () => {
    const game = await board().trash(P1, TEEMO_SCOUT, "teemoTrash").unit(P1, "base", TEEMO_SCOUT, "teemoBoard").hand(P1, TEEMO_SCOUT, "teemoHand").build();
    const hideable = game.p1
      .legal()
      .filter((o) => o.verb === "hide")
      .map((o) => o.card)
      .sort();
    expect(hideable).toEqual(["teemo", "teemoHand"]);
    expect(game.p1.can("hide", "teemoTrash")).toBe(false);
    expect(game.p1.can("hide", "teemoBoard")).toBe(false);
    const r1 = await game.p1.try((p) => p.hide("teemoTrash", "bf1"));
    expect(r1.ok).toBe(false);
    expect(game.zoneOf("teemoTrash")).toBe("trash");
    const r2 = await game.p1.try((p) => p.hide("teemoBoard", "bf1"));
    expect(r2.ok).toBe(false);
    expect(game.zoneOf("teemoBoard")).toBe("base");
    expect(game.p1.power("rainbow")).toBe(1);
  });
});

describe("(d) next turn P2 attacks bf1 and P1 flips the hidden Teemo", () => {
  test("timing: on the SAME turn it was hidden it cannot be flipped even with Focus; on P2's turn 3, while P2 still holds Focus with an empty chain P1 cannot act; once P2 passes Focus, 'reveal Teemo' is offered (811.1.b / 811.6)", async () => {
    const sameTurn = await board().build();
    await sameTurn.p1.hide("teemo", "bf1");
    await sameTurn.p1.move("walker", "bf2");
    expect(sameTurn.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(sameTurn.p1.can("reveal", "teemo")).toBe(false);

    const game = await board().build();
    await game.p1.hide("teemo", "bf1");
    await game.advanceTurn();
    await game.p2.move("poker", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("reveal", "teemo")).toBe(false);
    expect(game.p1.legal()).toEqual([]);
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "teemo")).toBe(true);
    // No location choice: a hidden permanent must be played to ITS battlefield (811.1.d.1).
    const to = game.p1.option("reveal", "teemo")?.fields.find((f) => f.arg === "to");
    expect(to === undefined || (to.options ?? []).every((v) => v === "bf1" || v === "battlefield-bf1")).toBe(true);
  });

  test("the flip costs [0] and plays Teemo TO bf1: on the board there, no longer hidden, EXHAUSTED (143.4), a DEFENDER, 1 Might for now; the play opened a chain holding its '+3 Might' trigger with P1 on priority (811.1.c.3, 337.2)", async () => {
    const game = await pokerAttacksP1HasFocus();
    const pool = game.p1.resources();
    await game.p1.reveal("teemo");
    expect(game.p1.resources()).toEqual(pool);
    expect(game.state("teemo")).toMatchObject({
      combatRole: "defender",
      controller: P1,
      isExhausted: true,
      isHidden: false,
      location: "bf1",
      might: 1,
      zone: "battlefield-bf1",
    });
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.p1.units("bf1").sort()).toEqual(["keeper", "teemo"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("P2 MAY respond: after P1 passes priority, P2's Gust lists Teemo (1 Might ≤ 3, at a battlefield) — cast it and it sits above the +3 trigger", async () => {
    const game = await pokerAttacksP1HasFocus();
    await game.p1.reveal("teemo");
    expect(game.p2.legal()).toEqual([]); // P1 holds priority first
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.do("addResources", { energy: 1 });
    const offered = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("teemo");
    await game.p2.cast("gust", { targets: "teemo" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "teemo", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "gust", controller: P2, targets: ["teemo"], triggered: false }),
    ]);
  });

  test("Gust resolves first: Teemo (still 1 Might) goes to its OWNER's (P1's) hand before the +3 ever applies; the trigger then does nothing; combat Keeper 2 vs Poker 1 → Poker dies, P1 keeps bf1", async () => {
    const game = await pokerAttacksP1HasFocus();
    const p2Points = game.p2.points(); // P2 already scored its hold of bf2 this turn
    await game.p1.reveal("teemo");
    await game.p1.passPriority();
    await game.p2.do("addResources", { energy: 1 });
    await game.p2.cast("gust", { targets: "teemo" });
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p1.hand()).toContain("teemo");
    expect(game.state("teemo")).toMatchObject({ might: 1, mightModifier: 0, zone: "hand" });
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(p2Points); // no conquer
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("no response: the trigger resolves → Teemo is 1 + 3 = 4 this turn, still an exhausted Defender at bf1; then combat 2 + 4 vs 1 kills the Poker and P1 keeps the Tomb", async () => {
    const game = await pokerAttacksP1HasFocus();
    await game.p1.reveal("teemo");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("teemo")).toMatchObject({ combatRole: "defender", isExhausted: true, location: "bf1", might: 4, mightModifier: 3 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.state("teemo")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
  });
});

describe("(e) Teemo dies; Hallowed Tomb returns it to the Hide-vacated Champion Zone", () => {
  test("P2 Vengeances the flipped Teemo in P2's main phase: Teemo → P1's trash as a plain 1-Might card (124), CZ still empty, Keeper still holds bf1 for P1", async () => {
    const game = await teemoFlippedAndSurvivesCombat();
    await game.p2.do("addResources", { energy: 4, power: { order: 2 } });
    await game.p2.cast("vengeance", { targets: "teemo" });
    await game.settle();
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.p1.trash()).toContain("teemo");
    expect(game.state("teemo")).toMatchObject({ might: 1, mightModifier: 0, zone: "trash" });
    expect(game.p1.champion()).toBeUndefined();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("P2 ends the turn → P1's Beginning Phase: P1 HOLDS the Tomb (+1 point) and its optional trigger asks P1 yes/no — the CZ counts as 'empty' regardless of how it was vacated (108.3.c.1)", async () => {
    const game = await teemoDeadP1Begins();
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "bf1" } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, triggered: true })]);
    expect(game.p1.champion()).toBeUndefined();
    expect(game.zoneOf("teemo")).toBe("trash");
  });

  test("YES → Teemo (the Chosen Champion by tag, 103.2.a.3) moves trash → Champion Zone as a fresh object: 1 Might, no modifier, not hidden, not exhausted (124)", async () => {
    const game = await teemoBackInChampionZone();
    expect(game.p1.champion()).toBe("teemo");
    expect(game.p1.trash()).not.toContain("teemo");
    expect(game.state("teemo")).toMatchObject({ damage: 0, isExhausted: false, isHidden: false, might: 1, mightModifier: 0, zone: "championZone" });
    expect(game.violations()).toEqual([]);
  });

  test("declining instead leaves Teemo in the trash and the CZ empty (it is a 'you may')", async () => {
    const game = await teemoDeadP1Begins();
    await game.p1.no();
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.p1.champion()).toBeUndefined();
  });

  test("back in the CZ, 'When you play me' does NOTHING there: no chain item, no +3 — a permanent's trigger is only evaluated on the board (384.2), public zone or not (108.3.e / 385.1)", async () => {
    const game = await teemoBackInChampionZone();
    expect(game.chain()).toEqual([]);
    expect(game.state("teemo")).toMatchObject({ might: 1, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("and both permissions are live again once P1 can pay: with {2, rainbow:1} P1 is offered 'playChampion' (108.3.d) AND 'hide Teemo' → bf1 (811.1.b); hiding a second time works exactly as before", async () => {
    const game = await teemoBackInChampionZone();
    // Pools emptied at end of turn; before adding resources neither paid option is listed.
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("hide", "teemo")).toBe(false);
    await game.p1.do("addResources", { energy: 2, power: { rainbow: 1 } });
    expect(game.p1.can("playChampion")).toBe(true);
    expect(game.p1.can("hide", "teemo")).toBe(true);
    expect(game.p1.option("hide", "teemo")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bf1"]);
    await game.p1.hide("teemo", "bf1");
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("or played normally from the CZ for its full cost (2): Teemo enters base exhausted and NOW 'When you play me' triggers → 4 Might this turn", async () => {
    const game = await teemoBackInChampionZone();
    await game.p1.do("addResources", { energy: 2 });
    await game.p1.playChampion("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("teemo")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("teemo")).toMatchObject({ isExhausted: true, might: 4, mightModifier: 3, zone: "base" });
    expect(game.p1.champion()).toBeUndefined();
  });
});

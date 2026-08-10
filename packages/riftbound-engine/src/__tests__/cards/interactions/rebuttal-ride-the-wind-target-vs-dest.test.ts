/**
 * Interaction: Rebuttal (ven-152-166) × Ride the Wind (ogn-173-298)
 *
 *   Rebuttal — Spell (Reaction) · Mind/Chaos · 1 + [C]
 *     "Choose a spell with Energy cost no more than [4]. You may pay [rainbow]. If you do, gain control
 *      of it and you may make new choices for it. Otherwise, counter it."
 *   Ride the Wind — Spell (Action) · Chaos · 2 + [chaos]
 *     "Move a friendly unit and ready it."
 *
 * Rules: 355.4 / 355.4.a (a Move effect's DESTINATION is a finalization choice: any location other than
 * the mover's current one where it may be), 355.5 (the target is a finalization choice), 752.1 (the
 * re-makeable choices are "locations to be played to, modes, DESTINATIONS, and TARGETS"), 753 / 753.1
 * (any subset may be re-made, validated jointly), 359.3.e.5 (illegal target → its instructions are not
 * followed), 359.3.f.4 ("friendly" is read relative to the item's controller at resolution).
 *
 * Question: P1's turn, Neutral Open. P1: A in base. P2: Y in base, Z at bf1 (P2's). bf2 empty/uncontrolled.
 * P1 casts Ride the Wind on A with destination bf1. P2 Rebuttals, pays [rainbow], gains control.
 *   (a) Does the new-choices Decision expose BOTH slots — target and destination — independently?
 *   (b) P2 re-targets to Y, keeps bf1: legal? outcome?
 *   (c) P2 re-targets to Y AND re-routes to bf2: outcome once the chain empties?
 *   (d) P2 keeps everything: does A still move / ready?
 * Expected: (a) yes — two slots: target {A → Y | Z}, destination {bf1 → any other legal location}.
 * (b) legal; Y moves base→bf1 next to Z (own battlefield, no showdown) and is readied. (c) Y → bf2
 * readied; bf2 becomes contested by P2 alone → non-combat showdown → P2 conquers bf2. (d) A is not
 * friendly to P2 → mistarget: no move, no ready. Always: Ride the Wind → P1's trash, P1's 2+[chaos] spent.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REBUTTAL = "ven-152-166";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P1's turn. P1: A (3, exhausted) in base, exactly 2 + [chaos]. P2: Y (2, exhausted) in base, Z (2) at
 * P2's bf1; exactly 1 + [chaos] + [rainbow]. bf2 uncontrolled and empty.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 1, power: { chaos: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 3, name: "Unit A" }, "a", { exhausted: true })
    .unit(P2, "base", { might: 2, name: "Unit Y" }, "y", { exhausted: true })
    .unit(P2, "bf1", { might: 2, name: "Unit Z" }, "z")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P2, REBUTTAL, "reb");
}

/** P1 casts Ride the Wind on A → bf1 (an attack). Chain: [rtw]; P1 holds priority. */
async function rideCast(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("rtw", { targets: "a" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
  await game.p1.pick("battlefield-bf1");
  return game;
}

/** …P1 passes, P2 Rebuttals it, both pass → Rebuttal resolves and P2 accepts the [rainbow]. */
async function stolen(): Promise<Game> {
  const game = await rideCast();
  await game.p1.passPriority();
  await game.p2.cast("reb", { targets: "rtw" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["rtw", "reb"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2, source: { cardId: "reb" } });
  await game.p2.yes();
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P2, countered: false })]);
  return game;
}

function isP2Choice(d: Decision | null): d is PickDecision {
  return d?.kind === "pick" && d.seat === P2;
}

/** Pass priority around until the chain is empty (stops at any non-action prompt). */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
    await game.acting().passPriority();
  }
}

function expectSpentAndTrashed(game: Game): void {
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.p1.trash()).toContain("rtw"); // owner's trash (359.3.d)
  expect(game.p2.trash()).toEqual(["reb"]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
}

describe("Rebuttal × Ride the Wind — re-choosing the target vs the move destination", () => {
  test("premise: Ride the Wind asks its Move Destination at FINALIZATION (355.4) — locations other than A's current one (bf1, bf2; not base, 355.4.a) — and only then does anyone get priority", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "a" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
    expect((d as PickDecision).options.map((o) => o.zone ?? o.key).sort()).toEqual(["battlefield-bf1", "battlefield-bf2"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.p1.pick("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p2.view().chain).toEqual([expect.objectContaining({ cardId: "rtw", controller: P1, targets: ["a"] })]);
  });

  test("(a) after paying, P2 is offered a new TARGET: exactly P2's own units Y and Z ('friendly' is now relative to P2), never A; the offer is optional ('you may')", async () => {
    const game = await stolen();
    const d = game.decision();
    expect(isP2Choice(d)).toBe(true);
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P2, semantics: "target", source: { cardId: "rtw" } });
    expect((d as PickDecision).options.map((o) => o.card ?? o.key).sort()).toEqual(["y", "z"]);
  });

  // Expected (752.1, 753): destinations are re-makeable just like targets, so P2 must ALSO be shown a
  // destination slot (current bf1 → alternatives per 355.4.a) — before or after the target slot.
  // Actual: only the target slot is offered; the destination bf1 is silently kept.
  test("(a) the new-choices Decision must also expose the Move DESTINATION as a re-choosable slot (752.1 'destinations', 753)", async () => {
    const game = await stolen();
    const seen: string[] = [];
    for (let i = 0; i < 4 && isP2Choice(game.decision()); i++) {
      const d = game.decision() as PickDecision;
      seen.push(d.semantics ?? "?");
      if (d.semantics === "target") {
        await game.p2.pick("y");
      } else if (d.semantics === "destination") {
        expect(d.options.map((o) => o.zone ?? o.key)).toContain("battlefield-bf2");
        await game.p2.pick("battlefield-bf2");
      } else {
        await game.p2.decline();
      }
    }
    expect(seen).toContain("target");
    expect(seen).toContain("destination");
  });

  test("(b) P2 changes only the target to Y (keeps bf1): legal — the chain item now shows Y; on resolution Y moves base → bf1 beside Z and is READIED; own battlefield, so no showdown; A untouched", async () => {
    const game = await stolen();
    await game.p2.pick("y");
    // If the engine ever offers the destination slot too, keep bf1.
    if (isP2Choice(game.decision()) && (game.decision() as PickDecision).semantics === "destination") {
      const d = game.decision() as PickDecision;
      await (d.allowDecline ? game.p2.decline() : game.p2.pick("battlefield-bf1"));
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P2, targets: ["y"] })]);
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("y")).toBe("bf1");
    expect(game.state("y").isReady).toBe(true);
    expect(game.p2.units("bf1").sort()).toEqual(["y", "z"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.state("a")).toMatchObject({ controller: P1, isExhausted: true, location: "base" });
    // Back to P1's quiet main phase — nothing staged.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expectSpentAndTrashed(game);
    expect(game.p2.points()).toBe(0);
  });

  // Expected (752.1 + 753.1 validated jointly): target Y + destination bf2 is a legal pair; Y lands at bf2
  // readied; once the chain is empty bf2 (uncontrolled) is contested by P2 alone → non-combat showdown;
  // nobody acts → P2 conquers bf2 on P1's turn (+1). Actual: no destination slot is ever offered, so Y
  // can only go to the kept bf1.
  test("(c) target → Y AND destination → bf2: Y readied at bf2; chain empties → showdown at bf2; all pass → P2 conquers bf2 (+1) on P1's turn", async () => {
    const game = await stolen();
    for (let i = 0; i < 4 && isP2Choice(game.decision()); i++) {
      const d = game.decision() as PickDecision;
      if (d.semantics === "target") {
        await game.p2.pick("y");
      } else {
        expect(d.semantics).toBe("destination");
        await game.p2.pick("battlefield-bf2");
      }
    }
    await resolveChain(game);
    expect(game.locationOf("y")).toBe("bf2");
    expect(game.state("y").isReady).toBe(true);
    expect(game.gameState.battlefields.bf2?.contested).toBe(true);
    // rule 344.2 — settle() hands a Cleanup-begun non-combat showdown back once so it can be
    // observed; settling again passes Focus for both seats and closes it.
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.locationOf("z")).toBe("bf1");
    expect(game.state("a")).toMatchObject({ isExhausted: true, location: "base" });
    expectSpentAndTrashed(game);
  });

  test("(d) P2 pays but makes NO new choices: A is not friendly to controller P2 at resolution → mistarget; A neither moves nor readies (359.3.e.5, 359.3.f.4); nothing else moves", async () => {
    const game = await stolen();
    await game.p2.decline();
    while (isP2Choice(game.decision())) {
      await game.p2.decline();
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P2, targets: ["a"] })]);
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("a")).toMatchObject({ controller: P1, isExhausted: true, location: "base" });
    expect(game.state("y")).toMatchObject({ isExhausted: true, location: "base" });
    expect(game.locationOf("z")).toBe("bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expectSpentAndTrashed(game);
    expect(game.violations()).toEqual([]);
  });

  test("(d′) the destination is NOT re-asked at resolution in any branch — it was locked at finalization (355.4), so after the kept-choices line resolves nobody is prompted for a location", async () => {
    const game = await stolen();
    await game.p2.decline();
    await resolveChain(game);
    // Straight back to P1's main phase: no stray destination prompt for either seat.
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d).toMatchObject({ context: "main", seat: P1 });
  });

  test("control: un-rebutted, Ride the Wind resolves for P1 — A moves base → bf1 readied, combat vs Z is staged and fought (3 v 2): Z dies, A conquers bf1 for P1", async () => {
    const game = await rideCast();
    await resolveChain(game);
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.state("a").isReady).toBe(true);
    await game.settle();
    expect(game.zoneOf("z")).toBe("trash");
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.trash()).toContain("rtw");
  });
});

/**
 * Ruling 741d1ecb4ed11823 — Teemo, Scout (OGN-197 → ogn-197-298) · Champion Unit · 1 Might
 *     "[Hidden] When you play me, give me +3 [Might] this turn."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction [1] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Void Seeker (OGN-024 → ogn-024-298) · Action [3] "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: After Teemo is revealed from hidden but before the chain resolves, can the opponent target him with a
 *    reaction spell/ability?
 * A: Yes. Playing Teemo from hidden starts a chain (his on-play trigger); opponents may respond with
 *    REACTIONS (e.g. Gust, which then resolves first and bounces the still-1-Might Teemo) but not with
 *    ACTIONS (Void Seeker) — actions need their own turn / an open showdown, never an open chain.
 * Rules: 811 (play from Hidden gains Reaction timing), 309.1.a (Closed state: Reactions only), 336–340 (LIFO),
 *        347 (Actions playable by the Focus holder in an OPEN showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO_SCOUT = "ogn-197-298";
const GUST = "ogn-169-298";
const VOID_SEEKER = "ogn-024-298";

/** Turn 3. P1 holds bf1 (Holder 3) with Teemo facedown there since an earlier turn. P2: Gust + Void Seeker, [4]+[fury] (enough for either). */
function board(active = P1) {
  return scenario()
    .turn(3)
    .active(active)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .facedown(P1, "bf1", TEEMO_SCOUT, "teemo")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, GUST, "gust")
    .hand(P2, VOID_SEEKER, "seeker")
    .resources(P2, { energy: 4, power: { fury: 1 } });
}

async function revealTeemo(game: Game): Promise<void> {
  expect(game.p1.can("reveal", "teemo")).toBe(true);
  await game.p1.reveal("teemo");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("teemo");
  }
  expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
  expect(game.state("teemo")).toMatchObject({ isHidden: false, might: 1 });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, triggered: true })]);
}

describe("Ruling 741d1ecb4ed11823 — opponents may answer a revealed Teemo with Reactions, not Actions", () => {
  test("P1's turn: revealing Teemo starts a chain (his +3 trigger); when priority reaches P2, Gust (Reaction) is legal on Teemo but Void Seeker (Action) is NOT, despite P2 affording both", async () => {
    const game = await board().build();
    await revealTeemo(game);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.energy()).toBe(4);
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(game.p2.can("cast", "seeker")).toBe(false);
    const r = await game.p2.try((p) => p.cast("seeker", { targets: "teemo" }));
    expect(r.ok).toBe(false);
    const gustTargets = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
    expect(gustTargets?.options).toEqual(expect.arrayContaining([["teemo"]]));
  });

  test("P1's turn: P2's Gust lands above the trigger and resolves first — Teemo (still 1 Might) returns to hand before his +3 completes; the trigger then does nothing", async () => {
    const game = await board().build();
    await revealTeemo(game);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    await game.p2.cast("gust", { targets: "teemo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["teemo", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.state("teemo")).toMatchObject({ might: 1, mightModifier: 0 });
    expect(game.zoneOf("seeker")).toBe("hand"); // never castable in that window
    expect(game.violations()).toEqual([]);
  });

  test("P2's turn, in a showdown at bf1: with the chain EMPTY and Focus, P2 could cast Void Seeker; once P1 reveals Teemo as a reaction (chain open) only Gust remains legal for P2", async () => {
    const game = await board(P2).build();
    await game.p2.move("raider", "bf1"); // combat showdown at bf1, P2 attacker with Focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "seeker")).toBe(true); // open showdown + Focus → Actions OK
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await revealTeemo(game);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(game.p2.can("cast", "seeker")).toBe(false); // chain open → Reactions only, even mid-showdown
    await game.p2.cast("gust", { targets: "teemo" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.state("teemo").might).toBe(1);
  });
});

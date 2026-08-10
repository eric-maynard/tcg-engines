/**
 * Ruling 84796423b38902f5 — Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] · "Counter a spell that costs no more than [4] and no
 *   more than [rainbow]."   × Void Seeker (OGN-024 → ogn-024-298) · Action · [3][fury] · "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction · [2] · "Give a unit +2 [Might] this turn. Draw 1."   × Kai'Sa legend Daughter of
 *   the Void (ogn-247-298) "[Exhaust]: [Reaction] — [Add] [rainbow]. (Abilities that add resources can't be reacted to.)"
 *
 * Q: Player A plays an Action, then "reacts" to it with an un-reactable [Add] ability (Kai'Sa / a Seal). Does that force an
 *    immediate resolution so B can't Defy/Discipline in response? Does A keep priority for another action?
 * A: No. An [Add] ability resolves at once and does not change priority at all: the next player still receives priority and may
 *    respond (e.g. Discipline); that resolves (draw), priority goes round again, and only then does the original Action resolve.
 * Rules: 429.3 / [Add] abilities resolve immediately off-chain, 338–340 (priority passes after each play/resolution; LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const VOID_SEEKER = "ogn-024-298";
const DISCIPLINE = "ogn-058-298";
const DAUGHTER_OF_THE_VOID = "ogn-247-298";

/**
 * P1's turn 3 (Kai'Sa legend, ready). P2 holds bf1 with a 5-Might Wall; P2: Discipline + Defy, [3] + [calm]. P1: Void Seeker with
 * exactly [3][fury]. Known deck tops for both.
 */
function board() {
  return scenario()
    .turn(3)
    .legend(P1, DAUGHTER_OF_THE_VOID, "kaisa")
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P2, DISCIPLINE, "disc")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["a1", "a2"])
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["b1", "b2"]);
}

/** P1 casts Void Seeker at the Wall, then (still holding priority) fires Kai'Sa's [Add]. */
async function seekerThenAdd(game: Game): Promise<void> {
  await game.p1.cast("vs", { targets: "wall" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // caster holds priority first
  expect(game.p1.can("activate", "kaisa")).toBe(true); // Reaction-speed [Add]
  await game.p1.activate("kaisa");
}

describe("Ruling 84796423b38902f5 — an [Add] ability after your own Action changes nothing about priority", () => {
  test("the [Add] resolves instantly OFF the chain (legend exhausted, +1 [rainbow]) — the chain is still just Void Seeker and priority is STILL P1's (not advanced, not reset)", async () => {
    const game = await board().build();
    await seekerThenAdd(game);
    expect(game.state("kaisa").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, rainbow: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("wall").damage).toBe(0); // nothing resolved "all at once"
  });

  test("P1 passes → P2 receives priority and CAN respond: Discipline on the Wall goes on top; it resolves first (Wall 7, P2 draws b1) while Void Seeker still waits", async () => {
    const game = await board().build();
    await seekerThenAdd(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(true);
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("disc", { targets: "wall" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "disc"]);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "disc"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("wall").might).toBe(7);
    expect(game.p2.hand().toSorted()).toEqual(["b1", "defy"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs"]); // a fresh priority round before the next item
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.state("wall").damage).toBe(0);
  });

  test("… priority passes around again and only then does Void Seeker resolve: 4 to the (now 7-Might) Wall, which survives, and P1 draws a1", async () => {
    const game = await board().build();
    await seekerThenAdd(game);
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "wall" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("wall")).toMatchObject({ damage: 4, might: 7, zone: "battlefield-bf1" });
    expect(game.p1.hand()).toEqual(["a1"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the Defy line: P2 may equally answer with Defy (Void Seeker = [3] + one power) — it counters the Seeker: no damage, no draw for P1", async () => {
    const game = await board().build();
    await seekerThenAdd(game);
    await game.p1.passPriority();
    const offered = (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["vs"]);
    await game.p2.cast("defy", { targets: "vs" });
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("wall").damage).toBe(0);
    expect(game.p1.hand()).toEqual([]);
  });
});

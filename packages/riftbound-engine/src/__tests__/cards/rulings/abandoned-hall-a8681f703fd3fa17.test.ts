/**
 * Ruling a8681f703fd3fa17 — Abandoned Hall (UNL-205 → unl-205-219, Battlefield)
 *   "When a player plays a spell, they may give a unit they control here +1 [Might] this turn."
 *   × Ride the Wind (ogn-173-298, Action spell) "Move a friendly unit and ready it."
 *
 * Q: Can a unit moved INTO or AWAY FROM Abandoned Hall by a spell be chosen for the +1?
 * A: Only if it is at Abandoned Hall after the spell fully resolves. A spell is "played" only once
 *    it has finished resolving (350.1, 419.4.a), so the Hall's trigger fires after the move — a unit
 *    moved in is choosable; a unit moved away no longer is "a unit they control here" (383.2.c).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ABANDONED_HALL = "unl-205-219";
const RIDE_THE_WIND = "ogn-173-298";

/** P1 controls the Hall where a 2-Might "resident" already sits; "ally" starts at `allyAt`. */
function board(allyAt: "base" | "hall") {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("hall", { controller: P1, def: ABANDONED_HALL, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, allyAt, { might: 3, name: "Ally" }, "ally")
    .unit(P1, "hall", { might: 2, name: "Resident" }, "resident")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

function hallTriggers(game: Game): number {
  return game.chain().filter((i) => i.cardId === "hall" && i.triggered).length;
}

/**
 * Cast Ride the Wind on ally, let it resolve and move ally to `dest`. Asserts the intermediate fact the
 * ruling relies on: while the spell merely sits on the chain the Hall has NOT triggered (419.4.a); it
 * triggers only once the spell has resolved (ally already at its destination, spell in trash).
 */
async function rideTheWindTo(game: Game, dest: "hall" | "bf2"): Promise<void> {
  await game.p1.cast("rtw", { targets: "ally" });
  expect(game.zoneOf("rtw")).toBe("chain");
  expect(hallTriggers(game)).toBe(0);
  // rule 355.4 — the destination is named as the spell is played, before anyone gets priority.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
  await game.p1.pick(`battlefield-${dest}`);
  expect(hallTriggers(game)).toBe(0); // still only on the chain (419.4.a)
  await game.p1.passPriority();
  await game.p2.passPriority(); // RTW resolves → the move happens
  expect(game.locationOf("ally")).toBe(dest);
  expect(game.zoneOf("rtw")).toBe("trash");
  // The spell has now been "played" → exactly one Hall trigger is on the chain.
  expect(hallTriggers(game)).toBe(1);
}

/** Pass priority on the Hall trigger, opt in, and return the units offered for the +1. */
async function optInAndOffered(game: Game): Promise<string[]> {
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

describe("Ruling a8681f703fd3fa17 — Abandoned Hall sees the board AFTER the spell resolves", () => {
  test("moved INTO the Hall by the spell: the arriving unit is 'a unit they control here' and can take the +1", async () => {
    const game = await board("base").build();
    await rideTheWindTo(game, "hall");
    const offered = await optInAndOffered(game);
    expect(offered.sort()).toEqual(["ally", "resident"]);
    expect(offered).not.toContain("bystander");
    await game.p1.pick("ally");
    await game.settle();

    expect(game.state("ally").might).toBe(4);
    expect(game.state("resident").might).toBe(2);
    expect(game.chain()).toEqual([]);
    // rule 344.2 — settle() hands the Cleanup-begun showdown back once before passing Focus.
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("moved AWAY from the Hall by the spell: the departed unit is no longer here and is NOT offered (only the resident is)", async () => {
    const game = await board("hall").build();
    await rideTheWindTo(game, "bf2");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    // With ally gone the resident is the ONLY legal recipient: either the engine auto-applies the
    // single target, or it prompts with exactly ["resident"]. Ally must never be offered.
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.seat).toBe(P1);
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["resident"]);
      await game.p1.pick("resident");
    }
    await game.settle();

    expect(game.state("ally").might).toBe(3);
    expect(game.state("resident").might).toBe(3); // 2 + 1
    expect(game.chain()).toEqual([]);
    // rule 344.2 — settle() hands the Cleanup-begun showdown back once before passing Focus.
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("moved AWAY and it was P1's ONLY unit at the Hall: nothing qualifies — ally cannot get the +1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("hall", { controller: P1, def: ABANDONED_HALL, inert: false })
      .battlefield("bf2", { controller: null })
      .unit(P1, "hall", { might: 3, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.cast("rtw", { answers: ["battlefield-bf2"], targets: "ally" }); // 355.4: destination at play
    expect(hallTriggers(game)).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("ally")).toBe("bf2");

    // Whatever the Hall still asks, the departed ally must never be a legal choice.
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered" || !r.decision) {
        break;
      }
      const d = r.decision;
      expect(d.seat).toBe(P1);
      if (d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d.kind === "pick") {
        expect(d.options.map((o) => o.card ?? o.key)).not.toContain("ally");
        expect(d.options).toHaveLength(0);
        await game.p1.decline();
      } else {
        break;
      }
    }
    expect(game.state("ally").might).toBe(3);
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.chain()).toEqual([]);
    // rule 344.2 — settle() hands the Cleanup-begun showdown back once before passing Focus.
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the +1 lasts only this turn", async () => {
    const game = await board("base").build();
    await rideTheWindTo(game, "hall");
    await optInAndOffered(game);
    await game.p1.pick("ally");
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(3);
  });
});

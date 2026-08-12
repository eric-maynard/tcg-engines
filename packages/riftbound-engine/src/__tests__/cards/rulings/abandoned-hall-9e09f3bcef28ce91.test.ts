/**
 * Ruling 9e09f3bcef28ce91 — Abandoned Hall (UNL-205 → unl-205-219, Battlefield)
 *   "When a player plays a spell, they may give a unit they control here +1 [Might] this turn."
 *   × Ride the Wind (OGN-173 → ogn-173-298) "[Action] Move a friendly unit and ready it."
 *
 * Q: If a spell MOVES my unit off that battlefield, does the unit still get the battlefield's buff?
 * A: No. Under the Unleashed rules "play" in a triggered ability means the spell has FINISHED
 *    RESOLVING, so the trigger goes on the chain after the move; when it resolves the unit is not
 *    "here" any more. Nuance: a unit moved TO the battlefield IS there and can be chosen. (Passive
 *    abilities that check "play" evaluate at finalization instead.)
 * Rules: 350.1 / 419.4.a (a card is played when its play completes with resolution), 383.2.c
 *    (a trigger's choices see the board as it resolves), 355.4 (move destination named at play).
 * Same question as sibling ruling a8681f703fd3fa17 — this file asserts it independently.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ABANDONED_HALL = "unl-205-219";
const RIDE_THE_WIND = "ogn-173-298";

/** P1 controls the Hall; a 2-Might "resident" always sits there. "ally" starts wherever the case needs. */
function board(allyAt: "base" | "hall") {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("hall", { controller: P1, def: ABANDONED_HALL, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, allyAt, { might: 3, name: "Ally" }, "ally")
    .unit(P1, "hall", { might: 2, name: "Resident" }, "resident")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const hallTriggers = (game: Game) => game.chain().filter((i) => i.cardId === "hall" && i.triggered).length;

/** Cast Ride the Wind on ally with the given destination and let it resolve. */
async function rideTo(game: Game, dest: "hall" | "bf2"): Promise<void> {
  await game.p1.cast("rtw", { answers: [`battlefield-${dest}`], targets: "ally" });
  // Intermediate fact the ruling turns on: while the spell is only ON the chain, nothing has triggered.
  expect(game.zoneOf("rtw")).toBe("chain");
  expect(hallTriggers(game)).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("ally")).toBe(dest);
  // Only NOW is the spell "played" — the Hall trigger appears after the move already happened.
  expect(hallTriggers(game)).toBe(1);
}

describe("Ruling 9e09f3bcef28ce91 — a unit a spell moved AWAY is gone before the play-trigger resolves", () => {
  test("moved away: the departed unit is not offered for the +1; only the unit still there is", async () => {
    const game = await board("hall").build();
    await rideTo(game, "bf2");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["resident"]);
      expect(d.options.map((o) => o.card ?? o.key)).not.toContain("ally");
      await game.p1.pick("resident");
    }
    await game.settle();
    expect(game.state("ally").might).toBe(3); // no buff — it left
    expect(game.state("resident").might).toBe(3);
  });

  test("moved away and it was the only unit there: the trigger has no legal recipient at all", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("hall", { controller: P1, def: ABANDONED_HALL, inert: false })
      .battlefield("bf2", { controller: null })
      .unit(P1, "hall", { might: 3, name: "Ally" }, "ally")
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.cast("rtw", { answers: ["battlefield-bf2"], targets: "ally" });
    expect(hallTriggers(game)).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("ally")).toBe("bf2");
    // The spell is played, but the ally is gone: with no "unit they control here" the Hall's item is
    // removed from the chain rather than offering the departed unit (rule 402.4).
    expect(hallTriggers(game)).toBe(0);
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered" || !r.decision) {
        break;
      }
      const d = r.decision;
      if (d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d.kind === "pick") {
        expect(d.options.map((o) => o.card ?? o.key)).not.toContain("ally");
        await game.p1.decline();
      } else {
        break;
      }
    }
    expect(game.state("ally").might).toBe(3);
    expect(game.chain()).toEqual([]);
  });

  test("nuance — moved TO the battlefield instead: the arriving unit IS here and may take the +1", async () => {
    const game = await board("base").build();
    await rideTo(game, "hall");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    if (d?.kind === "pick") {
      expect((d.options.map((o) => o.card ?? o.key) as string[]).slice().sort()).toEqual(["ally", "resident"]);
      await game.p1.pick("ally");
    }
    await game.settle();
    expect(game.state("ally").might).toBe(4);
  });

  test("the +1 that was granted is a 'this turn' effect and expires", async () => {
    const game = await board("base").build();
    await rideTo(game, "hall");
    await game.settle();
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
    }
    await game.settle();
    expect(game.state("ally").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});

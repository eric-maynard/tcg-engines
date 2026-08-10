/**
 * Ruling a313e60f11b98cc9 — Ride the Wind (OGN-173 → ogn-173-298) · [Action] · [2][chaos] · "Move a friendly unit and ready it."
 *   × Abandoned Hall (UNL-205 → unl-205-219, battlefield) "When a player plays a spell, they may give a unit they control here
 *     +1 [Might] this turn."
 *
 * Q: If I cast Ride the Wind and move a unit to Abandoned Hall, does that unit get the +1?
 * A: Yes. Ride the Wind resolves (unit moved and readied) and only after its resolution completes does the Hall's "plays a
 *    spell" trigger go on the chain — the unit is already at the Hall and is a valid recipient of the +1.
 * Rules: 419.4.a (a spell is "played" once it resolves), 383.2.c (trigger evaluated then), 359.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const ABANDONED_HALL = "unl-205-219";

/** P1's turn with exactly [2][chaos]. P1 controls the live Hall via a Keeper (2) there (bf2 is empty); the exhausted Rider (3) is in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("hall", { controller: P1, def: ABANDONED_HALL, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P1, "hall", { might: 2, name: "Keeper" }, "keeper")
    .unit(P1, "base", { might: 3, name: "Rider" }, "rider", { exhausted: true })
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const hallTriggers = (game: Game) => game.chain().filter((c) => c.cardId === "hall" && c.triggered).length;

/** Cast RTW on the Rider naming the Hall; let it resolve. */
async function rideToHall(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("rtw", { targets: "rider" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  await game.p1.pick("battlefield-hall");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.zoneOf("rtw")).toBe("chain");
  expect(hallTriggers(game)).toBe(0); // step 1: on the chain the spell is not yet "played"
  await game.p1.passPriority();
  await game.p2.passPriority(); // RTW resolves
  return game;
}

describe("Ruling a313e60f11b98cc9 — a unit Ridden into Abandoned Hall gets the Hall's +1", () => {
  test("step 1→2: Ride the Wind resolves first — Rider is at the Hall and READY, spell in trash — and only now is the Hall trigger on the chain", async () => {
    const game = await rideToHall();
    expect(game.state("rider")).toMatchObject({ isReady: true, location: "hall", might: 3 });
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(hallTriggers(game)).toBe(1);
  });

  test("step 3: the trigger resolves — P1 may choose a unit they control here; the freshly arrived Rider is offered (with the Keeper), takes the +1 → 4 this turn", async () => {
    const game = await rideToHall();
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["keeper", "rider"]);
    await game.p1.pick("rider");
    await game.settle();
    expect(game.state("rider")).toMatchObject({ location: "hall", might: 4, mightModifier: 1 });
    expect(game.state("keeper").might).toBe(2);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
    await game.advanceTurn();
    expect(game.state("rider").might).toBe(3); // "this turn"
  });
});

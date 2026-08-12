/**
 * Ruling ad372ac4b7965256 — Glasc Mixologist (SFD-165 → sfd-165-221) · Unit · [5][order] · 5 [Might]
 *   "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your trash,
 *    ignoring its cost."
 *   × Shipyard Skulker (OGN-175 → ogn-175-298) · Unit · [3] · 3 [Might] as the unit waiting in the trash.
 *
 * Q: If an ATTACKING Glasc Mixologist dies during the showdown, can its Deathknell put the unit at the battlefield it
 *    was attacking? What about a defending one?
 * A: Attacking, no — you do not control that battlefield, so it is not a legal destination (base and battlefields you
 *    do hold still are). Defending, yes — you already control that battlefield and keep it through the showdown.
 * Rules: 808.1.d ([Deathknell] triggers into the Chain during combat cleanup), 190.4/323.6 (control is frozen for the
 *        duration of a showdown at that battlefield; the attacker never held it), 355.2.a (play destinations).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC_MIXOLOGIST = "sfd-165-221";
const SHIPYARD_SKULKER = "ogn-175-298";

/** P1's turn: Glasc leaves home to attack P2's bf1 (a 6-[Might] wall). P1 also holds bf2. */
function attacking() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .unit(P1, "bf2", { might: 2, name: "Home" }, "home")
    .unit(P1, "base", GLASC_MIXOLOGIST, "glasc")
    .trash(P1, SHIPYARD_SKULKER, "skulker");
}

/** P2's turn: the same wall attacks INTO P1's bf1, where Glasc is the defender. */
function defending() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", GLASC_MIXOLOGIST, "glasc")
    .unit(P1, "bf2", { might: 2, name: "Home" }, "home")
    .unit(P2, "base", { might: 6, name: "Wall" }, "wall")
    .trash(P1, SHIPYARD_SKULKER, "skulker");
}

/** Run the showdown to the point where the Deathknell is offering its destination pick. */
async function toDeathknellDestination(game: Game): Promise<void> {
  await game.acting().passFocus();
  await game.acting().passFocus();
  expect(game.zoneOf("glasc")).toBe("trash");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "glasc" } });
  await game.p1.yes();
  await game.acting().passPriority();
  await game.acting().passPriority();
  await game.p1.pick("skulker"); // which trash unit to play
}

describe("Ruling ad372ac4b7965256 — an attacking Glasc cannot deploy into the battlefield it was attacking", () => {
  test("attacking: the Deathknell fires, but bf1 is missing from the destinations — only base and P1's own bf2", async () => {
    const game = await attacking().build();
    await game.p1.move("glasc", "bf1");
    await toDeathknellDestination(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : []).toEqual(["base", "battlefield-bf2"]);
  });

  test("…and the unit really does land where it was allowed to", async () => {
    const game = await attacking().build();
    await game.p1.move("glasc", "bf1");
    await toDeathknellDestination(game);
    await game.p1.pick("base");
    await game.settle();
    expect(game.locationOf("skulker")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // the attack failed
    expect(game.violations()).toEqual([]);
  });

  test("defending: the very same Deathknell DOES offer bf1 — P1 held it when the showdown began", async () => {
    const game = await defending().build();
    await game.p2.move("wall", "bf1");
    await toDeathknellDestination(game);
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : []).toEqual([
      "base",
      "battlefield-bf1",
      "battlefield-bf2",
    ]);
  });

  test("…and the replacement really arrives at the contested battlefield", async () => {
    const game = await defending().build();
    await game.p2.move("wall", "bf1");
    await toDeathknellDestination(game);
    await game.p1.pick("battlefield-bf1");
    expect(game.locationOf("skulker")).toBe("bf1");
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    await game.settle(); // it then meets the 6-[Might] wall and dies, but it did arrive
    expect(game.violations()).toEqual([]);
  });
});

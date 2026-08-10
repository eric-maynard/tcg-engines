/**
 * Ruling ce58ba980937bea3 — Piercing Light (SFD-023 → sfd-023-221) · Spell · Fury · [2][fury]
 *     "[Repeat] [2][fury] Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Action · [Hidden] "Move a unit from a battlefield to its base."
 *   (Draven = Draven, Showboat OGN-028 → ogn-028-298, 3 Might, "My Might is increased by your points" — any Draven works.)
 *
 * Q: My Draven at a battlefield is hit with Piercing Light; I react with Fight or Flight moving Draven to base. Does he
 *    still take the damage now that no unit is at that battlefield?
 * A: No. Piercing Light needs "a unit at a battlefield"; Draven moved to base is no longer a legal target when the spell
 *    resolves, so its damage is not dealt to him.
 * Rules: 359.3.e.2 / 359.3.e.5 / 359.3.e.9 (target no longer meets "at a battlefield" ⇒ unaffected), 811 (a Hidden card
 *        is played from facedown as a Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const DRAVEN_SHOWBOAT = "ogn-028-298";

/** P1's turn: Piercing Light + exactly [2][fury]. P2 (0 points) holds bf1 with Draven, Showboat (3) alone; Fight or Flight hidden there. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", DRAVEN_SHOWBOAT, "draven")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P1, PIERCING_LIGHT, "pl");
}

/** P1 casts Piercing Light (no repeat) at Draven, leaving the "up to one other unit" slot empty, and passes → P2 has priority. */
async function lightAtDraven(game: Game): Promise<void> {
  expect(game.state("draven").might).toBe(3);
  await game.p1.cast("pl", { targets: ["draven"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pl", controller: P1, triggered: false })]);
  expect(game.chain()[0]?.targets).toContain("draven");
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling ce58ba980937bea3 — Fight or Flight pulls Draven to base in response: Piercing Light deals him nothing", () => {
  test("control: unanswered, Piercing Light deals 2 to Draven at bf1 (3 Might → survives with 2 damage)", async () => {
    const game = await board().build();
    await lightAtDraven(game);
    await game.settle();
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.zoneOf("draven")).toBe("battlefield-bf1");
    expect(game.state("draven").damage).toBe(2);
  });

  test("P2 may react with the hidden Fight or Flight (for [0]) while Piercing Light is pending; it goes on top and resolves first, moving Draven to base", async () => {
    const game = await board().build();
    await lightAtDraven(game);
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof", { answers: ["draven"] });
    for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
      await game.acting().pick("draven");
    }
    expect(game.p2.energy()).toBe(0); // played from hidden for [0]
    expect(game.chain().map((c) => c.cardId)).toEqual(["pl", "fof"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Fight or Flight resolves
    expect(game.zoneOf("draven")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["pl"]);
    expect(game.p2.units("bf1")).toEqual([]); // no units left at that battlefield
  });

  // Draven, now in base, is an illegal target for "a unit at a battlefield", and the unchosen "up to one OTHER unit" slot
  // must not fall back onto him either → 0 damage.
  test("ruling ce58ba980937bea3 — Piercing Light then resolves: Draven (in base) is no longer 'a unit at a battlefield' → takes NO damage (nor from the empty 'other unit' slot); the spell still goes to trash", async () => {
    const game = await board().build();
    await lightAtDraven(game);
    await game.p2.reveal("fof", { answers: ["draven"] });
    for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
      await game.acting().pick("draven");
    }
    const r = await game.settle();
    expect(r.reason).toBe("open"); // no re-target prompt
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.zoneOf("draven")).toBe("base");
    expect(game.state("draven")).toMatchObject({ damage: 0, might: 3 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

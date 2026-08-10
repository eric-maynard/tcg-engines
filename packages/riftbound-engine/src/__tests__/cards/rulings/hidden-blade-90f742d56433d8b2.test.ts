/**
 * Ruling 90f742d56433d8b2 — Hidden Blade (OGN-213 → ogn-213-298) "[Hidden][Action] Kill a unit at a battlefield. Its
 *     controller draws 2."
 *   × Charm (OGN-043 → ogn-043-298) · 1 + [calm] · "Move an enemy unit."   (Dragon's Rage OGN-258 works the same way)
 *
 * Q: Opponent holds a conquered battlefield with a facedown Hidden Blade. I Charm a unit from their base onto it; in
 *    response they Hidden Blade their OWN unit there. Do they score a conquer point when my Charm lands their unit?
 * A: Yes (unless stopped in the showdown). Sequence: Charm on chain → hidden Hidden Blade on chain → their unit dies →
 *    they lose control of the battlefield immediately → Charm resolves, the new unit moves in → they don't control it,
 *    so it becomes contested and a showdown starts → if the unit is still there when it ends, they conquer: +1.
 * Rules: 811 (hidden play as Reaction), 337 (LIFO), 187/190 (control), 345 (showdown on contest), 441–444 (conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const CHARM = "ogn-043-298";

/**
 * Turn 3, P1 active with 1 + [calm] and Charm. P2 (0 points) holds bf1 with a lone Defender (2) and a facedown Hidden
 * Blade; P2's Mover (3) sits in P2's base. bf2 is P1's. Known P2 deck so the draw is visible.
 */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P2, "base", { might: 3, name: "Mover" }, "mover")
    .unit(P1, "bf2", { might: 2, name: "Mine" }, "mine")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
    .hand(P1, CHARM, "charm");
}

/** Charm on Mover → bf1; P1 passes; P2 flips Hidden Blade on its own Defender (locked: the only unit at bf1). */
async function charmThenBlade(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { targets: "mover" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  await game.p1.pick("battlefield-bf1");
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "blade")).toBe(true);
  await game.p2.reveal("blade");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("def");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "blade"]);
  expect(game.chain()[1]).toMatchObject({ controller: P2, targets: ["def"] });
  return game;
}

describe("Ruling 90f742d56433d8b2 — Hidden Blading your own holder so the Charmed-in unit re-conquers", () => {
  test("with Charm on the chain P2 may flip its facedown Hidden Blade on its OWN Defender; it lands above Charm", async () => {
    await charmThenBlade();
  });

  test("Hidden Blade resolves first: the Defender dies and P2 (its controller) draws 2; Charm is still pending and the Mover hasn't moved", async () => {
    const game = await charmThenBlade();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.p2.hand()).toEqual(["d1", "d2"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
    expect(game.zoneOf("mover")).toBe("base");
    expect(game.p2.units("bf1")).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge 90f742d56433d8b2 says P2 loses control of the emptied bf1 IMMEDIATELY, before Charm
  // resolves; CR 190.4.c says control lapses only "in the following cleanup" and only while "the turn is in an Open
  // state", and a Chain Item (Charm) keeps the turn Closed (rules 309 / 401.1) — engine follows CR, so control is kept
  // until the chain empties. Same model as the official Cruel Patron / Baited Hook / Arcane Shift clarification
  // recorded in `operations/battlefield-control.ts`.
  test("ruling 90f742d56433d8b2 (engine follows CR 190.4.c): P2 keeps the emptied bf1 while Charm is still on the chain", async () => {
    const game = await charmThenBlade();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBe(P2);
  });

  // RULING-CONFLICT: riftjudge 90f742d56433d8b2 wants Charm to land the Mover on a battlefield P2 no longer controls
  // (contest → showdown → conquer for 1 point). That follows only from the immediate control loss the ruling assumes;
  // under CR 190.4.c control never lapsed (the turn was Closed the whole time — see the facet above), so the Mover
  // arrives at a battlefield its own controller already holds: rule 190.3.a applies no Contested, no showdown opens,
  // and nothing is conquered (469.1 — keeping control you never lost is not a Conquer). Engine follows CR.
  test("ruling 90f742d56433d8b2 (engine follows CR 190.4.c/469.1): the Mover lands on P2's own bf1 — no contest, no showdown, no point", async () => {
    const game = await charmThenBlade();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Hidden Blade
    await game.p1.passPriority();
    await game.p2.passPriority(); // Charm
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.zoneOf("mover")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
  });

  test("end state either way: Charm resolved, Mover at bf1 held by P2, Defender in trash, both spells in trash", async () => {
    const game = await charmThenBlade();
    await game.settle();
    expect(game.zoneOf("mover")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });
});

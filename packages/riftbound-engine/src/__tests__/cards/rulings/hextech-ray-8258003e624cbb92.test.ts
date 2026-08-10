/**
 * Ruling 8258003e624cbb92 — Hextech Ray (OGN-009 → ogn-009-298) · Action · 1+[fury] "Deal 3 to a unit at a battlefield."
 *   × Unyielding Spirit (OGN-145 → ogn-145-298) · Reaction · 1+[body] "Prevent all spell and ability damage this turn."
 *   × Void Seeker (OGN-024 → ogn-024-298) · Action · 3+[fury] "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Shakedown (OGN-033 → ogn-033-298) · Reaction · 2+[fury] "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."
 *
 * Q: I Ray the opponent's minion; they respond with Unyielding Spirit. Can I add Void Seeker or Shakedown to kill it before Spirit
 *    resolves?
 * A: Void Seeker — no: an Action can start a chain but can't be added to one. Shakedown — yes: a Reaction goes on top and resolves
 *    BEFORE Unyielding Spirit; if its damage kills the unit it dies before the prevention exists. If instead I Void Seeker after
 *    the chain has resolved, Spirit's prevention (rest of turn) negates the damage — but I still draw 1 from Void Seeker.
 * Rules: 341 / 342 (Action vs Reaction timing on an existing chain), 340 (LIFO), 437 / prevention "this turn", 359.3.e.5.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const UNYIELDING_SPIRIT = "ogn-145-298";
const VOID_SEEKER = "ogn-024-298";
const SHAKEDOWN = "ogn-033-298";

/** P1's turn. P2's Minion (3) holds bf1; P2 has Spirit + 1+[body]. P1: Ray, Void Seeker, Shakedown; 6 energy + 3 fury (all three). */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 3 } })
    .resources(P2, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Minion" }, "minion")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P1, SHAKEDOWN, "shake")
    .hand(P2, UNYIELDING_SPIRIT, "spirit")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** Ray at the Minion → P2 responds with Unyielding Spirit → priority back to P1 with [ray, spirit] on the chain. */
async function rayThenSpirit(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ray", { targets: "minion" });
  await game.p1.passPriority();
  expect(game.p2.can("cast", "spirit")).toBe(true);
  await game.p2.cast("spirit");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
  await game.p2.passPriority();
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "spirit"]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 8258003e624cbb92 — responding to Unyielding Spirit: Void Seeker (Action) can't join the chain, Shakedown (Reaction) can and kills first", () => {
  test("with the chain open, Void Seeker (an Action) is NOT playable, Shakedown (a Reaction) IS", async () => {
    const game = await rayThenSpirit();
    expect(game.p1.can("cast", "vs")).toBe(false);
    expect(game.p1.can("cast", "shake")).toBe(true);
  });

  test("Shakedown goes on top and resolves first: the Minion's controller (P2) is the one who chooses 'deal 6' vs 'have them draw 2'; choosing damage kills the Minion BEFORE Unyielding Spirit resolves", async () => {
    const game = await rayThenSpirit();
    await game.p1.cast("shake", { targets: "minion" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "spirit", "shake"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Shakedown starts resolving
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 }); // "unless its controller has you draw 2" — P2 decides
    const labels = d?.kind === "pick" ? d.options.map((o) => o.label) : [];
    expect(labels).toEqual(expect.arrayContaining(["Have them draw 2", "Deal 6 to it"]));
    const dealSix = d?.kind === "pick" ? d.options.find((o) => o.label === "Deal 6 to it") : undefined;
    await game.p2.pick(dealSix!.key);
    // Shakedown done; Spirit (and Ray) still on the chain — and the Minion is already dead.
    expect(game.zoneOf("shake")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "spirit"]);
    expect(game.zoneOf("minion")).toBe("trash");
    expect(game.p1.hand().toSorted()).toEqual(["vs"]); // P1 drew nothing
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("spirit")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the other branch of Shakedown: if P2 instead has P1 draw 2, no damage is dealt and the Minion survives the whole chain (Ray's 3 is then prevented by Spirit)", async () => {
    const game = await rayThenSpirit();
    await game.p1.cast("shake", { targets: "minion" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const draw = d?.kind === "pick" ? d.options.find((o) => o.label === "Have them draw 2") : undefined;
    await game.p2.pick(draw!.key);
    await game.settle();
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2", "vs"]);
    expect(game.state("minion")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // Spirit resolved before Ray → 3 prevented
  });

  test("no Reaction from P1: Spirit resolves, then Ray's 3 is prevented; afterwards Void Seeker (now legal in the Open state) has its 4 prevented too — but P1 still draws 1", async () => {
    const game = await rayThenSpirit();
    await game.p1.passPriority(); // both passed → Spirit resolves, then Ray
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("spirit")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("minion")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "vs")).toBe(true);
    await game.p1.cast("vs", { targets: "minion" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    await game.settle();
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("minion")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // prevented for the rest of the turn
    expect(game.p1.hand().toSorted()).toEqual(["d1", "shake"]); // "Draw 1" still happened
    expect(game.violations()).toEqual([]);
  });
});

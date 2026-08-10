/**
 * Ruling 3572c7474e785932 — Fiora, Peerless (sfd-110-221) × Fight or Flight (ogn-168-298) × Challenge (ogn-128-298)
 *   Fiora: 3 Might, "When I attack or defend one on one, double my Might this combat."
 *   Fight or Flight: "[Action] Move a unit from a battlefield to its base." (2)
 *   Challenge: "[Action] Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other." (2 + [body])
 *
 * Q: If Fiora (doubled to 6 as a lone defender) is moved to base by Fight or Flight during combat, can she still be
 *    chosen by Challenge and deal her doubled 6 before combat ends?
 * A: Yes. Combat does not end when Fiora leaves the battlefield; both players keep acting until consecutive passes on an
 *    empty chain. Fiora keeps her doubled Might for the whole combat even in base, so Challenge has her deal 6.
 * Rules: 340–344 (showdown ends only on consecutive passes), 466.7.c ("this combat" effects expire when combat ends).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "sfd-110-221";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const CHALLENGE = "ogn-128-298";

const showdowns = (game: Game) => game.gameState.interaction?.showdownStack ?? [];

async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

/**
 * P1's turn. P2's Fiora alone at P2's bf1; P1's 5-Might Attacker walks in (one on one).
 * 5 Might is the discriminator: a 6 from Fiora kills it, a 3 would not; and 5 back at Fiora kills a 3-Might Fiora but not a 6.
 */
async function fioraDoubledThenSentHome(): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 2 }) // Fight or Flight
    .resources(P2, { energy: 2, power: { body: 1 } }) // Challenge
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", FIORA, "fiora")
    .unit(P1, "base", { might: 5, name: "Attacker" }, "atk")
    .hand(P1, FIGHT_OR_FLIGHT, "fof")
    .hand(P2, CHALLENGE, "challenge")
    .build();
  expect(game.state("fiora").might).toBe(3);
  await game.p1.move("atk", "bf1");
  // Initial chain: Fiora's "defend one on one" trigger.
  expect(game.chain().map((c) => c.cardId)).toEqual(["fiora"]);
  expect(showdowns(game)[0]).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  await resolveChain(game);
  expect(game.chain()).toEqual([]);
  expect(game.state("fiora").might).toBe(6);
  // Initial chain closed; the attacker (P1) has Focus and plays Fight or Flight on Fiora.
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("fof", { targets: "fiora" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["fof"]);
  await resolveChain(game);
  expect(game.locationOf("fiora")).toBe("base");
  return game;
}

describe("Ruling 3572c7474e785932 — Fiora sent to base mid-combat keeps her doubled Might and can still Challenge for 6", () => {
  test("after Fight or Flight resolves, combat has NOT ended: the showdown at bf1 is still open, Fiora sits in base at 6 Might", async () => {
    const game = await fioraDoubledThenSentHome();
    expect(showdowns(game)).toHaveLength(1);
    expect(showdowns(game)[0]).toMatchObject({ active: true, battlefieldId: "bf1" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("fiora").might).toBe(6); // "this combat" — not "while here"
    expect(game.locationOf("atk")).toBe("bf1");
  });

  test("P2 can still play Challenge choosing Fiora (in base) and the Attacker: Fiora deals 6 — the 5-Might Attacker dies — and takes 5, which her 6 Might survives", async () => {
    const game = await fioraDoubledThenSentHome();
    // Whoever has Focus: get it to P2 (P1 passes if needed — one pass does not end the showdown).
    if (game.decision()?.seat === P1) {
      await game.p1.passFocus();
    }
    expect(showdowns(game)[0]?.active).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "challenge")).toBe(true);
    const pairs = game.p2.option("cast", "challenge")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(pairs).toContainEqual(["fiora", "atk"]); // [friendly, enemy] — Fiora in base is a legal friendly choice
    await game.p2.cast("challenge", { targets: ["fiora", "atk"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await resolveChain(game);
    expect(game.zoneOf("atk")).toBe("trash"); // took 6 ≥ 5
    expect(game.zoneOf("fiora")).toBe("base"); // took 5 < 6
    expect(game.state("fiora").damage).toBe(5);
    expect(game.state("fiora").might).toBe(6);
    // Combat is STILL not over until both pass on the empty chain.
    expect(showdowns(game)).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle();
    expect(showdowns(game)).toHaveLength(0);
    expect(game.zoneOf("fiora")).toBe("base");
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("ruling 3572c7474e785932 — engine keeps Fiora at 6 Might after combat ends when she left the battlefield mid-combat; 'this combat' doubling should expire (466.7.c)", async () => {
    // Expected: the doubling lasts exactly "this combat" — once both pass and combat ends, Fiora (now in base) is 3 Might again.
    // Actual: the combat-duration effect is not expired for a unit that is no longer at the combat battlefield; she stays at 6.
    const game = await fioraDoubledThenSentHome();
    await game.settle(); // both pass Focus → combat resolves/ends
    expect(showdowns(game)).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("fiora")).toBe("base");
    expect(game.state("fiora").might).toBe(3);
  });
});

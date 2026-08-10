/**
 * Ruling 655a21c1fe14e26b — Falling Star (OGN-029 → ogn-029-298) · Fury spell · [2][fury][fury] "Deal 3 to a unit. Deal 3 to a unit."
 *   × Deathgrip (SFD-163 → sfd-163-221) · Order Reaction · [2] "Kill a friendly unit. If you do, give +[Might] equal to its
 *     Might to another friendly unit this turn. Draw 1."
 *   × Immortal Phoenix (OGN-037 → ogn-037-298) · 3 Might "[Assault 2] When you kill a unit with a spell, you may pay [1][fury]
 *     to play me from your trash."
 *
 * Q: My Phoenix is targeted by an enemy Falling Star; I Deathgrip it in response and replay it via its own trigger. Does
 *    Falling Star fizzle on it or does the Phoenix die anyway?
 * A: Deathgrip (Reaction) resolves first and kills the Phoenix; its trigger (you killed a unit with a spell) lets you pay
 *    [1][fury] to play it from trash. When Falling Star resolves, the replayed Phoenix is a NEW object — an illegal target —
 *    so that instance does nothing (359.3.e.5); an instance aimed at another unit still resolves normally.
 * Rules: 340 (LIFO), 359.3.e.2/.4/.5 (target left its zone → not the same object → unaffected; no new choice is made),
 *        383 (Phoenix trigger), 356 (optional pay on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const DEATHGRIP = "sfd-163-221";
const IMMORTAL_PHOENIX = "ogn-037-298";

/**
 * P2's turn (Falling Star has no Action/Reaction tag). P1 holds bf1 with Immortal Phoenix (3) and a 5-Might Buddy;
 * P1: Deathgrip in hand, exactly [3][fury] (Deathgrip 2 + Phoenix 1+fury). P2: Falling Star, exactly [2][fury][fury];
 * a 2-Might Onlooker in P2's base.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", IMMORTAL_PHOENIX, "phoenix")
    .unit(P1, "bf1", { might: 5, name: "Buddy" }, "buddy")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onl")
    .hand(P2, FALLING_STAR, "star")
    .hand(P1, DEATHGRIP, "grip");
}

/** P2 casts Falling Star with the given two targets and passes; P1 answers with Deathgrip killing the Phoenix. */
async function starThenGrip(targets: [string, string]): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("star", { targets });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", controller: P2, targets })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "grip")).toBe(true);
  await game.p1.cast("grip", { targets: "phoenix" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["star", "grip"]);
  return game;
}

/**
 * Resolve Deathgrip and the Phoenix trigger: pass priorities, accept the [1][fury] payment, aim the +Might at Buddy if
 * asked, and put the replayed Phoenix in base. Stops when only Falling Star is left with a priority window open.
 */
async function gripAndReplay(game: Game): Promise<{ sawPay: boolean; sawDestination: boolean }> {
  let sawPay = false;
  let sawDestination = false;
  for (let i = 0; i < 16; i++) {
    const d: Decision | null = game.decision();
    if (!d) {
      break;
    }
    const ids = game.chain().map((c) => c.cardId);
    if (d.kind === "action" && d.context === "chain" && ids.length === 1 && ids[0] === "star") {
      break; // Falling Star alone, about to get its priority round
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "yes-no") {
      expect(d).toMatchObject({ seat: P1, source: { cardId: "phoenix" } });
      sawPay = true;
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1) {
      const keys = d.options.map((o) => o.key);
      if (keys.includes("base")) {
        sawDestination = true;
        await game.p1.pick("base");
      } else {
        await game.p1.pick(keys.includes("buddy") ? "buddy" : keys[0]!);
      }
    } else {
      break;
    }
  }
  return { sawDestination, sawPay };
}

/** Let Falling Star resolve WITHOUT making any new choice for it; report whether P2 was asked to re-choose. */
async function resolveStarPassively(game: Game): Promise<boolean> {
  let reasked = false;
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.source?.cardId === "star") {
      reasked = true;
      break;
    } else {
      break;
    }
  }
  return reasked;
}

describe("Ruling 655a21c1fe14e26b — Deathgrip + replay makes the Phoenix a new object; Falling Star can't touch it", () => {
  test("Deathgrip (a Reaction) is a legal answer to Falling Star and sits above it on the chain", async () => {
    const game = await starThenGrip(["phoenix", "buddy"]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.zoneOf("phoenix")).toBe("battlefield-bf1");
  });

  test("Deathgrip resolves first: the Phoenix dies to P1's own spell (→ trash), Buddy gets +3 (8), P1 draws 1 — and the Phoenix's trigger asks P1 to pay [1][fury]; paid, P1 CHOOSES where it is played (base) and it returns from the trash while Falling Star still waits", async () => {
    const game = await starThenGrip(["phoenix", "buddy"]);
    const hand = game.p1.hand().length;
    const { sawPay, sawDestination } = await gripAndReplay(game);
    expect(sawPay).toBe(true);
    expect(sawDestination).toBe(true);
    expect(game.zoneOf("grip")).toBe("trash");
    expect(game.state("buddy").might).toBe(8);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.state("phoenix")).toMatchObject({ controller: P1, damage: 0, location: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", targets: ["phoenix", "buddy"] })]);
  });

  // Expected: Falling Star resolves with its locked targets — the Phoenix instance is simply ignored (new object, 359.3.e.5,
  // no new choice is offered), the Buddy instance deals 3; the Phoenix sits undamaged in base. Actual: on resolution the
  // engine re-prompts P2 to "Choose a target for Falling Star" for the orphaned instance (and will happily shoot the replayed
  // Phoenix or anything else with it).
  test("ruling 655a21c1fe14e26b — split Falling Star should ignore the replayed Phoenix and only hit Buddy; engine re-asks P2 for a fresh target", async () => {
    const game = await starThenGrip(["phoenix", "buddy"]);
    await gripAndReplay(game);
    const reasked = await resolveStarPassively(game);
    expect(reasked).toBe(false);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.state("phoenix")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("buddy")).toMatchObject({ damage: 3, might: 8, zone: "battlefield-bf1" });
    expect(game.state("onl").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  // Expected: with BOTH instances locked on the Phoenix, Falling Star resolves doing nothing at all ("fizzles") — nobody is
  // damaged and P2 makes no choices. Actual: the engine re-prompts P2 for replacement targets.
  test("ruling 655a21c1fe14e26b — double-targeted Phoenix: Falling Star should fizzle entirely; engine re-asks P2 for targets", async () => {
    const game = await starThenGrip(["phoenix", "phoenix"]);
    await gripAndReplay(game);
    expect(game.zoneOf("phoenix")).toBe("base");
    const reasked = await resolveStarPassively(game);
    expect(reasked).toBe(false);
    expect(game.zoneOf("star")).toBe("trash"); // resolved (not countered), just without effect
    expect(game.state("phoenix")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("buddy").damage).toBe(0);
    expect(game.state("onl").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("control: without Deathgrip the split Falling Star kills the 3-Might Phoenix outright and puts 3 on Buddy — and an ENEMY spell kill offers P1 no Phoenix replay", async () => {
    const game = await board().build();
    await game.p2.cast("star", { targets: ["phoenix", "buddy"] });
    let offeredReplay = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no" && d.source?.cardId === "phoenix") {
        offeredReplay = true;
        await game.seat(d.seat).no();
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.state("buddy")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(offeredReplay).toBe(false); // "when YOU kill a unit with a spell" — P2's spell doesn't count for P1
    expect(game.violations()).toEqual([]);
  });
});

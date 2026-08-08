/**
 * Emperor's Dais — sfd-207-221 · Battlefield · no domain · no cost
 *
 *   When you conquer here, you may pay [1] and return a unit you control here to its owner's
 *   hand. If you do, play a 2 [Might] Sand Soldier unit token here.
 *
 * Rules: 383.4.c / 471.2.a (conquer effects trigger only at the battlefield conquered), 190.6.d
 * ("you" = the Dais's controller, i.e. whoever just conquered it), 205 ("you may pay … If you do"
 * — the payment is a game action inside the effect; the follow-up checks it was performed; both
 * halves — [1] AND the return — must be done), 355.10.c.1 (cost-within-instruction: unpayable →
 * nothing happens, never a free token), 108.2 / 740.1.a ("a unit you CONTROL here" vs "its OWNER's
 * hand"), 186.1 (a token returned to hand ceases to exist), 184.1 (a played unit token enters
 * exhausted), 190.4.a (the Sand Soldier keeps the battlefield controlled after the bounce).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. The whole option is one package: pay [1] + bounce one of YOUR units HERE → Sand Soldier
 *     HERE. With 0 energy (or no unit here) the option cannot be taken; declining costs nothing.
 *  2. Which unit: only units you control AT THE DAIS are candidates (never base / other
 *     battlefields); with two conquerors the payer picks which one goes home.
 *  3. Bouncing your ONLY conqueror is fine — the 2-Might token replaces it and you keep control.
 *  4. Control ≠ ownership: a borrowed (P2-owned) conqueror returns to P2's hand; the token is yours.
 *  5. A unit TOKEN may be the returned unit: it ceases to exist and the Sand Soldier still comes.
 *  6. "here": conquering some other battlefield while you sit on the Dais offers nothing; the
 *     opponent conquering your Dais card gets the offer instead of you.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-207-221";
const RECRUIT = "ogn-273-298"; // 1-Might Recruit unit token

const sandSoldiersAt = (game: Game, seat: "p1" | "p2", at: string) =>
  game[seat].units(at as "base").filter((id) => game.state(id).name === "Sand Soldier");

/** Empty Dais; P1 (with `energy`) walks in from base. */
function walkIn(energy: number) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("dais", { controller: null, def: CARD, inert: false, owner: P1 })
    .unit(P1, "base", { might: 3, name: "Centurion" }, "centurion")
    .unit(P1, "base", { might: 1, name: "Homebody" }, "home");
}

/** Accept the Dais offer, answering the "which unit" pick with `ret` if asked; drain to the open state. */
async function acceptReturning(game: Game, seat: "p1" | "p2", ret: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      return;
    }
    const d = game.decision();
    if (d?.kind === "yes-no") {
      await game[seat].yes();
    } else if (d?.kind === "pick") {
      await game[seat].pick(ret);
    } else {
      return;
    }
  }
}

describe("Emperor's Dais (sfd-207-221)", () => {
  test.failing("BUG: registry payload should scope the conquer trigger to HERE (printed 'When you conquer here'); the hand-authored trigger carries no location at all", async () => {
    // Expected: trigger mentions "here" (either `location: "here"` or `on: {…, location: "here"}`).
    // Actual: `{ event: "conquer", on: "controller" }` — fires for a conquer anywhere.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Emperor's Dais" });
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { type: string; optional?: boolean; trigger: unknown; effect: unknown; condition?: unknown };
    expect(ability).toMatchObject({
      condition: { cost: { energy: 1, returnToHand: { controller: "friendly", location: "here", type: "unit" } }, type: "pay-cost" },
      effect: { location: "here", token: { might: 2, name: "Sand Soldier", type: "unit" }, type: "create-token" },
      optional: true,
      trigger: { event: "conquer" },
      type: "triggered",
    });
    expect(JSON.stringify(ability.trigger)).toContain("here");
  });

  test("conquering the empty Dais with [1] available: P1 is offered the option (payable), and the conquer point is already scored", async () => {
    const game = await walkIn(1).build();
    await game.p1.move("centurion", "dais");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "dais" } });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
  });

  test.failing("BUG: accepting pays [1], returns the lone conqueror to hand and plays an exhausted 2-Might Sand Soldier token AT THE DAIS — P1 keeps control (205, 184.1, 190.4.a)", async () => {
    // Expected: energy 1→0, Centurion in hand, one Sand Soldier token (2 Might, exhausted) at the Dais,
    // Dais still P1's. Actual: the [1] is taken but nothing is returned and no token is played.
    const game = await walkIn(1).build();
    await game.p1.move("centurion", "dais");
    await acceptReturning(game, "p1", "centurion");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("centurion")).toBe("hand");
    const soldiers = sandSoldiersAt(game, "p1", "dais");
    expect(soldiers).toHaveLength(1);
    expect(game.state(soldiers[0]!)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, might: 2, owner: P1 });
    expect(sandSoldiersAt(game, "p1", "base")).toHaveLength(0); // "here", not to base
    expect(game.zoneOf("home")).toBe("base");
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("declining: nothing is paid, nobody goes home, no token — straight back to the main phase with the point", async () => {
    const game = await walkIn(1).build();
    await game.p1.move("centurion", "dais");
    await game.settle();
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("centurion")).toBe("battlefield-dais");
    expect(sandSoldiersAt(game, "p1", "dais")).toHaveLength(0);
    expect(sandSoldiersAt(game, "p1", "base")).toHaveLength(0);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("355.10.c.1 — with 0 energy the option cannot be taken (no offer, or an offer that cannot be accepted); passing on it leaves the board untouched and never yields a free token", async () => {
    const game = await walkIn(0).build();
    await game.p1.move("centurion", "dais");
    const r = await game.settle();
    if (r.reason === "unanswered") {
      expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
      await game.settle();
    }
    expect(game.zoneOf("centurion")).toBe("battlefield-dais");
    expect(sandSoldiersAt(game, "p1", "dais")).toHaveLength(0);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test.failing("BUG: two conquerors — the payer picks WHICH unit here returns (base units are not candidates); returning the 1-Might Squire leaves the Centurion plus a Sand Soldier at the Dais", async () => {
    // Expected: a pick over exactly {centurion, squire}; afterwards squire in hand, centurion + token at
    // the Dais, energy 0. Actual: no return / no token happens at all.
    const game = await walkIn(1).unit(P1, "base", { might: 1, name: "Squire" }, "squire").build();
    await game.p1.move(["centurion", "squire"], "dais");
    let offered: string[] | undefined;
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered") {
        break;
      }
      const d = game.decision();
      if (d?.kind === "yes-no") {
        await game.p1.yes();
      } else if (d?.kind === "pick") {
        offered = d.options.map((o) => o.card ?? o.key).sort();
        await game.p1.pick("squire");
      }
    }
    expect(offered).toEqual(["centurion", "squire"]);
    expect(game.zoneOf("squire")).toBe("hand");
    expect(game.zoneOf("centurion")).toBe("battlefield-dais");
    expect(sandSoldiersAt(game, "p1", "dais")).toHaveLength(1);
    expect(game.p1.energy()).toBe(0);
  });

  test.failing("BUG: control ≠ ownership — a P2-OWNED conqueror that P1 controls returns to P2's hand ('its owner's hand') while the Sand Soldier is P1's, so P1 keeps the Dais", async () => {
    // Expected: defector in P2's hand, P1 token at the Dais, Dais controller P1. Actual: no return, no token.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("dais", { controller: null, def: CARD, inert: false, owner: P1 })
      .card("defector", { controller: P1, def: { cardType: "unit", might: 3, name: "Defector" }, owner: P2, zone: "base" })
      .build();
    expect(game.state("defector")).toMatchObject({ controller: P1, owner: P2 });
    await game.p1.move("defector", "dais");
    await acceptReturning(game, "p1", "defector");
    expect(game.zoneOf("defector")).toBe("hand");
    expect(game.p2.hand()).toContain("defector");
    expect(game.p1.hand()).not.toContain("defector");
    const soldiers = sandSoldiersAt(game, "p1", "dais");
    expect(soldiers).toHaveLength(1);
    expect(game.state(soldiers[0]!)).toMatchObject({ controller: P1, owner: P1 });
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
  });

  test.failing("BUG: a unit TOKEN can be the returned unit — the Recruit ceases to exist (186.1: in no hand) and the Sand Soldier is still played here", async () => {
    // Expected: recruit gone (not in hand, not on board), one Sand Soldier at the Dais. Actual: nothing happens.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("dais", { controller: null, def: CARD, inert: false, owner: P1 })
      .unit(P1, "base", RECRUIT, "recruit")
      .build();
    await game.p1.move("recruit", "dais");
    await acceptReturning(game, "p1", "recruit");
    expect(game.has("recruit") ? game.zoneOf("recruit") : "gone").not.toBe("battlefield-dais");
    expect(game.p1.hand()).not.toContain("recruit");
    expect(sandSoldiersAt(game, "p1", "dais")).toHaveLength(1);
    expect(game.p1.energy()).toBe(0);
  });

  test.failing("BUG: 471.2.a 'here' — conquering a DIFFERENT battlefield while you control the Dais must offer nothing; the engine offers the Dais option anyway", async () => {
    // Expected: straight back to the main phase after conquering "other". Actual: the pay-[1] yes/no appears.
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("dais", { controller: P1, def: CARD, inert: false, owner: P1 })
      .battlefield("other", { controller: null })
      .unit(P1, "dais", { might: 3, name: "Keeper" }, "keeper")
      .unit(P1, "base", { might: 3, name: "Centurion" }, "centurion")
      .build();
    await game.p1.move("centurion", "other");
    const r = await game.settle();
    expect(game.gameState.battlefields.other?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("190.6.d — the OPPONENT conquering a Dais card P1 owns: the offer goes to P2 (payable from P2's energy), never to P1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .resources(P1, { energy: 5 })
      .battlefield("dais", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "dais", { might: 1, name: "Sentry" }, "sentry")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "dais");
    const r = await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.dais?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2, source: { cardId: "dais" } });
    await game.p2.no();
    await game.settle();
    expect(game.p1.energy()).toBe(5);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test.failing("BUG: the opponent accepting at YOUR Dais card: P2 pays [1], the Raider returns to P2's hand and a P2 Sand Soldier holds the Dais for P2", async () => {
    // Expected: raider in P2's hand, P2-controlled Sand Soldier at the Dais, P2 energy 0, Dais controller P2.
    // Actual: only the energy is taken.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("dais", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "dais", { might: 1, name: "Sentry" }, "sentry")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "dais");
    await acceptReturning(game, "p2", "raider");
    expect(game.p2.energy()).toBe(0);
    expect(game.zoneOf("raider")).toBe("hand");
    const soldiers = sandSoldiersAt(game, "p2", "dais");
    expect(soldiers).toHaveLength(1);
    expect(game.state(soldiers[0]!)).toMatchObject({ controller: P2, might: 2 });
    expect(sandSoldiersAt(game, "p1", "dais")).toHaveLength(0);
    expect(game.gameState.battlefields.dais?.controller).toBe(P2);
  });
});

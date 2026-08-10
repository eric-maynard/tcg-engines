/**
 * Emperor's Dais — sfd-207-221 · Battlefield · no domain · no cost
 *
 *   When you conquer here, you may pay [1] and return a unit you control here to its owner's
 *   hand. If you do, play a 2 [Might] Sand Soldier unit token here.
 *
 * Rules: 383.4.c / 471.2.a (conquer effects trigger only at the battlefield conquered), 190.6.d
 * ("you" = the Dais's controller, i.e. whoever just conquered it), 383.3.a / 402.1 (the leading
 * "you may" is decided while the trigger is FINALIZED: "use it?" — timing FIN; "no" ⇒ no chain
 * item), 402.2 (the unit "you control here" is the ability's chosen object, named at finalization
 * too — timing FIN), 205 / 204.3 ("pay [1] and return … . If you do, …" is NOT "[X] to [Y]": the
 * pay and the return are game actions performed as the ability RESOLVES — 444.2: the pay is asked,
 * and still declinable, then — and "if you do" is a linked instruction: both halves must actually
 * happen or no token; unpayable → nothing, never a free token), 108.2 / 740.1.a ("a unit you CONTROL
 * here" vs "its OWNER's hand"), 186.1 (a token returned to hand ceases to exist), 184.1 (a played
 * unit token enters exhausted), 190.4.a (the Sand Soldier keeps the battlefield controlled after the bounce).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. The whole option is one package: pay [1] + bounce one of YOUR units HERE → Sand Soldier
 *     HERE. With no unit here the option cannot be taken (402.4); with 0 energy the opt-in is free
 *     to take but the pay can never be made on resolution; declining costs nothing.
 *  2. Which unit: only units you control AT THE DAIS are candidates (never base / other
 *     battlefields); with two conquerors the payer picks which one goes home — when the trigger
 *     is put on the chain (402.2), so a response still sees it on the board.
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
  test("registry payload: an optional 'conquer HERE' trigger with NO base cost — a resolution-time pay-[1] question over 'return the chosen unit here → if you did, Sand Soldier here' (383.3.a, 205, 402.2)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Emperor's Dais" });
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { type: string; optional?: boolean; trigger: unknown; effect: unknown; condition?: unknown };
    expect(ability.condition).toBeUndefined(); // 205 — nothing here is a cost
    expect(ability).toMatchObject({
      effect: {
        condition: { cost: { energy: 1 }, type: "pay-cost" },
        target: { controller: "friendly", location: "here", type: "unit" },
        then: {
          effects: [
            { target: { controller: "friendly", location: "here", type: "unit" }, type: "return-to-hand" },
            { condition: { type: "did-perform" }, then: { location: "here", token: { might: 2, name: "Sand Soldier", type: "unit" }, type: "create-token" }, type: "conditional" },
          ],
          type: "sequence",
        },
        type: "conditional",
      },
      optional: true,
      trigger: { event: "conquer" },
      type: "triggered",
    });
    expect(JSON.stringify(ability.trigger)).toContain("here");
  });

  test("conquering the empty Dais: P1 is offered the option at FINALIZATION (free to take — 205), the lone conqueror is bound as its object, and the conquer point is already scored; the [1] is asked only as it RESOLVES", async () => {
    const game = await walkIn(1).build();
    await game.p1.move("centurion", "dais");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "dais" }, timing: "FIN" });
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.dais?.controller).toBe(P1);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(1); // nothing paid to finalize
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dais", controller: P1, targets: ["centurion"], triggered: true })]);
    expect(game.zoneOf("centurion")).toBe("battlefield-dais"); // still here through the response window
    expect((await game.settle()).reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "dais" }, timing: "RES" });
  });

  test("accepting both questions pays [1], returns the lone conqueror to hand and plays an exhausted 2-Might Sand Soldier token AT THE DAIS — P1 keeps control (205, 184.1, 190.4.a)", async () => {
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

  test("declining (at finalization: no chain item; or the pay on resolution): nothing is paid, nobody goes home, no token — straight back to the main phase with the point", async () => {
    const game = await walkIn(1).build();
    await game.p1.move("centurion", "dais");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("centurion")).toBe("battlefield-dais");
    expect(sandSoldiersAt(game, "p1", "dais")).toHaveLength(0);

    const late = await walkIn(1).build();
    await late.p1.move("centurion", "dais");
    await late.settle();
    await late.p1.yes(); // opt in …
    await late.settle();
    expect(late.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "RES" });
    await late.p1.no(); // … but do not pay (444.2)
    await late.settle();
    expect(late.p1.energy()).toBe(1);
    expect(late.zoneOf("centurion")).toBe("battlefield-dais");
    expect(sandSoldiersAt(late, "p1", "dais")).toHaveLength(0);
    expect(late.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("centurion")).toBe("battlefield-dais");
    expect(sandSoldiersAt(game, "p1", "dais")).toHaveLength(0);
    expect(sandSoldiersAt(game, "p1", "base")).toHaveLength(0);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("444.2 / 359.3.e.14 — with 0 energy the opt-in may still be taken (it costs nothing), but the [1] can never be paid as it resolves: nobody goes home and no free token", async () => {
    const game = await walkIn(0).build();
    await game.p1.move("centurion", "dais");
    for (let i = 0; i < 4; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered" || game.decision()?.kind !== "yes-no") {
        break;
      }
      const t = await game.p1.try((p) => p.yes());
      if (!t.ok) {
        expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1, timing: "RES" });
        await game.p1.no();
      }
    }
    await game.settle();
    expect(game.zoneOf("centurion")).toBe("battlefield-dais");
    expect(sandSoldiersAt(game, "p1", "dais")).toHaveLength(0);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("402.2 — two conquerors: the payer picks WHICH unit here returns when the trigger is finalized (timing FIN; base units are not candidates); returning the 1-Might Squire leaves the Centurion plus a Sand Soldier at the Dais", async () => {
    const game = await walkIn(1).unit(P1, "base", { might: 1, name: "Squire" }, "squire").build();
    await game.p1.move(["centurion", "squire"], "dais");
    let offered: string[] | undefined;
    let pickTiming: string | undefined;
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
        pickTiming = d.timing;
        await game.p1.pick("squire");
      }
    }
    expect(offered).toEqual(["centurion", "squire"]);
    expect(pickTiming).toBe("FIN");
    expect(game.zoneOf("squire")).toBe("hand");
    expect(game.zoneOf("centurion")).toBe("battlefield-dais");
    expect(sandSoldiersAt(game, "p1", "dais")).toHaveLength(1);
    expect(game.p1.energy()).toBe(0);
  });

  test("control ≠ ownership — a P2-OWNED conqueror that P1 controls returns to P2's hand ('its owner's hand') while the Sand Soldier is P1's, so P1 keeps the Dais", async () => {
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

  test("a unit TOKEN can be the returned unit — the Recruit ceases to exist (186.1: in no hand) and the Sand Soldier is still played here", async () => {
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

  test("471.2.a 'here' — conquering a DIFFERENT battlefield while you control the Dais must offer nothing; the engine offers the Dais option anyway", async () => {
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

  test("the opponent accepting at YOUR Dais card: P2 pays [1], the Raider returns to P2's hand and a P2 Sand Soldier holds the Dais for P2", async () => {
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

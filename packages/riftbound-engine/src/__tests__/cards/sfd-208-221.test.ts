/**
 * Forge of the Fluft — sfd-208-221 · Battlefield
 *
 *   While you control this battlefield, friendly legends have
 *   "[Exhaust]: Attach an Equipment you control to a unit you control."
 *
 * Rules: 364 (a conditional passive: the grant exists exactly while its controller controls the
 * Forge — no chain, switches on/off with control), 135.4.b (granted text is real text: the legend HAS
 * an activated ability), 377 / 381 (activated abilities use the chain; only on the controlling player's
 * turn in an Open State), the cost is [Exhaust] alone (a ready legend; no energy, no power — that is
 * the whole payoff versus paying the Equipment's [Equip] cost), 434 (Attach: the Equipment becomes
 * Attached, takes the unit's location — 434.4 — and its Might Bonus applies — 434.1.d; attaching an
 * already-attached Equipment to a new unit detaches it from the old one — 434.1.f), 740.1.a
 * ("you control" = control, for both the Equipment and the unit; the unit may be anywhere on the board).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Free re-equips: exhaust the legend → Doran's Blade (+2) lands on a unit without paying [body];
 *     the unit may be at a battlefield (the blade relocates there with it).
 *  2. 434.1.f: the same ability MOVES an attached Equipment from unit A to unit B (A drops to printed).
 *  3. "While you control": uncontrolled Forge or an enemy-controlled Forge grants P1's legend nothing;
 *     a Forge from P1's deck that P2 controls grants P2's legend the ability instead.
 *  4. [Exhaust] is the cost: after one use the legend is exhausted and the ability is no longer
 *     offered this turn; never on the opponent's turn.
 *  5. Engine status: the card is modelled as a static granting a virtual keyword
 *     ("GrantAttachActivated") that nothing reads, under a "while-at-battlefield" condition — so no
 *     legend ever gains the ability. Positive clauses below are BUG tests.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-208-221";
const LOOSE_CANNON = "ogn-251-298"; // legend with NO printed activated ability (only a beginning-phase trigger)
const SWIFT_LEGEND = "ogn-255-298"; // Nine-Tailed Fox — another legend without an activated ability (for P2)
const DORANS_BLADE = "sfd-095-221"; // Equipment · +2 Might · [Equip] [body]

function forgeOption(game: Game, seat: "p1" | "p2", legend: string) {
  return game[seat].legal().find((o) => o.verb === "activate" && o.card === legend);
}

/** Activate the granted ability on `legend`, answering its equipment / unit choices, and let it resolve. */
async function useForge(game: Game, seat: "p1" | "p2", legend: string, equipment: string, unit: string): Promise<void> {
  const opt = forgeOption(game, seat, legend);
  expect(opt).toBeDefined();
  const chooser = (d: Decision) =>
    d.kind === "pick" ? (d.options.some((o) => o.key === equipment) ? equipment : d.options.some((o) => o.key === unit) ? unit : undefined) : undefined;
  game.script(seat === "p1" ? P1 : P2, [chooser, chooser, chooser]);
  await game[seat].choose(opt!.key);
  await game.settle();
}

function board(controller: typeof P1 | typeof P2 | null = P1) {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } }) // enough to prove nothing is spent
    .battlefield("forge", { controller, def: CARD, inert: false, owner: P1 })
    .battlefield("plain", { controller: P1 })
    .legend(P1, LOOSE_CANNON, "leg")
    .legend(P2, SWIFT_LEGEND, "theirLeg")
    .unit(P1, controller === P1 ? "forge" : "base", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "plain", { might: 3, name: "Fielder" }, "fielder")
    .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
    .gear(P1, DORANS_BLADE, "blade");
}

describe("Forge of the Fluft (sfd-208-221)", () => {
  // BUG — expected: with P1 controlling the Forge, P1's legend offers an activated ability whose whole
  // cost is [Exhaust]; using it exhausts the legend, spends no energy/power, and attaches Doran's Blade
  // to the chosen unit (+2 Might). Actual: the grant is an unread virtual keyword — nothing is offered.
  test.failing("BUG: while you control the Forge your legend has '[Exhaust]: Attach an Equipment you control to a unit you control' — free attach, legend exhausted, +2 Might", async () => {
    const game = await board(P1).build();
    expect(game.state("leg").isExhausted).toBe(false);
    await useForge(game, "p1", "leg", "blade", "squire");
    expect(game.state("leg").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 1 } }); // [Exhaust] was the entire cost
    expect(game.state("blade").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ baseMight: 1, might: 3 });
    expect(forgeOption(game, "p1", "leg")).toBeUndefined(); // exhausted legend cannot pay again
    expect(game.chain()).toEqual([]);
  });

  // BUG — expected (434.4): the unit may be at a battlefield; the Equipment becomes located there with it.
  test.failing("BUG: the target unit may be at another battlefield — the blade attaches to Fielder at 'plain' and is located there (434.4)", async () => {
    const game = await board(P1).build();
    await useForge(game, "p1", "leg", "blade", "fielder");
    expect(game.state("blade").attachedTo).toBe("fielder");
    expect(game.state("fielder").might).toBe(5);
    expect(game.locationOf("blade")).toBe("plain");
  });

  // BUG — expected (434.1.f): "Attach an Equipment you control" does not say "detached", so an
  // Equipment already on Holder can be re-attached to Squire: Holder loses the +2, Squire gains it.
  test.failing("BUG: re-attach (434.1.f) — a blade already on Holder moves to Squire; Holder back to printed Might", async () => {
    const game = await board(P1).build();
    await game.p1.do("equipCard", { equipmentId: "blade", unitId: "holder" }); // the normal way: pay [body]
    await game.settle();
    expect(game.state("blade").attachedTo).toBe("holder");
    expect(game.state("holder").might).toBe(4);
    expect(game.p1.power("body")).toBe(0);
    await useForge(game, "p1", "leg", "blade", "squire");
    expect(game.state("blade").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(3);
    expect(game.state("holder").might).toBe(2);
    expect(game.state("holder").attachments).toEqual([]);
  });

  // BUG — expected (377.3 / 381): the granted ability is a normal activated ability — it goes on the
  // chain as a non-triggered item controlled by P1 and P2 receives priority before it resolves.
  test.failing("BUG: the granted ability uses the chain — P2 gets priority, nothing attaches until it resolves", async () => {
    const game = await board(P1).build();
    const opt = forgeOption(game, "p1", "leg");
    expect(opt).toBeDefined();
    const chooser = (d: Decision) => (d.kind === "pick" ? (d.options.some((o) => o.key === "blade") ? "blade" : "squire") : undefined);
    game.script(P1, [chooser, chooser]);
    await game.p1.choose(opt!.key);
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P1, triggered: false })]);
    expect(game.state("blade").attachedTo).toBeUndefined();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    await game.settle();
    expect(game.state("blade").attachedTo).toBe("squire");
  });

  test("negative space — 'while you control this battlefield': an UNCONTROLLED Forge, or one the opponent controls, grants P1's legend nothing", async () => {
    const nobody = await board(null).build();
    expect(forgeOption(nobody, "p1", "leg")).toBeUndefined();
    expect(nobody.p1.can("activate", "leg")).toBe(false);
    const theirs = await board(P2).unit(P2, "forge", { might: 2, name: "Guard" }, "guard").build();
    expect(forgeOption(theirs, "p1", "leg")).toBeUndefined();
    // …and the printed [Equip] route still works and still costs [body] — the Forge is the only free path.
    await theirs.p1.do("equipCard", { equipmentId: "blade", unitId: "squire" });
    await theirs.settle();
    expect(theirs.state("blade").attachedTo).toBe("squire");
    expect(theirs.p1.power("body")).toBe(0);
  });

  // BUG — expected: control, not deck ownership, decides whose legends are "friendly": P2 controlling a
  // Forge from P1's deck has the ability on P2's legend during P2's turn (and P1's legend does not).
  test.failing("BUG: P2 controlling P1's Forge — P2's legend gains the ability on P2's turn; P1's legend has nothing", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("forge", { controller: P2, def: CARD, inert: false, owner: P1 })
      .legend(P1, LOOSE_CANNON, "leg")
      .legend(P2, SWIFT_LEGEND, "theirLeg")
      .unit(P2, "forge", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
      .gear(P2, DORANS_BLADE, "theirBlade")
      .gear(P1, DORANS_BLADE, "blade")
      .build();
    expect(forgeOption(game, "p1", "leg")).toBeUndefined();
    await useForge(game, "p2", "theirLeg", "theirBlade", "guard");
    expect(game.state("theirLeg").isExhausted).toBe(true);
    expect(game.state("theirBlade").attachedTo).toBe("guard");
    expect(game.state("guard").might).toBe(4);
  });

  test("negative space — timing (381): even controlling the Forge, nothing is activatable on the OPPONENT's turn, and an already-exhausted legend never offers it", async () => {
    const oppTurn = await board(P1).active(P2).build();
    expect(forgeOption(oppTurn, "p1", "leg")).toBeUndefined();
    const tired = await scenario()
      .battlefield("forge", { controller: P1, def: CARD, inert: false })
      .card("leg", { def: LOOSE_CANNON, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .unit(P1, "forge", { might: 2, name: "Holder" }, "holder")
      .gear(P1, DORANS_BLADE, "blade")
      .build();
    expect(tired.state("leg").isExhausted).toBe(true);
    expect(forgeOption(tired, "p1", "leg")).toBeUndefined();
  });

  test("losing the Forge switches the grant off: after P2 conquers it, P1's legend offers nothing on P1's next turn", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("forge", { controller: P1, def: CARD, inert: false })
      .legend(P1, LOOSE_CANNON, "leg")
      .unit(P1, "forge", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
      .gear(P1, DORANS_BLADE, "blade")
      .build();
    await game.p2.move("raider", "forge");
    await game.settle();
    expect(game.gameState.battlefields.forge?.controller).toBe(P2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(forgeOption(game, "p1", "leg")).toBeUndefined();
  });

  // BUG — expected: the payload should say what the text says — a static gated on CONTROLLING this
  // battlefield whose effect grants friendly legends an activated ability costing [Exhaust] with an
  // `attach` effect (equipment you control → unit you control). Actual: condition "while-at-battlefield"
  // and an opaque `grant-keyword: "GrantAttachActivated"` with no cost and no effect.
  test.failing("BUG: registry payload — control condition + a granted '[Exhaust]: attach' activated ability, not a virtual keyword", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Forge of the Fluft" });
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { type: string; condition?: { type?: string }; effect?: { target?: unknown } };
    expect(ability.type).toBe("static");
    expect(String(ability.condition?.type)).toMatch(/control/);
    const effect = JSON.stringify(ability.effect);
    expect(effect).toContain('"legend"');
    expect(effect).toContain('"exhaust":true');
    expect(effect).toContain('"type":"attach"');
  });
});

/**
 * Interaction: an ACTIVATED protective gear versus a PASSIVE one, on the opponent's turn.
 *
 *   Unlicensed Armory (ogn-023-298) — Gear, Fury, [2]. "Discard 1, [Exhaust]: Choose a friendly
 *                      unit. The next time it would die this turn, you may pay [fury] to heal it,
 *                      exhaust it, and recall it instead."
 *   Singularity       (ogn-105-298) — Spell, Mind, [6]+[mind][mind]. "Deal 6 to each of up to two units."
 *   Zhonya's Hourglass(ogn-077-298) — Gear, Calm, [2]. "[Hidden] … If a friendly unit would die,
 *                      kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: on P2's turn, P2 casts Singularity to kill two of P1's units while P1 holds priority in the
 * reaction window with a READY Armory, a card to discard and [fury] in pool. (a) May P1 activate the
 * Armory now? (b) May P1 use Zhonya's? (c) On P1's OWN turn, where is the activation legal, and does
 * the delayed replacement it creates still apply later that turn inside a combat Cleanup where
 * nobody holds priority?
 *
 * Rules: 381 (an activated ability may be used ONLY on its controller's turn and ONLY in an Open
 * State), 313.1.a (with Focus, only [Action]/[Reaction] spells and abilities may be used — so a
 * plain activated ability is barred inside a showdown too), 378 / 367 / 370 (activated vs static vs
 * replacement effects), 372 / 373 (ordering replacements and choosing which death a single-use one
 * applies to), 390 / 391 (a delayed effect an ability created is not itself an activation), 811
 * ([Hidden] is its own permission to play the card), 320 / 320.1 (during a Cleanup chain items
 * cannot be finalized or resolved and priority is not passed — that bars chain items, not applying
 * replacements or paying their optional costs).
 */
import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARMORY = "ogn-023-298";
const SINGULARITY = "ogn-105-298";
const ZHONYAS = "ogn-077-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — a card to discard

/**
 * P2's turn, turn 3 (so a card hidden earlier is playable from face down, 811.1.b). P1 holds bf1
 * with two units, a ready Unlicensed Armory, a card to discard and [fury] in pool.
 */
function opponentTurn(opts: { hideZhonyas?: boolean } = {}) {
  const s = scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 6, power: { mind: 2 } })
    .resources(P1, { energy: 0, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Front" }, "front")
    .unit(P1, "bf1", { might: 5, name: "Back" }, "back")
    .gear(P1, ARMORY, "armory")
    .hand(P1, FILLER, "junk")
    .hand(P2, SINGULARITY, "sing");
  if (opts.hideZhonyas) {
    s.facedown(P1, "bf1", ZHONYAS, "zh");
  }
  return s;
}

/** rule 373 — one single-use "would die" replacement, two simultaneous deaths: its controller picks. */
async function answerReplacementAssign(game: Game, keep: string): Promise<void> {
  await game.settle();
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d.options.map((o) => o.key).sort()).toEqual(["back", "front"]);
  await game.p1.pick(keep);
  await game.settle();
}

describe("Unlicensed Armory (activated) vs Zhonya's Hourglass (passive) on the opponent's turn", () => {
  // -------------------------------------------------------------------------
  // (a) rule 381 — an activated ability is a your-turn-only action
  // -------------------------------------------------------------------------
  test("381 — P1 may NOT activate the Armory on P2's turn, not even holding priority in the reaction window", async () => {
    const game = await opponentTurn().build();
    // Before anything is on the chain: P2's turn, so the ability is not among P1's actions at all.
    expect(game.p1.can("activate", "armory")).toBe(false);
    expect(game.p1.legal().some((o) => o.moveId === "activateAbility")).toBe(false);

    await game.p2.cast("sing", { targets: ["front", "back"] });
    await game.p2.passPriority();
    const d = game.decision() as ActionDecision;
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 really does hold priority
    expect(game.state("armory").isReady).toBe(true); // ready gear …
    expect(game.p1.power("fury")).toBe(1); // … payable cost …
    expect(game.p1.hand()).toContain("junk"); // … and a card to discard
    // … and none of that matters: 381's second gate is the TURN, and this is not P1's.
    expect(game.p1.can("activate", "armory")).toBe(false);
    expect(d.options.some((o) => o.moveId === "activateAbility")).toBe(false);
    const refused = await game.p1.try((p) => p.activate("armory", 0, { discard: "junk", targets: ["front"] }));
    expect(refused.ok).toBe(false);
    // Refused with no side effects: nothing discarded, nothing exhausted, nothing added to the chain.
    expect(game.zoneOf("junk")).toBe("hand");
    expect(game.state("armory").isReady).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sing"]);

    await game.settle();
    expect(game.zoneOf("front")).toBe("trash");
    expect(game.zoneOf("back")).toBe("trash");
    expect(game.p1.power("fury")).toBe(1); // never spent
    expect(game.violations()).toEqual([]);
  });

  test("381 — the same Armory activation IS legal on P1's own turn in an open Main Phase: the gate is the turn, not the gear", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .unit(P1, "base", { might: 5, name: "Front" }, "front")
      .gear(P1, ARMORY, "armory")
      .hand(P1, FILLER, "junk")
      .build();
    expect(game.p1.can("activate", "armory")).toBe(true);
    await game.p1.activate("armory", 0, { discard: "junk", targets: ["front"] });
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.state("armory").isExhausted).toBe(true);
    expect(game.p1.power("fury")).toBe(1); // 390 — the [fury] belongs to the DELAYED effect, not the activation
    await game.settle();
    expect(game.violations()).toEqual([]);
  });

  test("313.1.a — even on P1's own turn the activation is refused with FOCUS in a showdown: the ability has no [Action]/[Reaction]", async () => {
    // RULING-CONFLICT-style note: a showdown IS an Open State, so 381 alone would allow this — but
    // 313.1.a adds a keyword restriction on top of it, and the Armory's ability is unkeyworded.
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .gear(P1, ARMORY, "armory")
      .hand(P1, FILLER, "junk")
      .build();
    expect(game.p1.can("activate", "armory")).toBe(true); // open Main Phase: fine
    await game.p1.move("ally", "bf1");
    const d = game.decision() as ActionDecision;
    expect(d).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "armory")).toBe(false);
    expect((await game.p1.try((p) => p.activate("armory", 0, { discard: "junk", targets: ["ally"] }))).ok).toBe(false);
    expect(game.zoneOf("junk")).toBe("hand");
    expect(game.state("armory").isReady).toBe(true);
  });

  // -------------------------------------------------------------------------
  // (b) rules 367 / 370 / 811 — a passive replacement needs no turn and no activation
  // -------------------------------------------------------------------------
  test("367 / 370 / 373 — Zhonya's already in base applies on P2's turn with nothing activated: it is killed instead, and its controller chooses WHICH of the two simultaneous deaths it replaces", async () => {
    const game = await opponentTurn().gear(P1, ZHONYAS, "zh").build();
    // It is a replacement, not an ability anyone uses: no menu entry exists for it on either turn.
    expect(game.p1.can("activate", "zh")).toBe(false);
    await game.p2.cast("sing", { targets: ["front", "back"] });
    await answerReplacementAssign(game, "front");

    expect(game.zoneOf("zh")).toBe("trash"); // "kill this instead"
    expect(game.zoneOf("front")).toBe("base"); // healed, exhausted and recalled
    expect(game.state("front").damage).toBe(0);
    expect(game.state("front").isExhausted).toBe(true);
    expect(game.zoneOf("back")).toBe("trash"); // one save only
    expect(game.p1.power("fury")).toBe(1); // the Armory was never involved
    expect(game.violations()).toEqual([]);
  });

  test("811 — playing the Hourglass from [Hidden] during P2's turn is its own permission, not an activation: P1 may do it in the very window the Armory is barred from", async () => {
    const game = await opponentTurn({ hideZhonyas: true }).build();
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    await game.p2.cast("sing", { targets: ["front", "back"] });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // The contrast in one board: the activated gear is refused, the hidden card is offered.
    expect(game.p1.can("activate", "armory")).toBe(false);
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    await answerReplacementAssign(game, "back");

    expect(game.state("zh").isHidden).toBe(false);
    expect(game.zoneOf("zh")).toBe("trash"); // played, then killed by its own replacement
    expect(game.state("back")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("front")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // (c) 390 / 391 / 320 — the delayed replacement is not an activation
  // -------------------------------------------------------------------------
  test("390 / 320 — the delayed replacement made in P1's Main Phase still applies inside the combat Cleanup, where nobody holds priority: the optional [fury] is offered there", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .gear(P1, ARMORY, "armory")
      .hand(P1, FILLER, "junk")
      .build();
    await game.p1.activate("armory", 0, { discard: "junk", targets: ["ally"] });
    await game.settle();
    expect(game.p1.power("fury")).toBe(1);

    await game.p1.move("ally", "bf1"); // 2 Might into a 6-Might wall: lethal in combat
    await game.settle();
    // 320.1 — no priority is passed in a Cleanup, and yet the replacement's "you may pay" is asked.
    if (game.decision()?.kind === "yes-no") {
      expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
      await game.p1.yes();
      await game.settle();
    }
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").damage).toBe(0);
    expect(game.state("ally").isExhausted).toBe(true);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("391 — 'this turn' bounds the delayed replacement: next turn the same unit dies normally and nothing is asked", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .gear(P1, ARMORY, "armory")
      .hand(P1, FILLER, "junk")
      .hand(P2, SINGULARITY, "sing")
      .build();
    await game.p1.activate("armory", 0, { discard: "junk", targets: ["ally"] });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 6, power: { mind: 2 } });
    await game.p1.do("addResources", { power: { fury: 1 } }); // 317.2 emptied P1's pool at end of turn
    await game.p2.cast("sing", { targets: ["ally"] });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.p1.power("fury")).toBe(1); // nothing was offered, so nothing was paid
  });
});

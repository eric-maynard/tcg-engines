/**
 * Trapping Grounds — unl-217-219 · Battlefield
 *
 *   When you conquer here, if you assigned 3 or more excess damage, play a 1 [Might] Bird unit token
 *   with [Deflect].
 *
 * Rules: 383.4.c.2.b / 471.2.a (Conquer Effect of the conquering player at THIS battlefield), 465.2.c
 * (in the Combat Damage Step each side ASSIGNS its summed Might among the other side's units;
 * 465.2.c.3–4: lethal must be filled first and units may not be over-assigned while others remain, so
 * "excess" = what was assigned beyond every enemy unit's lethal need — pre-marked damage lowers that need,
 * Reminder under 465.2.c.2), 465.1 (no damage step at all if one side is gone when the showdown closes),
 * 187.7 (a Bird token: domainless 1-Might unit token, Bird tag, [Deflect]), 439.2.c / 143.4 ("play a
 * token" = it is played like a unit: to your base or a battlefield you control, entering exhausted),
 * 809.1.c (Deflect: an opponent's spell/ability that chooses it costs [rainbow] more), 186.1 (a token that
 * leaves the board ceases to exist).
 *
 * Head-judge notes — the trickiest situations for THIS card:
 *  1. The threshold is on EXCESS, not damage: 4 into a 1-Might defender = 3 excess ✓; 3 into 1 = 2 ✗;
 *     it is summed over all defenders (5 into 1+1 = 3 ✓) but lethal needs eat it (5 into 3+1 = 1 ✗); two
 *     attackers pool their Might (2+2 into 1 = 3 ✓); pre-marked damage lowers the need (4 into a 3-Might
 *     unit carrying 2 damage = 3 excess ✓).
 *  2. A conquer with NO damage step assigns nothing: walking onto an empty Trapping Grounds, or bolting the
 *     lone defender away during the showdown, conquers for the point but plays no Bird.
 *  3. The defender never "conquers" a battlefield it already controls: a 9-Might wall crushing a 1-Might
 *     attacker (8 excess) gets nothing. Holding it gets nothing.
 *  4. The Bird is PLAYED by the conqueror: destination base or a battlefield they control — including the
 *     Trapping Grounds they just took, never the enemy's; it enters exhausted, is a token, 1 Might, Deflect.
 *  5. Deflect bites next turn: the opponent's 1-energy bolt cannot even choose the Bird without a Power to
 *     spare; with one it costs 1 energy + 1 power and the dead Bird ceases to exist ("gone").
 *  6. "you" is the conqueror whoever owns the card: P2 re-taking P1's Trapping Grounds with 3+ excess gets
 *     the Bird.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";
import type { Game } from "../../harness";

const CARD = "unl-217-219";
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** P1's `atk`-Might raider vs P2 defenders of the given Mights at Trapping Grounds (P2's); bf2 is P2's too. */
function attack(atk: number, defenders: number[]) {
  const s = scenario()
    .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: atk, name: "Raider" }, "raider")
    .unit(P2, "bf2", { might: 6, name: "Far Wall" }, "wall");
  defenders.forEach((m, i) => s.unit(P2, "bf1", { might: m, name: `Defender ${i}` }, `d${i}`));
  return s;
}

const birdsOf = (game: Game, seat: typeof P1 = P1, at?: string) => game.seat(seat).units(at).filter((id) => game.state(id).isToken);

describe("Trapping Grounds (unl-217-219)", () => {
  test("registry payload: conquer-here trigger, condition 'excess-damage-assigned ≥ 3', effect create a 1-Might Bird unit token with Deflect", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Trapping Grounds" });
    expect(def?.abilities).toEqual([
      {
        condition: { amount: 3, type: "excess-damage-assigned" },
        effect: { token: { keywords: ["Deflect"], might: 1, name: "Bird", type: "unit" }, type: "create-token" },
        trigger: { event: "conquer", location: "here", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("exactly 3 excess (4 into a 1-Might defender): P1 conquers, scores, and is asked WHERE to play the Bird — base or a battlefield P1 controls (the just-taken bf1), never P2's bf2", async () => {
    const game = await attack(4, [1]).build();
    await game.p1.move("raider", "bf1");
    const r = await game.settle();
    expect(game.zoneOf("d0")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("unanswered");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect(d.options.map((o) => o.key).sort()).toEqual(["base", "battlefield-bf1"]);
  });

  test("the Bird: a 1-Might unit TOKEN with Deflect, owned and controlled by the conqueror, entering EXHAUSTED at the chosen spot (here: onto Trapping Grounds itself)", async () => {
    const game = await attack(4, [1]).build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    const birds = birdsOf(game);
    expect(birds).toHaveLength(1);
    const bird = birds[0] as string;
    expect(game.zoneOf(bird)).toBe("battlefield-bf1");
    expect(game.state(bird)).toMatchObject({ baseMight: 1, cardType: "unit", controller: P1, isExhausted: true, isToken: true, might: 1, name: "Bird", owner: P1 });
    expect(game.state(bird).keywords).toContain("Deflect");
    expect(game.state(bird).domains).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("negative space — 2 excess (3 into a 1-Might defender): conquer and score, but NO Bird and no prompt", async () => {
    const game = await attack(3, [1]).build();
    await game.p1.move("raider", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(birdsOf(game)).toEqual([]);
  });

  test("excess is summed across defenders (5 into 1+1 = 3 → Bird) but lethal needs eat it first (5 into 3+1 = 1 → none)", async () => {
    const yes = await attack(5, [1, 1]).build();
    await yes.p1.move("raider", "bf1");
    await yes.settle();
    expect(yes.zoneOf("d0")).toBe("trash");
    expect(yes.zoneOf("d1")).toBe("trash");
    expect(yes.decision()).toMatchObject({ kind: "pick", semantics: "destination" });
    await yes.p1.pick("base");
    await yes.settle();
    expect(birdsOf(yes, P1, "base")).toHaveLength(1);

    const no = await attack(5, [3, 1]).build();
    await no.p1.move("raider", "bf1");
    const r = await no.settle();
    expect(r.reason).toBe("open");
    expect(no.zoneOf("d0")).toBe("trash");
    expect(no.zoneOf("d1")).toBe("trash");
    expect(no.p1.points()).toBe(1);
    expect(birdsOf(no)).toEqual([]);
  });

  test("two attackers pool their Might (2 + 2 into a 1-Might defender = 3 excess → Bird); pre-marked damage lowers the lethal need (4 into a 3-Might defender carrying 2 damage = 3 excess → Bird)", async () => {
    const pair = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 2 }, "a")
      .unit(P1, "base", { might: 2 }, "b")
      .unit(P2, "bf1", { might: 1 }, "def")
      .build();
    await pair.p1.move(["a", "b"], "bf1");
    await pair.settle();
    expect(pair.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });

    const wounded = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 4 }, "raider")
      .unit(P2, "bf1", { might: 3 }, "def", { damage: 2 })
      .build();
    await wounded.p1.move("raider", "bf1");
    await wounded.settle();
    expect(wounded.zoneOf("def")).toBe("trash");
    expect(wounded.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  });

  test("negative space — no damage step, nothing assigned: walking a 9-Might unit onto an EMPTY Trapping Grounds conquers for 1 point and plays no Bird", async () => {
    const game = await scenario().battlefield("bf1", { controller: null, def: CARD, inert: false, owner: P2 }).unit(P1, "base", { might: 9 }, "raider").build();
    await game.p1.move("raider", "bf1");
    await game.settle(); // hands back the auto-begun showdown once
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(birdsOf(game)).toEqual([]);
  });

  test("negative space — the lone defender bolted away DURING the showdown: the 9-Might raider takes bf1 without a fight (465.1), so 0 excess → no Bird", async () => {
    const game = await attack(9, [1]).resources(P1, { energy: 1 }).hand(P1, BOLT, "bolt").build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("bolt", { targets: "d0" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("d0")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(birdsOf(game)).toEqual([]);
  });

  test("negative space — the DEFENDER assigning 8 excess (9-Might wall kills a 1-Might attacker) conquers nothing: no Bird for P2, no point", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 1 }, "raider")
      .unit(P2, "bf1", { might: 9 }, "wall")
      .build();
    await game.p1.move("raider", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(0);
    expect(birdsOf(game, P2)).toEqual([]);
  });

  test("negative space — HOLDING Trapping Grounds scores the hold point and plays nothing", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "bf1", { might: 9 }, "holder")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(birdsOf(game)).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
  });

  test("'you' is the conqueror: P2 re-taking P1's Trapping Grounds with a 6-Might unit into a 2-Might defender (4 excess) plays P2 a Bird; P1 gets none", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P2, "base", { might: 6 }, "raider")
      .unit(P1, "bf1", { might: 2 }, "mine")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
    await game.p2.pick("base");
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(birdsOf(game, P2, "base")).toHaveLength(1);
    expect(birdsOf(game, P1)).toEqual([]);
  });

  test("Deflect is live on the opponent's next turn: with 2 Energy and no Power P2's bolt cannot choose the Bird (only the raider); with 1 Energy + 1 Power it can — paying both — and the killed Bird ceases to exist", async () => {
    const game = await attack(4, [1]).hand(P2, BOLT, "bolt").build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    const bird = birdsOf(game, P1, "base")[0] as string;
    await game.advanceTurn(); // → P2: channels 2 fury runes, pools emptied
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.tapRune();
    await game.p2.tapRune();
    expect(game.p2.resources()).toEqual({ energy: 2, power: {} });
    const noPowerField = game.p2.option("cast", "bolt")?.fields.find((f) => f.arg === "targets");
    const noPower = noPowerField?.options;
    expect(noPower).toEqual(expect.arrayContaining([["raider"], ["wall"]]));
    // rule 809.1.d — P2 still holds runes, so the Bird's [Deflect] pip is REACHABLE: the Bird stays
    // listed and dimmed with the pay line quoted, and only the cast is refused.
    const birdIdx = (noPower ?? []).findIndex((o) => (Array.isArray(o) ? o[0] : o) === bird);
    expect(birdIdx).toBeGreaterThanOrEqual(0);
    expect(noPowerField?.unaffordable?.[birdIdx]).toBe(true);
    expect(noPowerField?.surcharge?.[birdIdx]).toBe(1);
    expect(noPowerField?.needsAdd?.power).toEqual({ rainbow: 1 });
    expect((await game.p2.try((p) => p.cast("bolt", { targets: bird }))).ok).toBe(false);

    const paid = await attack(4, [1]).hand(P2, BOLT, "bolt").build();
    await paid.p1.move("raider", "bf1");
    await paid.settle();
    await paid.p1.pick("base");
    await paid.settle();
    const bird2 = birdsOf(paid, P1, "base")[0] as string;
    await paid.advanceTurn();
    await paid.p2.tapRune(); // 1 energy
    await paid.p2.recycleRune(); // 1 fury power
    expect(paid.p2.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    await paid.p2.cast("bolt", { targets: bird2 });
    expect(paid.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // 1 for the bolt + [rainbow] for Deflect
    await paid.settle();
    expect(paid.has(bird2)).toBe(false);
    expect(paid.zoneOf(bird2)).toBe("gone"); // 186.1 — a dead token is in no trash
    expect(paid.p1.trash()).not.toContain(bird2);
  });
});

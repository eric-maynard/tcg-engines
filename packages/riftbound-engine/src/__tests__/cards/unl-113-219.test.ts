/**
 * Master Yi, Tempered — unl-113-219 · Unit (Champion, Master Yi) · Body · 4 energy (no power) · 4 Might
 *
 *   [Hunt 2] (When I conquer or hold, gain 2 XP.)
 *   [Level 6][>] I have [Deflect] and [Ganking]. (While you have 6+ XP, opponents must pay [rainbow]
 *   to choose me with a spell or ability and I can move from battlefield to battlefield.)
 *
 * Rules: 823 (Hunt X ≡ "When I conquer or hold, my controller gains X XP" — a chain trigger; only units
 * PRESENT at the scored battlefield fire, 383.4.c/d), 824 + 727.1.b (Level N is a live "while" gate on
 * the CONTROLLER's XP, 824.1.c.1), 809 (Deflect: +1 power of ANY domain for each opposing choice; the
 * controller is never taxed; a mandatory additional cost, 356.2.a.2), 810 (Ganking only adds the
 * battlefield→battlefield option to the Standard Move — it still exhausts and needs a ready unit).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Threshold is exact and two-sided: 5 XP = plain 4-Might Hunt unit (targetable for free, no
 *     bf→bf move); 6 XP = BOTH Deflect and Ganking at once. Opponent's XP is irrelevant.
 *  2. Self-enabling via HOLD: parked at 4 XP through your Beginning Phase → Hunt 2 → 6 XP, and because
 *     the hold happens before your Main Phase, a READY Yi can gank to the next battlefield that turn.
 *  3. Self-enabling via CONQUER: 4 → 6 after a conquer switches Deflect on for the opponent's replies
 *     that same turn — but Yi is exhausted from the move, so Ganking gives nothing until he readies.
 *  4. Ganking is still a Standard Move: exhausted Yi at 6 XP has no gank; ganking into an enemy-held
 *     battlefield opens a real combat, and winning it is a conquer → another Hunt 2.
 *  5. Deflect is a tax, not immunity: 1 spare power of any domain lets the opponent choose him (and it
 *     is spent); with no power he is simply not a legal choice while a plain ally still is.
 *  6. "While": spending XP below 6 (Keeper of the Hammer, Spend 3 XP) turns both keywords OFF mid-turn.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-113-219";
const KEEPER = "unl-203-219"; // Legend · "When you hold, gain 1 XP. Spend 3 XP, [Exhaust]: Draw 1." — XP sink
const CLEAVE = "ogn-004-298"; // Fury Action, 1 energy: "Give a unit [Assault 3] this turn." — an opposing targeted spell
const SNIPER = "ogn-092-298"; // Mind unit, 6+[mind][mind]: "When you play me, deal 6 to an enemy unit at a battlefield." — an opposing targeted ABILITY

const cleaveTargets = (g: { p2: { option: (v: string, c: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }) =>
  g.p2.option("cast", "cleave")?.fields.find((f) => f.arg === "targets")?.options;

function twoFields(xp: number, meta?: { exhausted?: boolean }) {
  return scenario()
    .xp(P1, xp)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", CARD, "yi", meta);
}

describe("Master Yi, Tempered (unl-113-219)", () => {
  test("registry payload: 4-cost Body champion, 4 Might, no power; Hunt 2 (+ conquer/hold gain-xp 2 triggers) and ONE Level-6 static granting Deflect AND Ganking", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 4, isChampion: true, might: 4, name: "Master Yi, Tempered", tags: ["Master Yi"] });
    expect(def?.powerCost).toBeUndefined();
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(4);
    expect(abilities).toContainEqual({ keyword: "Hunt", type: "keyword", value: 2 });
    expect(abilities).toContainEqual({ effect: { amount: 2, type: "gain-xp" }, trigger: { event: "conquer", on: "self" }, type: "triggered" });
    expect(abilities).toContainEqual({ effect: { amount: 2, type: "gain-xp" }, trigger: { event: "hold", on: "self" }, type: "triggered" });
    expect(abilities).toContainEqual(
      expect.objectContaining({
        condition: { threshold: 6, type: "while-level" },
        effect: expect.objectContaining({ keywords: ["Deflect", "Ganking"], type: "grant-keywords" }),
        type: "static",
      }),
    );
  });

  test("cost: exactly 4 energy and no power; enters the base exhausted as a 4-Might unit whose only keyword (at 0 XP) is Hunt; 3 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "yi").build();
    await game.p1.play("yi");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([]); // no play effect
    await game.settle();
    expect(game.state("yi")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4, zone: "base" });
    expect(game.state("yi").keywords).toEqual(["Hunt"]);
    expect((await scenario().resources(P1, { energy: 3, power: { body: 3 } }).hand(P1, CARD, "y").build()).p1.can("play", "y")).toBe(false);
  });

  test("[Level 6] is exact and reads the CONTROLLER's XP: 0/5 XP → no Deflect, no Ganking; 6/9 XP → both; P2 on 10 XP with P1 on 0 → neither; Might is never touched", async () => {
    for (const [xp, on] of [[0, false], [5, false], [6, true], [9, true]] as const) {
      const game = await twoFields(xp).build();
      expect(game.state("yi").keywords.includes("Deflect")).toBe(on);
      expect(game.state("yi").keywords.includes("Ganking")).toBe(on);
      expect(game.p1.can("gank", "yi")).toBe(on);
      expect(game.state("yi").might).toBe(4);
    }
    const theirs = await twoFields(0).xp(P2, 10).build();
    expect(theirs.state("yi").keywords).toEqual(["Hunt"]);
    expect(theirs.p1.can("gank", "yi")).toBe(false);
  });

  test("[Ganking] at 6 XP: a ready Yi moves battlefield → open battlefield, is exhausted by the move, conquers bf2 (+1 point) and Hunt 2 takes him 6 → 8", async () => {
    const game = await twoFields(6).build();
    await game.p1.gank("yi", "bf2");
    await game.settle();
    expect(game.locationOf("yi")).toBe("bf2");
    expect(game.state("yi").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(8);
    expect(game.violations()).toEqual([]);
  });

  test("negative space — Ganking is only an extra Standard Move option (810.1.c): at 5 XP no bf→bf move is offered at all, and at 6 XP an EXHAUSTED Yi cannot gank either", async () => {
    const five = await twoFields(5).build();
    expect(five.p1.can("gank", "yi")).toBe(false);
    expect((await five.p1.try((p) => p.gank("yi", "bf2"))).ok).toBe(false);
    expect((await five.p1.try((p) => p.move("yi", "bf2"))).ok).toBe(false);
    expect(five.locationOf("yi")).toBe("bf1");

    const tired = await twoFields(6, { exhausted: true }).build();
    expect(tired.state("yi").keywords).toContain("Ganking");
    expect(tired.p1.can("gank", "yi")).toBe(false);
  });

  test("[Ganking] into an ENEMY-held battlefield is a real attack: 4-Might Yi kills a 3-Might defender, survives with the conquer, and Hunt 2 fires again (6 → 8)", async () => {
    const game = await scenario()
      .xp(P1, 6)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3, name: "Warden" }, "warden")
      .unit(P1, "bf1", CARD, "yi")
      .build();
    await game.p1.gank("yi", "bf2");
    expect(game.state("yi").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.locationOf("yi")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.xp()).toBe(8);
  });

  test("[Hunt 2] on CONQUER is self-enabling: at 4 XP Yi walks from base onto an open battlefield, conquers, 4 → 6 XP, and NOW reads Deflect + Ganking (but is exhausted, so no gank this turn)", async () => {
    const game = await scenario().xp(P1, 4).battlefield("bf1", { controller: null }).battlefield("bf2", { controller: null }).unit(P1, "base", CARD, "yi").build();
    expect(game.state("yi").keywords).toEqual(["Hunt"]);
    await game.p1.move("yi", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(6); // exactly +2 (keyword + trigger are one ability, not 2 + 2)
    expect(game.p2.xp()).toBe(0);
    expect([...game.state("yi").keywords].sort()).toEqual(["Deflect", "Ganking", "Hunt"]);
    expect(game.p1.can("gank", "yi")).toBe(false); // exhausted by the move
  });

  test("[Hunt 2] on HOLD is self-enabling in time to use it: 4 XP through P1's Beginning Phase → trigger on the chain → +1 point, 6 XP, and the READY Yi ganks to bf2 in that same main phase", async () => {
    const game = await twoFields(4).turn(2).active(P2).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yi", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(4); // nothing before it resolves
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(6);
    expect(game.state("yi").isReady).toBe(true);
    expect(game.p1.can("gank", "yi")).toBe(true);
    await game.p1.gank("yi", "bf2");
    await game.settle();
    expect(game.locationOf("yi")).toBe("bf2");
    expect(game.p1.xp()).toBe(8); // conquering bf2 is another Hunt 2
  });

  test("negative space — Yi in BASE while an ally conquers, a LOST attack, and the OPPONENT's Beginning Phase all give 0 XP", async () => {
    const idle = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "yi").unit(P1, "base", { might: 2, name: "Scout" }, "scout").build();
    await idle.p1.move("scout", "bf1");
    await idle.settle();
    expect(idle.p1.points()).toBe(1);
    expect(idle.p1.xp()).toBe(0);

    const lost = await scenario().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 6, name: "Wall" }, "wall").unit(P1, "base", CARD, "yi").build();
    await lost.p1.move("yi", "bf1");
    await lost.settle();
    expect(lost.zoneOf("yi")).toBe("trash");
    expect(lost.p1.xp()).toBe(0);

    const theirs = await twoFields(0).turn(3).active(P1).build();
    await theirs.advanceTurn(); // P1 ends → P2's beginning phase: nobody "holds" for P1
    expect(theirs.turnPlayer()).toBe(P2);
    expect(theirs.p1.xp()).toBe(0);
    expect(theirs.p1.points()).toBe(0);
  });

  test("[Deflect] only while levelled: at 5 XP a power-less opponent may Cleave Yi; at 6 XP Yi is not a legal choice for them (a plain ally still is) and nothing is spent", async () => {
    const low = await scenario().active(P2).xp(P1, 5).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "yi").unit(P1, "base", { might: 2, name: "Plain" }, "plain").hand(P2, CLEAVE, "cleave").build();
    expect(cleaveTargets(low)).toEqual(expect.arrayContaining([["yi"], ["plain"]]));
    await low.p2.cast("cleave", { targets: "yi" });
    await low.settle();
    expect(low.state("yi").keywords).toContain("Assault");

    const high = await scenario().active(P2).xp(P1, 6).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "yi").unit(P1, "base", { might: 2, name: "Plain" }, "plain").hand(P2, CLEAVE, "cleave").build();
    expect(cleaveTargets(high)).toEqual([["plain"]]);
    const r = await high.p2.try((p) => p.cast("cleave", { targets: "yi" }));
    expect(r.ok).toBe(false);
    expect(high.zoneOf("cleave")).toBe("hand");
    expect(high.p2.energy()).toBe(1);
  });

  test("[Deflect] is a tax of ONE power of ANY domain (809.1.c.1): at 6 XP an opponent holding 1 chaos may Cleave Yi and that chaos is spent along with the 1 energy", async () => {
    const game = await scenario().active(P2).xp(P1, 6).resources(P2, { energy: 1, power: { chaos: 1 } }).unit(P1, "base", CARD, "yi").hand(P2, CLEAVE, "cleave").build();
    await game.p2.cast("cleave", { targets: "yi" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.state("yi").keywords).toContain("Assault");
  });

  test("[Deflect] also taxes opposing ABILITIES (809.1.c): P2's Sniper ('When you play me, deal 6 to an enemy unit at a battlefield') with no spare power can only pick the plain unit — levelled Yi is never offered and survives; with 1 spare power Yi can be picked, it is spent, and 6 kills him", async () => {
    const mk = (spare: number) =>
      scenario().active(P2).xp(P1, 6).resources(P2, { energy: 6, power: { mind: 2, order: spare } }).battlefield("bf1", { controller: P1 }).battlefield("bf2", { controller: P1 }).unit(P1, "bf1", CARD, "yi").unit(P1, "bf2", { might: 5, name: "Plain" }, "plain").hand(P2, SNIPER, "sniper").build();
    const poor = await mk(0);
    await poor.p2.play("sniper", { to: "base" });
    await poor.settle();
    if (poor.decision()?.kind === "pick") {
      const d = poor.decision();
      expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["plain"]);
      await poor.p2.pick("plain");
      await poor.settle();
    }
    expect(poor.zoneOf("yi")).toBe("battlefield-bf1");
    expect(poor.zoneOf("plain")).toBe("trash");

    const rich = await mk(1);
    await rich.p2.play("sniper", { to: "base" });
    await rich.settle();
    expect(rich.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await rich.p2.pick("yi");
    await rich.settle();
    expect(rich.zoneOf("yi")).toBe("trash");
    expect(rich.p2.power("order")).toBe(0);
  });

  test("[Deflect] never taxes Yi's own controller: at 6 XP P1 Cleaves Yi for exactly 1 energy and no power", async () => {
    const game = await scenario().xp(P1, 6).resources(P1, { energy: 1 }).unit(P1, "base", CARD, "yi").hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "yi" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("yi").grantedKeywords).toContainEqual({ duration: "turn", keyword: "Assault", value: 3 });
  });

  test("controller ≠ owner (824.1.c.1 / 809): a P1-OWNED Yi controlled by P2 reads P2's XP — P2 on 6 → Deflect + Ganking and P1's own power-less Cleave may no longer choose him; P1 on 6 with P2 on 0 → plain", async () => {
    const stolen = await scenario()
      .xp(P1, 0)
      .xp(P2, 6)
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .card("yi", { controller: P2, def: CARD, owner: P1, zone: "bf1" })
      .unit(P2, "base", { might: 1, name: "Plain" }, "plain")
      .hand(P1, CLEAVE, "cleave")
      .build();
    expect(stolen.state("yi")).toMatchObject({ controller: P2, owner: P1 });
    expect([...stolen.state("yi").keywords].sort()).toEqual(["Deflect", "Ganking", "Hunt"]);
    expect(stolen.p1.option("cast", "cleave")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["plain"]]);

    const ownerRich = await scenario().xp(P1, 6).xp(P2, 0).battlefield("bf1", { controller: P2 }).card("yi", { controller: P2, def: CARD, owner: P1, zone: "bf1" }).build();
    expect(ownerRich.state("yi").keywords).toEqual(["Hunt"]);
  });

  test("Level is 'while' (727.1.b / 824.1.c): Keeper of the Hammer spending 3 XP mid-turn (8 → 5) strips Deflect AND Ganking again at once", async () => {
    const game = await twoFields(8).legend(P1, KEEPER, "keeper").build();
    expect([...game.state("yi").keywords].sort()).toEqual(["Deflect", "Ganking", "Hunt"]);
    expect(game.p1.can("gank", "yi")).toBe(true);
    await game.p1.activate("keeper");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1); // the draw proves the XP was spent
    expect(game.p1.xp()).toBe(5);
    expect(game.state("yi").keywords).toEqual(["Hunt"]);
    expect(game.p1.can("gank", "yi")).toBe(false);
  });
});

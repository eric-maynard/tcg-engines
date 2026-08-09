/**
 * Pridestalker — unl-183-219 · Legend (Rengar) · Fury/Body
 *
 *   When you play a unit, give a unit +1 [Might] this turn.
 *
 * Rules: 383.4.a.4 (an ability that triggers when ANOTHER object is played is not a Play Effect — it is
 * an ordinary triggered ability of the legend, put on the chain when your unit is played/finalized),
 * 355.5/355.7 ("a unit" is a targeted choice made as the trigger is finalized; any unit on the board —
 * friendly, enemy, or the unit just played, which is already on the board), no "may" → mandatory,
 * 185.2.a (a unit TOKEN you play is playing a unit), 141 (a spell/gear is not a unit), "you" = the
 * legend's owner playing the unit, "this turn" (expires in the Ending phase), 806/813 + Ambush (a unit
 * played as a Reaction mid-showdown still triggers it, and the +1 lands before combat damage).
 *
 * Head-judge checklist for THIS card:
 *  1. Target menu = every unit on the board incl. the fresh (exhausted) arrival and ENEMY units; no
 *     decline option (mandatory).
 *  2. Uses the chain: nothing changes until the item resolves; the opponent gets priority.
 *  3. Negative space: your spell, your gear, the opponent's unit → no trigger.
 *  4. Two units played → two separate +1s, stackable on one unit; all gone next turn.
 *  5. Tokens: Faithful Manufactor = one trigger for itself + one for the Recruit token it plays.
 *  6. Rengar, Trophy Hunter Ambushed into your own attack: trigger mid-showdown, +1 on the attacker
 *     before damage. Rengar, Unseen accelerated in: 4+1+Assault 2 = 7 kills a 6-Might blocker and
 *     survives, where the bare 4+2 = 6 only trades — the +1 is exactly the margin.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-183-219";
const ROOKIE = { cardType: "unit", domain: "fury", energyCost: 2, might: 2, name: "Rookie" } as const;
const CLEAVE = "ogn-004-298"; // Fury Action spell · 1
const RECURVE_BOW = "sfd-016-221"; // Fury Equipment (gear) · 2
const MANUFACTOR = "ogn-211-298"; // Order unit · 3 · 2 Might · When you play me, play a 1 [Might] Recruit unit token here.
const RENGAR_TROPHY = "unl-120-219"; // Body unit · 5 + [body] · 6 · [Ambush]; may be played to a battlefield with enemy units.
const RENGAR_UNSEEN = "unl-024-219"; // Fury unit · 4 + [fury] · 4 · [Accelerate] [Assault 2] [Deflect] [Ganking]

function withLegend() {
  return scenario().legend(P1, CARD, "ps");
}

const isPsPick = (d: Decision | null): d is PickDecision => d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "ps";

/** Drive prompts: Pridestalker picks → `targets` in order (last one repeats); pass priority/focus; take other forced picks. Returns how many Pridestalker picks were answered. */
async function drive(game: Game, targets: readonly string[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (isPsPick(d)) {
      await game.p1.pick(targets[Math.min(n, targets.length - 1)] as string);
      n += 1;
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d.kind === "pick" && d.options.length > 0) {
      await game.seat(d.seat).pick((d.options[0]?.card ?? d.options[0]?.key) as string);
    } else {
      break;
    }
  }
  return n;
}

describe("Pridestalker (unl-183-219)", () => {
  test("registry payload: Rengar Fury/Body legend with ONE mandatory 'you play a unit' trigger giving a unit +1 Might this turn", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Rengar", domain: ["fury", "body"], name: "Pridestalker" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      trigger: { event: "play-unit", on: { controller: "friendly" } },
      type: "triggered",
    });
    expect((def?.abilities?.[0] as { optional?: boolean }).optional ?? false).toBe(false);
  });

  test("playing a unit puts the trigger on the chain and asks for 'a unit' — every unit on board is offered (bystander, the new arrival, an ENEMY), no decline; +1 lands only on resolution and expires next turn", async () => {
    const game = await withLegend().resources(P1, { energy: 2 }).unit(P1, "base", { might: 3 }, "ally").unit(P2, "base", { might: 3 }, "foe").hand(P1, ROOKIE, "rookie").build();
    await game.p1.play("rookie");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ps", controller: P1, triggered: true })]);
    const d = game.decision();
    expect(isPsPick(d)).toBe(true);
    expect((d as PickDecision).options.map((o) => o.card ?? o.key).toSorted()).toEqual(["ally", "foe", "rookie"]);
    expect((d as PickDecision).allowDecline).toBe(false);
    await game.p1.pick("ally");
    expect(game.state("ally").might).toBe(3); // still on the chain
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // the opponent may respond
    await game.p2.passPriority();
    expect(game.state("ally").might).toBe(4);
    expect(game.state("rookie")).toMatchObject({ isExhausted: true, might: 2, zone: "base" });
    expect(game.violations()).toEqual([]);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(3);
  });

  test("the freshly played unit itself is a legal recipient (2 → 3), and so is an ENEMY unit (3 → 4)", async () => {
    const self = await withLegend().resources(P1, { energy: 2 }).unit(P2, "base", { might: 3 }, "foe").hand(P1, ROOKIE, "rookie").build();
    await self.p1.play("rookie");
    expect(await drive(self, ["rookie"])).toBe(1);
    expect(self.state("rookie").might).toBe(3);
    const enemy = await withLegend().resources(P1, { energy: 2 }).unit(P2, "base", { might: 3 }, "foe").hand(P1, ROOKIE, "rookie").build();
    await enemy.p1.play("rookie");
    expect(await drive(enemy, ["foe"])).toBe(1);
    expect(enemy.state("foe").might).toBe(4);
    expect(enemy.state("rookie").might).toBe(2);
  });

  test("negative space: casting a spell or playing a gear is not playing a unit; the OPPONENT playing a unit is not 'you' — no trigger, no prompt", async () => {
    const spell = await withLegend().resources(P1, { energy: 1 }).unit(P1, "base", { might: 3 }, "ally").hand(P1, CLEAVE, "cleave").build();
    await spell.p1.cast("cleave", { targets: "ally" });
    expect(spell.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    expect(await drive(spell, ["ally"])).toBe(0);
    expect(spell.state("ally").grantedKeywords).toHaveLength(1);

    const gear = await withLegend().resources(P1, { energy: 2 }).unit(P1, "base", { might: 3 }, "ally").hand(P1, RECURVE_BOW, "bow").build();
    await gear.p1.play("bow");
    expect(await drive(gear, ["ally"])).toBe(0);
    expect(gear.zoneOf("bow")).toBe("base");
    expect(gear.state("ally").might).toBe(3);

    const theirs = await withLegend().active(P2).resources(P2, { energy: 2 }).unit(P1, "base", { might: 3 }, "ally").hand(P2, ROOKIE, "theirRookie").build();
    await theirs.p2.play("theirRookie");
    expect(theirs.chain().some((c) => c.cardId === "ps")).toBe(false);
    expect(await drive(theirs, ["ally"])).toBe(0);
    expect(theirs.zoneOf("theirRookie")).toBe("base");
    expect(theirs.state("theirRookie").might).toBe(2);
    expect(theirs.state("ally").might).toBe(3);
  });

  test("two units played this turn → two separate triggers; both +1s may stack on the same unit (3 → 5), and both expire together", async () => {
    const game = await withLegend().resources(P1, { energy: 4 }).unit(P1, "base", { might: 3 }, "ally").hand(P1, ROOKIE, "r1").hand(P1, { ...ROOKIE, name: "Rookie Two" }, "r2").build();
    await game.p1.play("r1");
    expect(await drive(game, ["ally"])).toBe(1);
    expect(game.state("ally").might).toBe(4);
    await game.p1.play("r2");
    expect(await drive(game, ["ally"])).toBe(1);
    expect(game.state("ally").might).toBe(5);
    expect([game.state("r1").might, game.state("r2").might]).toEqual([2, 2]);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(3);
  });

  test("tokens count (185.2.a): Faithful Manufactor = one trigger for the Manufactor + one for the Recruit token it plays → a bystander can collect +2", async () => {
    const game = await withLegend().resources(P1, { energy: 3 }).unit(P1, "base", { might: 3 }, "ally").hand(P1, MANUFACTOR, "manu").build();
    await game.p1.play("manu");
    const answered = await drive(game, ["ally"]);
    const recruit = game.findAll({ name: /Recruit/, owner: P1 }).find((id) => game.locationOf(id) === "base");
    expect(recruit).toBeDefined();
    expect(answered).toBe(2);
    expect(game.state("ally").might).toBe(5);
    expect(game.state("manu").might).toBe(2);
  });

  test("Rengar, Trophy Hunter [Ambush]ed into my own attack: played as a Reaction to the battlefield mid-showdown → Pridestalker asks at once; +1 on the 3-Might attacker before damage; 4 + 6 crush the 4-Might guard and conquer", async () => {
    const game = await withLegend()
      .resources(P1, { energy: 5, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .hand(P1, RENGAR_TROPHY, "rengar")
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("play", "rengar")).toBe(true);
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(isPsPick(game.decision())).toBe(true);
    expect((game.decision() as PickDecision).options.map((o) => o.card ?? o.key).toSorted()).toEqual(["guard", "rengar", "scout"]);
    await game.p1.pick("scout");
    // Let the trigger resolve inside the showdown, then check before combat damage.
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect(game.state("scout").might).toBe(4);
    expect(game.locationOf("rengar")).toBe("bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // Guard (4) assigns its 4 damage among the attackers: at most one of them can have died.
    expect(game.p1.units("bf1").length).toBeGreaterThanOrEqual(1);
    await game.advanceTurn();
    if (game.locationOf("scout") !== undefined) {
      expect(game.state("scout").might).toBe(3); // "this turn" only
    }
  });

  test("Rengar, Unseen accelerated in (enters ready) takes the +1 → 5; attacking a 6-Might blocker he is 5+2 Assault = 7: kills it AND survives (takes 6 < 7) — without the +1 it is a 6-vs-6 trade", async () => {
    const build = () =>
      scenario()
        .resources(P1, { energy: 5, power: { fury: 2 } })
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", { might: 6, name: "Blocker" }, "blocker")
        .hand(P1, RENGAR_UNSEEN, "rengar");
    const game = await build().legend(P1, CARD, "ps").build();
    await game.p1.play("rengar", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(await drive(game, ["rengar"])).toBe(1);
    expect(game.state("rengar")).toMatchObject({ isReady: true, might: 5, zone: "base" });
    await game.p1.move("rengar", "bf1");
    await game.settle();
    expect(game.zoneOf("blocker")).toBe("trash"); // 5 + 2 Assault = 7 ≥ 6
    expect(game.locationOf("rengar")).toBe("bf1"); // took 6 < 7 (Assault counts while attacking)
    expect(game.state("rengar").damage).toBe(0); // healed at combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);

    const plain = await build().build(); // no Pridestalker
    await plain.p1.play("rengar", { accelerate: true });
    await plain.settle();
    expect(plain.state("rengar")).toMatchObject({ isReady: true, might: 4 });
    await plain.p1.move("rengar", "bf1");
    await plain.settle();
    expect(plain.zoneOf("blocker")).toBe("trash"); // 4 + 2 = 6 ≥ 6
    expect(plain.zoneOf("rengar")).toBe("trash"); // took 6 ≥ 6
    expect(plain.p1.points()).toBe(0);
  });

  test("only unit on the board is the one just played: the mandatory choice is forced onto it (2 → 3) — the trigger never fizzles for lack of a bystander", async () => {
    const game = await withLegend().resources(P1, { energy: 2 }).hand(P1, ROOKIE, "rookie").build();
    await game.p1.play("rookie");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ps", triggered: true })]);
    await drive(game, ["rookie"]);
    await game.settle();
    expect(game.state("rookie").might).toBe(3);
    expect(game.chain()).toEqual([]);
  });
});

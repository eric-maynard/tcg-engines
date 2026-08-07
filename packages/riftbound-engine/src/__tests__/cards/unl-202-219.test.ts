/**
 * Void Assault — unl-202-219 · Spell · Body/Chaos · 2 energy + 1 hybrid [body/chaos] power
 *
 *   Move a friendly unit, then move an enemy unit. (If they both move to a battlefield you don't
 *   control, you're the attacker.)
 *
 * Rules: 355.8 (both the friendly AND the enemy unit are targets — with either missing the spell cannot
 * be played), 355.4/355.4.a (each Move gets its own destination: any location other than the unit's
 * current one where it may be — its own side's base or any battlefield), 449/450 (moves by effects; a
 * unit arriving at a battlefield its controller doesn't control contests it), 460/464 (the friendly unit
 * arrives FIRST, so P1 contests and is the attacker when the enemy then arrives — the reminder text),
 * 135.2.e.6.c (the power pip of a two-domain card is payable with EITHER of its domains, not others),
 * 809 (choosing a Deflect enemy adds [rainbow]), 310.1.a (no Action/Reaction: Neutral Open, own turn),
 * 446/"When I move" (an effect-move still fires move triggers of the moved unit — see Nilah's file).
 *
 * Head-judge corner cases for THIS card:
 *   1. ORDER matters and both halves must happen: friendly into enemy-held bf2, then the lone defender
 *      is moved home → no combat at all, the friendly unit simply conquers bf2.
 *   2. Both to an open battlefield: friendly lands first (contests, attacker), enemy second (defender) →
 *      a real combat on P1's turn: 3-Might ally kills 2-Might foe and conquers (+1 point).
 *   3. Dragging an enemy INTO your own defended battlefield makes THEM the attacker on your turn; a
 *      2-Might intruder dies to your 3-Might holder and you keep the battlefield.
 *   4. "Move an enemy unit … to base" sends it to ITS OWNER's base, never yours; the battlefield it
 *      vacated becomes uncontrolled at the next Cleanup (323.6) without anyone scoring.
 *   5. Targets: every (friendly, enemy) pair is offered; no enemy or no friendly unit on the board → not
 *      playable; a Deflect enemy needs one extra power.
 *   6. Cost: 2 energy + one power that must be BODY or CHAOS (fury can't pay); 1 energy can't; timing is
 *      a plain spell — not in a showdown, not on the opponent's turn.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-202-219";

/**
 * Drive the spell to completion: pass priority/focus for everyone and answer each "choose a
 * destination" prompt according to which unit it is for. Returns the units that were asked about.
 */
async function resolveMoves(game: Game, dest: Record<string, string>): Promise<string[]> {
  const asked: string[] = [];
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick") {
      const unit = d.source?.cardId ?? Object.keys(dest).find((u) => d.prompt.includes(`[${u}]`)) ?? "?";
      asked.push(unit);
      const want = dest[unit] ?? "base";
      const key = d.options.find((o) => o.key === want || o.key === `battlefield-${want}`)?.key;
      if (!key) {
        throw new Error(`destination ${want} not offered for ${unit}: ${d.options.map((o) => o.key).join("|")}`);
      }
      await game.seat(d.seat).pick(key);
    } else if (d.kind === "distribute") {
      await game.seat(d.seat).distribute({ ...(d.defaultAllocation ?? {}) });
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return asked;
}

function board(power: Record<string, number> = { rainbow: 1 }) {
  return scenario()
    .resources(P1, { energy: 2, power })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 1, name: "Homebody" }, "homebody")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 2, name: "Lurker" }, "lurker")
    .hand(P1, CARD, "va");
}

describe("Void Assault (unl-202-219)", () => {
  test("registry payload: a plain spell whose effect is a sequence — move a FRIENDLY unit (chosen destination), then move an ENEMY unit (chosen destination)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 2, name: "Void Assault" });
    expect(def?.domain).toEqual(["body", "chaos"]);
    expect(def?.powerCost).toHaveLength(1);
    expect(def?.timing ?? "standard").not.toMatch(/reaction|action/);
    expect(def?.abilities).toEqual([
      {
        effect: {
          effects: [
            { target: { controller: "friendly", type: "unit" }, to: "choose", type: "move" },
            { target: { controller: "enemy", type: "unit" }, to: "choose", type: "move" },
          ],
          type: "sequence",
        },
        type: "spell",
      },
    ]);
  });

  test("cost: 2 energy + 1 power paid with BODY or CHAOS (hybrid pip, 135.2.e.6.c); fury cannot pay it; 1 energy cannot; spell goes to the chain", async () => {
    for (const [power, key] of [[{ body: 1 }, "body"], [{ chaos: 1 }, "chaos"], [{ rainbow: 1 }, "rainbow"]] as const) {
      const game = await board(power).build();
      await game.p1.cast("va", { targets: ["ally", "foe"] });
      expect(game.p1.resources()).toEqual({ energy: 0, power: { [key]: 0 } });
      expect(game.zoneOf("va")).toBe("chain");
    }
    expect((await board({ fury: 1 }).build()).p1.can("cast", "va")).toBe(false);
    expect((await board({}).build()).p1.can("cast", "va")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 1, power: { body: 2 } }).unit(P1, "base", { might: 1 }, "a").unit(P2, "base", { might: 1 }, "e").hand(P1, CARD, "va").build();
    expect(lowEnergy.p1.can("cast", "va")).toBe(false);
  });

  test("targets (355.8): every friendly × enemy pair is offered; with no enemy unit — or no friendly unit — on the board it is not playable", async () => {
    const game = await board().build();
    const pairs = game.p1.option("cast", "va")?.fields.find((f) => f.arg === "targets")?.options as string[][];
    expect(pairs).toHaveLength(4);
    expect(pairs).toEqual(expect.arrayContaining([["ally", "foe"], ["ally", "lurker"], ["homebody", "foe"], ["homebody", "lurker"]]));
    expect(pairs.every(([friendly]) => friendly === "ally" || friendly === "homebody")).toBe(true); // role order: friendly first
    const noEnemy = await scenario().resources(P1, { energy: 2, power: { body: 1 } }).battlefield("bf1").unit(P1, "base", { might: 1 }, "a").hand(P1, CARD, "va").build();
    expect(noEnemy.p1.can("cast", "va")).toBe(false);
    const noFriend = await scenario().resources(P1, { energy: 2, power: { body: 1 } }).battlefield("bf1").unit(P2, "base", { might: 1 }, "e").hand(P1, CARD, "va").build();
    expect(noFriend.p1.can("cast", "va")).toBe(false);
  });

  test("Deflect on the ENEMY target adds [rainbow]: with exactly the printed cost a Deflect foe is unchoosable; one more power makes it legal", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "ally")
      .unit(P2, "base", { keywords: ["Deflect"], might: 2, name: "Slippery" }, "slippery")
      .hand(P1, CARD, "va")
      .build();
    expect(game.p1.can("cast", "va")).toBe(false);
    await game.p1.do("addResources", { power: { fury: 1 } }); // Deflect power may be any domain
    expect(game.p1.can("cast", "va")).toBe(true);
    await game.p1.cast("va", { targets: ["ally", "slippery"] });
    expect(game.p1.power()).toBe(0);
  });

  test("timing: a plain spell — not castable with Focus in a showdown, nor on the opponent's turn", async () => {
    const game = await board().build();
    await game.p1.move("homebody", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "va")).toBe(false);
    expect((await board().active(P2).build()).p1.can("cast", "va")).toBe(false);
  });

  // BUG — expected: the FIRST instruction moves the chosen friendly unit (Ally bf1 → bf3, contesting it),
  // then the enemy (Foe bf2 → bf3) joins as defender; combat: 3 kills 2, P1 conquers bf3 for 1 point.
  // Actual: only the enemy unit is ever given a destination — the friendly move is silently skipped
  // (Ally never leaves bf1), so Foe walks onto bf3 alone and P2 takes it.
  test("both halves resolve in order — friendly first (attacker), enemy second (defender) into open bf3 → combat, P1 conquers", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["ally", "foe"] });
    const asked = await resolveMoves(game, { ally: "bf3", foe: "bf3" });
    expect(asked).toEqual(["ally", "foe"]);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf3");
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("va")).toBe("trash");
  });

  // BUG — expected: Ally moves into enemy-held bf2 (combat pending vs Foe), THEN Foe is moved to its
  // base → bf2 has no defender, no combat happens, Ally conquers bf2 (+1 point), Foe alive at home.
  // Actual: Ally never moves; only Foe goes home; bf2 stays P2's.
  test("order matters — friendly into enemy bf2, then the lone defender sent home → no fight, Ally conquers bf2", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["ally", "foe"] });
    await resolveMoves(game, { ally: "bf2", foe: "base" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.p2.base()).toContain("foe");
    expect(game.locationOf("ally")).toBe("bf2");
    expect(game.state("ally").damage).toBe(0);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  // BUG — same root cause seen from the friendly side alone: a friendly unit in base sent to the open
  // bf3 must arrive there (and, being alone, conquer it). Actual: it stays in base.
  test("'Move a friendly unit' — Homebody base → open bf3 arrives and conquers; the enemy half still resolves too", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["homebody", "lurker"] });
    await resolveMoves(game, { homebody: "bf3", lurker: "bf2" });
    await game.settle();
    expect(game.locationOf("lurker")).toBe("bf2");
    expect(game.locationOf("homebody")).toBe("bf3");
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1);
  });

  test("'then move an enemy unit': the enemy's destination menu is every location but its current one (its base, bf1, bf3 — not bf2), and 'base' means ITS OWNER's base", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["ally", "foe"] });
    let foeMenu: string[] = [];
    for (let i = 0; i < 20; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick") {
        const isFoe = d.source?.cardId === "foe" || d.prompt.includes("[foe]");
        if (isFoe) {
          foeMenu = d.options.map((o) => o.key);
        }
        await game.seat(d.seat).pick(isFoe ? "base" : (d.options.find((o) => o.key.endsWith("bf3"))?.key ?? d.options[0]!.key));
      } else {
        await game.seat(d.seat).pass();
      }
    }
    expect([...foeMenu].sort()).toEqual(["base", "battlefield-bf1", "battlefield-bf3"]);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.state("foe")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.p2.base()).toContain("foe");
    expect(game.p1.base()).not.toContain("foe");
    expect(game.gameState.battlefields.bf2?.controller).toBeNull(); // 323.6: an emptied battlefield is lost at the next Cleanup
    expect(game.p2.points()).toBe(0); // …and nobody scores for that
    expect(game.p1.points()).toBe(1); // P1's only point comes from the friendly half conquering the open bf3
    expect(game.zoneOf("va")).toBe("trash");
  });

  test("dragging an enemy INTO your defended battlefield: the 2-Might Lurker arrives at bf1 as the attacker on YOUR turn, dies to the 3-Might Ally, bf1 stays yours, nobody scores", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["homebody", "lurker"] });
    await resolveMoves(game, { homebody: "bf3", lurker: "bf1" });
    await game.settle();
    expect(game.zoneOf("lurker")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

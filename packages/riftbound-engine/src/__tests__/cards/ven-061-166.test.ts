/**
 * Decree of Insight — ven-061-166 · Spell · Mind · 1 energy (no power pip in the set data)
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Ignore [Deflect] while paying this spell's cost.
 *   Give an enemy Body ([body]) unit -5 [Might] this turn.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - Target legality is a conjunction: ENEMY (controlled by an opponent) AND BODY-domain AND unit.
 *    A friendly Body unit, an enemy Fury unit, or an enemy Body gear are all illegal; with no enemy
 *    Body unit anywhere the spell cannot be played at all (355: a targeted spell needs a target).
 *  - "Ignore [Deflect] while paying this spell's cost" (809.1.c/d): Deflect is a mandatory additional
 *    POWER cost for opponents choosing that unit; this spell skips it — a caster with exactly 1 energy
 *    and NO power may still target a Deflect Body unit and pays only [1].
 *  - -5 Might can drive Might below zero (143.2.b): it is then treated as 0 for combat damage, but the
 *    unit is NOT killed by that alone (143.2.a needs nonzero damage ≥ Might). In combat such a unit
 *    deals 0 and dies to any damage.
 *  - [Reaction] timing (813): playable on the opponent's turn while a chain is open, and inside a
 *    showdown when you hold Focus — the classic use is shrinking an attacking Body unit mid-combat.
 *    LIFO: cast in response, it resolves before the item under it.
 *  - "this turn": the penalty ends in the Expiration Step of the turn it was applied.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-061-166";
const CLEAVE = "ogn-004-298"; // 1-energy Fury Action spell: give a unit [Assault 3] this turn

const targetsOf = (opt: ReturnType<import("../../harness").SeatHandle["option"]>) =>
  (opt?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];

describe("Decree of Insight (ven-061-166)", () => {
  test("costs 1 energy; gives the chosen enemy Body unit -5 Might this turn (6 → 1); the spell goes to the trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P2, "base", { domain: "body", might: 6, name: "Bruiser" }, "bruiser")
      .hand(P1, CARD, "decree")
      .build();
    await game.p1.cast("decree", { targets: "bruiser" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "decree", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.state("bruiser")).toMatchObject({ baseMight: 6, damage: 0, might: 1 });
    expect(game.zoneOf("bruiser")).toBe("base");
    expect(game.zoneOf("decree")).toBe("trash");
    // 0 energy is not enough
    const broke = await scenario().resources(P1, { energy: 0 }).unit(P2, "base", { domain: "body", might: 6 }, "b").hand(P1, CARD, "decree").build();
    expect(broke.p1.can("cast", "decree")).toBe(false);
  });

  test("'this turn': the -5 is gone after the turn ends (back to 6 on the opponent's turn)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P2, "base", { domain: "body", might: 6, name: "Bruiser" }, "bruiser")
      .hand(P1, CARD, "decree")
      .build();
    await game.p1.cast("decree", { targets: "bruiser" });
    await game.settle();
    expect(game.state("bruiser").might).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("bruiser").might).toBe(6);
  });

  test("ENEMY only: your own Body unit is never offered, an enemy Body unit at a battlefield is", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { domain: "body", might: 6, name: "My Bruiser" }, "mine")
      .unit(P2, "bf1", { domain: "body", might: 4, name: "Their Bruiser" }, "theirs")
      .hand(P1, CARD, "decree")
      .build();
    const targets = targetsOf(game.p1.option("cast", "decree"));
    expect(targets).toContainEqual(["theirs"]);
    expect(targets).not.toContainEqual(["mine"]);
    expect((await game.p1.try((p) => p.cast("decree", { targets: "mine" }))).ok).toBe(false);
    expect(game.zoneOf("decree")).toBe("hand");
  });

  test("BODY only — an enemy Fury unit is not a legal target; only the enemy Body unit is offered (registered target has no domain filter)", async () => {
    // Expected: targets == [["bodyFoe"]]. Actual: the set-JSON ability is `{controller:"enemy",
    // type:"unit"}` with no `filter:{domain:"body"}`, so every enemy unit is offered.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P2, "base", { domain: "body", might: 6, name: "Body Foe" }, "bodyFoe")
      .unit(P2, "base", { domain: "fury", might: 6, name: "Fury Foe" }, "furyFoe")
      .hand(P1, CARD, "decree")
      .build();
    expect(targetsOf(game.p1.option("cast", "decree"))).toEqual([["bodyFoe"]]);
    expect((await game.p1.try((p) => p.cast("decree", { targets: "furyFoe" }))).ok).toBe(false);
    expect(game.state("furyFoe").might).toBe(6);
  });

  test("with no enemy BODY unit on the board (only an enemy Mind unit) the spell is not playable at all", async () => {
    // Expected: can("cast") false. Actual: the Mind unit is (wrongly) a legal target, so it is castable.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P2, "base", { domain: "mind", might: 3, name: "Mind Foe" }, "mindFoe")
      .unit(P1, "base", { domain: "body", might: 3, name: "My Body" }, "mine")
      .hand(P1, CARD, "decree")
      .build();
    expect(game.p1.can("cast", "decree")).toBe(false);
  });

  test("no enemy units anywhere: not playable (a targeted spell needs a legal target)", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { domain: "body", might: 3 }, "mine").hand(P1, CARD, "decree").build();
    expect(game.p1.can("cast", "decree")).toBe(false);
  });

  test.failing("BUG: 'Ignore [Deflect] while paying this spell's cost' — a Deflect Body unit is targetable with exactly 1 energy and NO power, and only [1] is paid", async () => {
    // Expected (809.1.d + card text): legal, costs {energy:1}, resolves to 1 Might. Actual: the
    // engine still demands the Deflect power surcharge, so the target is not offered / cast fails.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P2, "base", { domain: "body", keywords: ["Deflect"], might: 6, name: "Warded Bruiser" }, "warded")
      .hand(P1, CARD, "decree")
      .build();
    expect(game.state("warded").keywords).toContain("Deflect");
    expect(targetsOf(game.p1.option("cast", "decree"))).toContainEqual(["warded"]);
    await game.p1.cast("decree", { targets: "warded" });
    expect(game.p1.resources()).toEqual({ energy: 1 - 1, power: {} });
    await game.settle();
    expect(game.state("warded").might).toBe(1);
  });

  test("control for the Deflect case: WITH a spare power the Deflect Body unit is certainly targetable and ends at 1 Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { mind: 1 } })
      .unit(P2, "base", { domain: "body", keywords: ["Deflect"], might: 6, name: "Warded Bruiser" }, "warded")
      .hand(P1, CARD, "decree")
      .build();
    await game.p1.cast("decree", { targets: "warded" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("warded").might).toBe(1);
  });

  test("143.2.a/b: a 3-Might Body unit driven below zero is NOT killed (no damage on it) and stays on the board", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P2, "base", { domain: "body", might: 3, name: "Small Body" }, "small")
      .hand(P1, CARD, "decree")
      .build();
    await game.p1.cast("decree", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("small")).toBe("base");
    expect(game.state("small").damage).toBe(0);
    expect(game.state("small").might).toBeLessThanOrEqual(0);
  });

  test("[Reaction] in a showdown, by the DEFENDER on the attacker's turn: a 5-Might Body attacker shrunk to 0 deals no damage and dies to the 3-Might defender", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .resources(P2, { energy: 1 })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
      .hand(P2, CARD, "decree")
      .unit(P1, "base", { domain: "body", might: 5, name: "Body Attacker" }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "decree")).toBe(true);
    await game.p2.cast("decree", { targets: "atk" });
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash"); // took 3 ≥ 0
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def").damage).toBe(0); // 143.2.b: negative Might contributes 0 combat damage
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("negative space: the same combat WITHOUT the Decree — the 5-Might attacker kills the 3-Might defender and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
      .unit(P1, "base", { domain: "body", might: 5, name: "Body Attacker" }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Reaction] on the opponent's turn in response to their spell: chain [cleave, decree] resolves LIFO — the Decree lands first, then Cleave", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { domain: "body", might: 6, name: "P1 Bruiser" }, "bruiser")
      .hand(P1, CLEAVE, "cleave")
      .hand(P2, CARD, "decree")
      .build();
    expect(game.p2.can("cast", "decree")).toBe(false); // no priority yet on P1's open main phase
    await game.p1.cast("cleave", { targets: "bruiser" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("decree", { targets: "bruiser" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["cleave", "decree"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // decree resolves
    expect(game.state("bruiser").might).toBe(1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["cleave"]);
    await game.settle();
    expect(game.state("bruiser").might).toBe(1);
    expect(game.state("bruiser").keywords).toContain("Assault");
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("trash");
  });

  test("parsed abilities match the printed text — Reaction keyword + a reaction-timed spell giving an ENEMY BODY-DOMAIN unit -5 Might for the turn, and an ignore-Deflect cost marker", async () => {
    // Expected: target `{controller:"enemy", type:"unit", filter:{domain:"body"}}` plus some
    // ignore-Deflect flag. Actual: no domain filter (and the live parser would emit `filter:{tag:"Body"}`),
    // and nothing records the Deflect waiver.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 1, timing: "reaction" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toContainEqual(expect.objectContaining({ keyword: "Reaction", type: "keyword" }));
    const spell = abilities.find((a) => a.type === "spell") as { timing?: string; effect: Record<string, unknown> } | undefined;
    expect(spell).toMatchObject({
      effect: {
        amount: -5,
        duration: "turn",
        target: { controller: "enemy", filter: { domain: "body" }, type: "unit" },
        type: "modify-might",
      },
      timing: "reaction",
      type: "spell",
    });
    expect(JSON.stringify(def)).toMatch(/ignore-?deflect/i);
  });
});

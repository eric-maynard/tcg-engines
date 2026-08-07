/**
 * Mischievous Marai — unl-003-219 · Unit · Fury · 2 energy (no power) · 2 Might
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   When you play me to a battlefield, deal 2 to an enemy unit here.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - The play trigger is CONDITIONAL on the destination: played to my base → nothing at all (no chain
 *    item, no damage anywhere); played to a battlefield → "an enemy unit HERE" only (same battlefield —
 *    never an enemy at another battlefield or in a base). No enemy here → the trigger does nothing and
 *    Marai still enters.
 *  - The realistic way an enemy is "here" is Hidden (811): hide at a battlefield I control for
 *    [rainbow] (no chain, not playable the same turn), then when the opponent attacks that battlefield
 *    on THEIR turn, play Marai from facedown for 0 as a Reaction once Focus passes — she must enter at
 *    that battlefield (811.1.d.1), joins as a defender, and her trigger snipes an attacker before combat
 *    damage. 2 is exactly lethal on a 2-Might attacker; a 4-Might one survives with 2 damage.
 *  - With two attackers the controller CHOOSES which enemy takes the 2.
 *  - Played from facedown on my own later turn with no enemy there: enters at that battlefield for 0
 *    energy, trigger whiffs, enemies elsewhere untouched.
 *  - 811.3: may instead be played normally for 2 energy (to base or a battlefield I control).
 *  - Hide prerequisites: needs a power to pay and a battlefield I CONTROL without a facedown card.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-003-219";

/** P1 controls bf1 (3-Might Holder there); P2 has attackers in base; Marai in P1's hand with 1 rainbow to hide. */
function ambush(attackers: { might: number; name: string; alias: string }[]) {
  const s = scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Far" }, "far")
    .unit(P2, "base", { might: 1, name: "Home" }, "home");
  for (const a of attackers) {
    s.unit(P2, "base", { might: a.might, name: a.name }, a.alias);
  }
  return s.hand(P1, CARD, "marai");
}

describe("Mischievous Marai (unl-003-219)", () => {
  test("parsed abilities match the printed text: Hidden keyword + play-self trigger gated on 'to a battlefield' dealing 2 to an enemy unit here", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 2, might: 2, name: "Mischievous Marai" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { keyword: "Hidden", type: "keyword" },
      {
        condition: { type: "while-at-battlefield" },
        effect: { amount: 2, target: { controller: "enemy", location: "here", type: "unit" }, type: "damage" },
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ]);
  });

  test("cost (811.3, played normally): 2 energy to base, enters exhausted as a 2-Might Hidden unit — and NO trigger, no damage anywhere; 1 energy is not enough", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P2, "base", { might: 2, name: "Home" }, "home")
      .hand(P1, CARD, "marai")
      .build();
    await game.p1.play("marai", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([]); // "to a battlefield" is false → nothing triggers
    await game.settle();
    expect(game.zoneOf("marai")).toBe("base");
    expect(game.state("marai")).toMatchObject({ isExhausted: true, might: 2 });
    expect(game.state("marai").keywords).toContain("Hidden");
    expect(game.state("home").damage).toBe(0);
    expect((await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "marai").build()).p1.can("play", "marai")).toBe(false);
  });

  test("played normally TO A BATTLEFIELD I control with an enemy unit there: trigger on the chain, 2 damage to that unit only ('here'), enemies elsewhere untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "bf1", { might: 3, name: "Intruder" }, "intruder")
      .unit(P2, "bf2", { might: 2, name: "Far" }, "far")
      .unit(P2, "base", { might: 2, name: "Home" }, "home")
      .hand(P1, CARD, "marai")
      .build();
    expect(game.p1.option("play", "marai")?.fields.find((f) => f.arg === "to")?.options).toEqual(expect.arrayContaining(["base", "battlefield-bf1"]));
    await game.p1.play("marai", { to: "bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "marai", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("marai")).toBe("battlefield-bf1");
    expect(game.state("intruder")).toMatchObject({ damage: 2, zone: "battlefield-bf1" }); // 3 Might: one short of lethal
    expect(game.state("far").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
    expect(game.state("holder").damage).toBe(0); // never a friendly unit
  });

  test("to a battlefield with NO enemy there: Marai enters, the trigger has nothing to hit, enemies at bf2/base take nothing, no prompt is left hanging", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 2, name: "Far" }, "far")
      .unit(P2, "base", { might: 2, name: "Home" }, "home")
      .hand(P1, CARD, "marai")
      .build();
    await game.p1.play("marai", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("marai")).toBe("battlefield-bf1");
    expect(game.state("far").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("[Hidden]: hide at bf1 for [rainbow] — facedown, no chain, pool emptied, not playable from there this turn", async () => {
    const game = await ambush([{ alias: "a1", might: 2, name: "A1" }]).build();
    expect(game.p1.can("hide", "marai")).toBe(true);
    await game.p1.hide("marai", "bf1");
    expect(game.zoneOf("marai")).toBe("facedown-bf1");
    expect(game.state("marai").isHidden).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.p1.can("reveal", "marai")).toBe(false);
  });

  test("[Hidden] prerequisites: no power → cannot hide; only an ENEMY-controlled battlefield → cannot hide; bf2 (P2's) is never a legal hide spot", async () => {
    const noPower = await scenario().resources(P1, { energy: 2 }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "marai").build();
    expect(noPower.p1.can("hide", "marai")).toBe(false);
    const enemyBf = await scenario().resources(P1, { power: { rainbow: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "marai").build();
    expect(enemyBf.p1.can("hide", "marai")).toBe(false);
    const game = await ambush([]).build();
    const r = await game.p1.try((p) => p.hide("marai", "bf2"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("marai")).toBe("hand");
  });

  test("the ambush line: hidden at bf1, P2 attacks it next turn with a 2-Might unit; once Focus passes I play Marai for 0 as a Reaction — she enters AT bf1 and the trigger kills the attacker (exactly lethal)", async () => {
    const game = await ambush([{ alias: "a1", might: 2, name: "A1" }]).build();
    await game.p1.hide("marai", "bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("a1", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("reveal", "marai")).toBe(false); // attacker holds Focus first
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "marai")).toBe(true);
    const energy = game.p1.energy();
    await game.p1.reveal("marai");
    expect(game.p1.energy()).toBe(energy); // played for [0]
    await game.settle();
    expect(game.zoneOf("marai")).toBe("battlefield-bf1"); // 811.1.d.1: must be played there
    expect(game.zoneOf("a1")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("far").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("one short: a lone 4-Might attacker takes 2 (survives), then combat — Holder 3 + Marai 2 = 5 vs 4: the attacker dies, my side holds bf1", async () => {
    const game = await ambush([{ alias: "big", might: 4, name: "Big" }]).build();
    await game.p1.hide("marai", "bf1");
    await game.advanceTurn();
    await game.p2.move("big", "bf1");
    await game.p2.passFocus();
    await game.p1.reveal("marai");
    // Trigger resolves first: Big is damaged but alive going into combat.
    for (let i = 0; i < 6 && game.state("big").damage === 0 && game.decision()?.kind === "action"; i++) {
      await game.acting().pass();
    }
    expect(game.state("big")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.units("bf1").length).toBeGreaterThanOrEqual(1);
  });

  test("two attackers here: I choose which enemy takes the 2 — picking the 2-Might one kills it, the 4-Might one is untouched by the trigger", async () => {
    const game = await ambush([
      { alias: "a1", might: 2, name: "A1" },
      { alias: "a2", might: 4, name: "A2" },
    ]).build();
    await game.p1.hide("marai", "bf1");
    await game.advanceTurn();
    await game.p2.move(["a1", "a2"], "bf1");
    await game.p2.passFocus();
    await game.p1.reveal("marai");
    // Pass priority until the target prompt; it must offer exactly the two attackers here.
    for (let i = 0; i < 6 && game.decision()?.kind === "action"; i++) {
      await game.acting().pass();
    }
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card).sort() : [];
    expect(offered).toEqual(["a1", "a2"]);
    await game.p1.pick("a1");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("a1")).toBe("trash");
    expect(game.state("a2").damage).toBe(0);
    expect(game.state("far").damage).toBe(0);
  });

  test("from facedown on MY later turn with no enemy at bf1: enters there for 0 energy, nothing is damaged anywhere", async () => {
    const game = await ambush([{ alias: "a1", might: 2, name: "A1" }]).build();
    await game.p1.hide("marai", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    const energy = game.p1.energy();
    await game.p1.reveal("marai");
    await game.settle();
    expect(game.zoneOf("marai")).toBe("battlefield-bf1");
    expect(game.p1.energy()).toBe(energy);
    for (const u of ["a1", "far", "home"]) {
      expect(game.state(u).damage).toBe(0);
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("negative space — hidden Marai is not a unit on the board: P2 attacking bf1 fights only the Holder if I never reveal (3 vs 4: Holder dies, bf1 conquered, facedown Marai is trashed per 466.5.c)", async () => {
    const game = await ambush([{ alias: "big", might: 4, name: "Big" }]).build();
    await game.p1.hide("marai", "bf1");
    await game.advanceTurn();
    await game.p2.move("big", "bf1");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.state("big").damage).toBe(0); // healed after combat; Marai never dealt 2
    expect(game.zoneOf("marai")).toBe("trash");
  });
});

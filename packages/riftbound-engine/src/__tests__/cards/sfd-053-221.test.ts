/**
 * Janna, Savior — sfd-053-221 · Champion Unit (Janna) · Calm · 3 energy + [calm] · 3 Might
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve, including to a
 *   battlefield you control.)
 *   When you play me, heal your units here, then move up to one enemy unit from here to its base.
 *
 * Rules: 813 / 806.1 (Reaction on a permanent: may be played whenever you hold priority or focus,
 * on any turn, and — for a unit — directly to a battlefield you CONTROL), 383.4.a (play effect goes
 * on the chain after she enters), 418 (heal = clear damage), "here" = Janna's location only,
 * 355.13 ("up to one" → zero is a legal choice), 143.4 (enters exhausted).
 *
 * Judge's corner — trickiest situations for this card:
 *  - Defensive flash-in: the opponent attacks your battlefield with two units; you still CONTROL it
 *    during the showdown, so Janna may be played there, heal the damaged defender and bounce ONE
 *    attacker home before combat damage — the other attacker still fights.
 *  - Bouncing the only attacker ends the combat with no damage dealt; the battlefield stays yours.
 *  - As a chain response: Hextech Ray (deal 3) targets your damaged unit; Janna's play effect is
 *    added above it and resolves first (LIFO), so the heal lands before the 3 damage.
 *  - Scope: only YOUR units HERE are healed (not base units when she lands on a battlefield, not
 *    units elsewhere); only ENEMY units HERE may be moved (never one at another battlefield), and
 *    the moved unit goes to ITS OWNER's base.
 *  - Destinations: base or a battlefield you control — never an enemy-held or uncontrolled one.
 *  - Played to base: heals base units; there is no enemy "here", so no move prompt at all.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-053-221";
const RAY = "ogn-009-298"; // Hextech Ray — [Action] 1 energy + [fury]: Deal 3 to a unit at a battlefield.
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-energy unit (standard timing)

/** P2's turn. P1 holds bf1 with a damaged 4-Might defender; P2 has two attackers in base. */
function defence(attackerMight = 2) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P1, "bf1", { might: 4, name: "Hurt" }, "hurt", { damage: 2 })
    .unit(P1, "base", { might: 4, name: "HomeHurt" }, "homehurt", { damage: 1 })
    .unit(P2, "base", { might: attackerMight, name: "A1" }, "a1")
    .unit(P2, "base", { might: attackerMight, name: "A2" }, "a2")
    .unit(P2, "bf2", { might: 3, name: "Far" }, "far")
    .hand(P1, CARD, "janna");
}

/** P2 attacks bf1 with both units and passes focus; P1 flashes Janna in at bf1. */
async function flashIn(game: Game): Promise<void> {
  await game.p2.move(["a1", "a2"], "bf1");
  await game.p2.passFocus();
  await game.p1.play("janna", { to: "bf1" });
}

describe("Janna, Savior (sfd-053-221)", () => {
  test("cost: 3 energy + 1 calm; 3-Might champion unit, enters exhausted; short of either resource → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).hand(P1, CARD, "janna").build();
    await game.p1.play("janna");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("janna")).toBe("base");
    expect(game.state("janna")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    const noCalm = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "janna").build();
    expect(noCalm.p1.can("play", "janna")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 2, power: { calm: 2 } }).hand(P1, CARD, "janna").build();
    expect(lowEnergy.p1.can("play", "janna")).toBe(false);
  });

  test("[Reaction]: playable in the opponent's neutral open state, while a standard-timing unit in the same hand is not", async () => {
    const game = await defence().hand(P1, FILLER, "slow").resources(P1, { energy: 6, power: { calm: 1 } }).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("play", "janna")).toBe(true);
    expect(game.p1.can("play", "slow")).toBe(false);
    await game.p1.play("janna", { to: "base" });
    await game.settle();
    expect(game.zoneOf("janna")).toBe("base");
    expect(game.turnPlayer()).toBe(P2);
  });

  test("destinations: base or a battlefield you CONTROL — the enemy-held bf2 and the uncontrolled bf3 are not offered", async () => {
    const game = await defence().build();
    const to = game.p1.option("play", "janna")?.fields.find((f) => f.arg === "to")?.options;
    expect(new Set(to as string[])).toEqual(new Set(["base", "battlefield-bf1"]));
    const r = await game.p1.try((p) => p.play("janna", { to: "bf2" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("janna")).toBe("hand");
  });

  test("[Reaction] into your own battlefield mid-showdown: she arrives at bf1 (exhausted) while the attackers are there", async () => {
    const game = await defence().build();
    await flashIn(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.locationOf("janna")).toBe("bf1");
    expect(game.state("janna").isExhausted).toBe(true);
    expect(game.locationOf("a1")).toBe("bf1");
  });

  test.failing("BUG: When you play me — the play effect goes on the chain; heals your units HERE only, then offers only the enemy units HERE", async () => {
    // Expected: a triggered item from janna; after both pass, hurt 2→0 damage (homehurt in base keeps
    // its 1), then a pick among a1/a2 (not far). Actual: the ability is parsed inside a `spell`
    // wrapper, so no trigger is ever created.
    const game = await defence().build();
    await flashIn(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "janna", controller: P1, triggered: true })]);
    await game.settle(); // both pass → resolves: heal, then the move prompt
    expect(game.state("hurt").damage).toBe(0);
    expect(game.state("homehurt").damage).toBe(1);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["a1", "a2"]);
  });

  test.failing("BUG: moving one attacker to ITS base — the other still fights: A2 (2) dies to 7, Hurt + Janna keep bf1", async () => {
    const game = await defence(2).build();
    await flashIn(game);
    await game.settle();
    await game.p1.pick("a1");
    expect(game.zoneOf("a1")).toBe("base");
    expect(game.p2.base()).toContain("a1");
    expect(game.locationOf("a2")).toBe("bf1");
    await game.settle(); // showdown closes → combat: 2 vs 4+3
    expect(game.zoneOf("a2")).toBe("trash");
    expect(game.locationOf("hurt")).toBe("bf1");
    expect(game.locationOf("janna")).toBe("bf1");
    expect(game.locationOf("a1")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test.failing("BUG: 'up to one' — declining moves nobody; both 2-Might attackers fight and die, defenders hold", async () => {
    const game = await defence(2).build();
    await flashIn(game);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.decline();
    expect(game.locationOf("a1")).toBe("bf1");
    expect(game.locationOf("a2")).toBe("bf1");
    await game.settle();
    expect(game.zoneOf("a1")).toBe("trash");
    expect(game.zoneOf("a2")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test.failing("BUG: bouncing the ONLY attacker ends the combat with no damage dealt — a 6-Might attacker never touches the 4-Might defender", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Hurt" }, "hurt", { damage: 2 })
      .unit(P2, "base", { might: 6, name: "Bruiser" }, "bruiser")
      .hand(P1, CARD, "janna")
      .build();
    await game.p2.move("bruiser", "bf1");
    await game.p2.passFocus();
    await game.p1.play("janna", { to: "bf1" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bruiser");
    }
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("base");
    expect(game.locationOf("hurt")).toBe("bf1");
    expect(game.locationOf("janna")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("[Reaction] as a chain response: with Hextech Ray on the chain, Janna can be played once P1 has priority and lands before the Ray resolves", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Hurt" }, "hurt", { damage: 2 })
      .hand(P1, CARD, "janna")
      .hand(P2, RAY, "ray")
      .build();
    await game.p2.cast("ray", { targets: "hurt" });
    expect(game.p1.can("play", "janna")).toBe(false); // P2 (caster) holds priority first
    await game.p2.passPriority();
    expect(game.p1.can("play", "janna")).toBe(true);
    await game.p1.play("janna", { to: "bf1" });
    expect(game.locationOf("janna")).toBe("bf1");
    expect(game.chain().map((c) => c.cardId)).toContain("ray"); // the Ray is still waiting
  });

  test.failing("BUG: …and her heal resolves first (LIFO), so Hurt (4 Might, 2 damage) survives the Ray's 3 damage", async () => {
    // Expected: chain = [ray, janna-trigger]; trigger resolves → hurt 0 damage; Ray → 3 damage, alive.
    // Actual: no trigger; the Ray finds hurt at 2 damage and kills it.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Hurt" }, "hurt", { damage: 2 })
      .hand(P1, CARD, "janna")
      .hand(P2, RAY, "ray")
      .build();
    await game.p2.cast("ray", { targets: "hurt" });
    await game.p2.passPriority();
    await game.p1.play("janna", { to: "bf1" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "janna"]);
    await game.settle();
    expect(game.zoneOf("hurt")).toBe("battlefield-bf1");
    expect(game.state("hurt").damage).toBe(3);
    expect(game.zoneOf("ray")).toBe("trash");
  });

  test.failing("BUG: played to base on your own turn: heals your damaged base units; no enemy is 'here' so nothing is asked", async () => {
    // Expected: homehurt 1→0 with no prompt. Actual: no play effect exists, damage stays.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 4, name: "HomeHurt" }, "homehurt", { damage: 1 })
      .unit(P1, "bf1", { might: 4, name: "FieldHurt" }, "fieldhurt", { damage: 1 })
      .unit(P2, "base", { might: 2, name: "EnemyHome" }, "ehome")
      .hand(P1, CARD, "janna")
      .build();
    await game.p1.play("janna", { to: "base" });
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("ehome")).toBe("base");
    expect(game.state("fieldhurt").damage).toBe(1); // not "here"
    expect(game.state("homehurt").damage).toBe(0);
  });

  test.failing("BUG: parsed ability shape — a top-level play-self trigger with sequence [heal friendly here, move ≤1 enemy here → base]", async () => {
    // Actual: the triggered ability is nested inside `{ type: "spell", timing: "reaction", effect: {…triggered…} }`.
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 3, isChampion: true, might: 3, timing: "reaction" });
    expect(def?.powerCost).toEqual(["calm"]);
    const abilities = (def?.abilities ?? []) as { type?: string; trigger?: { event?: string }; effect?: unknown }[];
    const trig = abilities.find((a) => a.type === "triggered" && a.trigger?.event === "play-self");
    expect(trig).toBeDefined();
    expect(trig?.effect).toMatchObject({
      effects: [
        { target: { controller: "friendly", location: "here" }, type: "heal" },
        { target: { controller: "enemy", location: "here", quantity: { upTo: 1 } }, to: "base", type: "move" },
      ],
      type: "sequence",
    });
    expect(abilities.some((a) => a.type === "spell")).toBe(false);
  });
});

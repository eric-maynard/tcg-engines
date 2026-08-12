/**
 * Core rules — the Combat Cleanup / Resolution Step is an ORDERED SEQUENCE, not "do the things".
 *
 * Rules 466.1 – 466.5 lay the Resolution Step out as numbered steps, and almost every hard combat
 * question ("is the attacker still here when this Deathknell resolves?", "does the Temple see the
 * [Assault] Might?", "does a unit that arrives now get recalled?") is really a question about WHICH
 * STEP HAS ALREADY RUN. `resolve-full-combat.ts` therefore records the steps it performs on the
 * battlefield as `combatCleanupLog`, and this file pins both the order and the 466.3 result matrix
 * against it.
 *
 * The sequence:
 *   465.2      Combat Damage Step — assign, then deal simultaneously
 *   466.1.3a   queue the death triggers of everything carrying lethal damage
 *   466.1.3b   trash those units
 *   466.1.3c   heal ALL units — no location qualifier, so bases and other battlefields too
 *   466.1.3d   recall the Attackers present HERE, iff Defenders are still present
 *   466.2      let the chain that the damage step and the Cleanup produced drain
 *   466.3      classify the result off who is present now (the occupancy matrix below)
 *   466.1.3e   end the Attacker/Defender designations, before the Conquer step
 *   466.4      the result's own triggers ("when I win a combat") drain
 *   466.5      Establish Control / Conquer, or 466.5.b Uncontrolled, or 466.3.d.1 restage
 *
 * The order is load-bearing twice over: 3d runs BEFORE the 466.2 window (a Deathknell resolving
 * there finds the attackers at base — `kogmaw-dk-spares-3d-recalled-attackers`), and a unit that
 * arrives DURING that window was never in step 3d, so nothing recalls it (466.3.d.1 restage —
 * `rengar-4662-restage-fortified-refire`).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

/** Galio, Indefatigable — 6 [Might], [Tank], "I don't deal combat damage": a defender that always lives. */
const GALIO = "unl-171-219";
/** Watchful Sentry — 1 [Might], "[Deathknell] — Draw 1": one chain item in the 466.2 window. */
const SENTRY = "ogn-096-298";
/** Shipyard Skulker — vanilla 3 [Might] attacker. */
const SKULKER = "ogn-175-298";
/** Flash — [Reaction] "Move up to 2 friendly units to base." */
const FLASH = "ogs-011-024";
/** Rengar, Pouncing — [Reaction] [Assault 2] "I can be played to a battlefield you're attacking." */
const RENGAR = "sfd-025-221";
/** Fortified Position — "When you defend here, choose a unit. It gains [Shield 2] this combat." */
const FORTIFIED = "ogn-279-298";

const steps = (game: Game): readonly string[] =>
  (game.gameState.battlefields.bf1 as { combatCleanupLog?: readonly string[] } | undefined)
    ?.combatCleanupLog ?? [];
const bf1 = (game: Game) => game.gameState.battlefields.bf1;
const count = (game: Game, key: string): number => (game.gameState.turnEventCounts ?? {})[key] ?? 0;
/** Index of a step in the trace, or -1. Used to assert ORDER rather than exact contents. */
const at = (game: Game, step: string): number => steps(game).indexOf(step);

describe("466.1 – 466.5 — the Resolution Step runs as an ordered step list", () => {
  test("a plain conquer runs every step exactly once, in rules order, and ends at 466.5.d", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "def")
      .unit(P1, "base", { might: 3, name: "Brute" }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();

    expect(steps(game)).toEqual([
      "465.2:damage-dealt",
      "466.1.3a:queue-deaths",
      "466.1.3b:trash-dead",
      "466.1.3c:heal-all",
      "466.1.3d:no-recall", // 466.1.a.2 — no Defender survived, so nothing is recalled
      "466.2:chain-empty",
      "466.3:attacker-only",
      "466.1.3e:end-designations",
      "466.5.d:conquer",
    ]);
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("step 3d recalls the attacker BEFORE the 466.2 chain window opens — a Deathknell resolving there finds an empty attacking side", async () => {
    // Galio (6, [Tank], deals no combat damage) survives the 3-Might Skulker; the Sentry dies to
    // nothing here — it is the DEFENDER's own body, so use the shape where a defender dies and one
    // lives: the Skulker's 3 is spent on [Tank] Galio, and the Sentry is untouched.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", GALIO, "galio")
      .unit(P1, "base", SKULKER, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();

    // 466.1.a.2 — one attacker was here at the Cleanup and it went home at 3d …
    expect(steps(game)).toContain("466.1.3d:recall-attackers:1");
    expect(game.zoneOf("atk")).toBe("base");
    // … which happened before 466.2 and therefore before 466.3.
    expect(at(game, "466.1.3d:recall-attackers:1")).toBeLessThan(at(game, "466.2:chain-empty"));
    expect(at(game, "466.2:chain-empty")).toBeLessThan(at(game, "466.3:both-recalled"));
    // 466.1.a.1 — 3c heals before 3d moves anyone.
    expect(at(game, "466.1.3c:heal-all")).toBeLessThan(at(game, "466.1.3d:recall-attackers:1"));
  });

  test("a chain item parks the sequence at 466.2 and it resumes at 466.3 — the steps before it are not repeated", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SENTRY, "sentry")
      .unit(P1, "base", SKULKER, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();

    // Parked with the Sentry's [Deathknell] on the chain: the Cleanup is DONE, the result is not read.
    expect(steps(game)).toEqual([
      "465.2:damage-dealt",
      "466.1.3a:queue-deaths",
      "466.1.3b:trash-dead",
      "466.1.3c:heal-all",
      "466.1.3d:no-recall",
      "466.2:chain-window",
    ]);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "sentry", controller: P2, triggered: true }),
    ]);

    await game.settle();
    // The resumed pass appends only the steps that were still owed — 3a…3d are not re-run.
    expect(steps(game)).toEqual([
      "465.2:damage-dealt",
      "466.1.3a:queue-deaths",
      "466.1.3b:trash-dead",
      "466.1.3c:heal-all",
      "466.1.3d:no-recall",
      "466.2:chain-window",
      "466.3:attacker-only",
      "466.1.3e:end-designations",
      "466.5.d:conquer",
    ]);
    expect(game.violations()).toEqual([]);
  });

  test("466.1.3c has no location qualifier: the Cleanup heals a damaged unit standing at another battlefield", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "def")
      .unit(P2, "bf2", { might: 5, name: "Bystander" }, "bystander", { damage: 2 })
      .unit(P1, "base", { might: 3, name: "Brute" }, "atk")
      .build();
    expect(game.state("bystander").damage).toBe(2);
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(steps(game)).toContain("466.1.3c:heal-all");
    expect(game.state("bystander").damage).toBe(0);
  });
});

describe("466.3 — the occupancy matrix, one row per pattern", () => {
  test("attacker only ⇒ 466.3.a the Attacker won ⇒ 466.5.d Conquer", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "def")
      .unit(P1, "base", { might: 3, name: "Brute" }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(steps(game)).toContain("466.3:attacker-only");
    expect(steps(game)).toContain("466.5.d:conquer");
    expect(count(game, "win-combat|p:player-1|bf:bf1")).toBe(1);
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("defender only ⇒ 466.3.b the Defender won; it already held bf1, so 466.5 keeps control and scores nothing", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "def")
      .unit(P1, "base", { might: 1, name: "Runt" }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(steps(game)).toContain("466.3:defender-only");
    expect(steps(game)).toContain("466.5:control-kept");
    expect(count(game, "win-combat|p:player-2|bf:bf1")).toBe(1);
    expect(count(game, "conquer")).toBe(0);
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(0);
  });

  test("both sides still here and the attacker owes step 3d its recall ⇒ 466.3.d No Result: nobody wins, nothing restages", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", GALIO, "galio")
      .unit(P1, "base", SKULKER, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(steps(game)).toContain("466.3:both-recalled");
    expect(steps(game)).not.toContain("466.3.d.1:restage");
    expect(count(game, "win-combat")).toBe(0);
    expect(count(game, "conquer")).toBe(0);
    expect(game.zoneOf("atk")).toBe("base");
    expect(game.zoneOf("galio")).toBe("battlefield-bf1");
    expect(bf1(game)).toMatchObject({ contested: false, controller: P2 });
  });

  test("neither side left (both died to combat damage) ⇒ 466.3.d No Result ⇒ 466.5.b bf1 goes UNCONTROLLED", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Wall" }, "def")
      .unit(P1, "base", { might: 3, name: "Brute" }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("trash");
    expect(steps(game)).toContain("466.3:neither");
    expect(steps(game)).toContain("466.5.b:uncontrolled");
    expect(count(game, "win-combat")).toBe(0);
    expect(bf1(game)).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("both players pull their units out during the showdown ⇒ no Combat Damage Step, but the Cleanup still runs 3c and 466.5.b still gives bf1 up", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .resources(P1, { energy: 4, power: { chaos: 2 } })
      .resources(P2, { energy: 4, power: { chaos: 2 } })
      .unit(P2, "bf1", { might: 4, name: "Wall" }, "def")
      .unit(P1, "base", { might: 4, name: "Brute" }, "atk")
      .unit(P1, "bf2", { might: 5, name: "Bystander" }, "bystander", { damage: 2 })
      .hand(P1, FLASH, "flash1")
      .hand(P2, FLASH, "flash2")
      .build();
    await game.p1.move("atk", "bf1");
    // Both Flashes go on the chain before either resolves, so neither side is left holding bf1
    // alone at any point: when the Showdown closes the battlefield is simply empty (465.1).
    await game.p1.cast("flash1", { targets: ["atk"] });
    await game.p1.passPriority();
    await game.p2.cast("flash2", { targets: ["def"] });
    await game.settle();

    expect(game.zoneOf("atk")).toBe("base");
    expect(game.zoneOf("def")).toBe("base");
    // ruling 1d48a08b476ab235 — an emptied battlefield does not skip the Combat Cleanup: 3c has no
    // location qualifier, so the damaged unit standing at bf2 is healed all the same.
    expect(steps(game)).toEqual(["466.1.3c:heal-all", "466.3:neither", "466.5:uncontrolled"]);
    expect(game.state("bystander").damage).toBe(0);
    expect(bf1(game)).toMatchObject({ contested: false, controller: null });
    expect(game.violations()).toEqual([]);
  });

  test("both players present but NO recall is owed — the only attacker arrived after step 3d ⇒ 466.3.d No Result and 466.3.d.1 restages a fresh Showdown + Combat", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 3, rainbow: 3 } })
      .resources(P2, { energy: 6, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P2, def: FORTIFIED, inert: false })
      .unit(P2, "bf1", { might: 9, name: "Bulwark" }, "bulwark")
      .unit(P2, "bf1", SENTRY, "sentry")
      .unit(P1, "base", { might: 8, name: "Mega-Mech" }, "mech")
      .hand(P1, RENGAR, "rengar")
      .autoProcedures(false)
      .build();
    await game.p1.move("mech", "bf1");
    await game.p2.pick("bulwark"); // Fortified Position's [Shield 2] — the Bulwark defends at 11
    await game.settle();
    await game.p1.choose("resolveFullCombat:bf1");
    await game.p1.distribute({ bulwark: 7, sentry: 1 }); // 465.2.c.3 — 1 is lethal for the Sentry
    await game.p1.choose("resolveFullCombat:bf1");

    // The Mega-Mech died; the Sentry's [Deathknell] holds the 466.2 window open with a defender alive.
    expect(steps(game)).toContain("466.2:chain-window");
    expect(steps(game)).toContain("466.1.3d:recall-attackers:0"); // nothing of P1's was here at 3d
    expect(game.zoneOf("mech")).toBe("trash");
    // Rengar is played INTO that window — it was never in step 3d, so nothing recalls it.
    await game.p2.passPriority();
    await game.p1.play("rengar", { to: "bf1" });
    await game.settle();
    await game.p1.choose("resolveFullCombat:bf1");

    expect(steps(game)).toContain("466.3:both-restage");
    expect(steps(game)).toContain("466.3.d.1:restage");
    expect(count(game, "conquer")).toBe(0);
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(bf1(game)?.contested).toBe(true);
  });
});

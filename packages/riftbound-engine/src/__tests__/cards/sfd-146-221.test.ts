/**
 * Vex, Cheerless — sfd-146-221 · Champion Unit · Chaos · 5 energy + [chaos] · 5 Might · Vex
 *
 *   While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and enemy
 *   spells cost [1][rainbow] more.
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. "In combat" means Vex herself holds an Attacker or Defender designation (464.2.c.3 / 466.7.a).
 *     Not: sitting in the base while a friend fights, standing at a battlefield outside combat, or a
 *     NON-combat showdown she opened by walking onto an empty enemy battlefield.
 *  2. Only Action/Reaction-speed spells can be played while she is in combat, and "friendly"/"enemy"
 *     are relative to Vex's controller — on the opponent's turn (Vex defending) the ATTACKER pays the
 *     surcharge and Vex's controller still gets the discount once Focus reaches them.
 *  3. The discount is [1] energy AND one power pip of any domain; "to a minimum of [1]" floors the
 *     ENERGY at 1 (356.4.e) — a 1-cost spell stays 1, a 2-cost spell becomes 1, 3+[fury] becomes 2.
 *  4. The surcharge is +[1] energy and +1 power payable with ANY domain (an added [rainbow] pip,
 *     356.3): an opponent holding exactly the printed cost cannot cast at all.
 *  5. Ordering with Deflect (356.2 → 356.4): the Deflect [rainbow] surcharge on an enemy target is
 *     added first and Vex's [rainbow] discount then eats it — a 2-cost powerless spell aimed at a
 *     defending Pouty Poro costs exactly [1] and no power.
 *  6. The moment combat ends (she conquers) the aura is off again within the same turn.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-146-221";
const POUTY_PORO = "ogn-013-298"; // 2-Might unit with [Deflect]
const spell = (name: string, energyCost: number, powerCost: string[] = []) => ({
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost,
  name,
  powerCost,
  timing: "action",
});
const BOLT = spell("Test Bolt", 3, ["fury"]); // 3 + [fury], Action, deal 1
const TWO = spell("Test Two", 2); // 2, Action, deal 1
const ONE = spell("Test One", 1); // 1, Action, deal 1

/** P1: Vex in base, a 2-Might target dummy in base; P2 holds bf1 with one 2-Might defender. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "vex")
    .unit(P1, "base", { might: 2, name: "Dummy" }, "dummy")
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home");
}

describe("Vex, Cheerless (sfd-146-221)", () => {
  test("cost: 5 energy + 1 chaos for a 5-Might champion unit; short a chaos or an energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { chaos: 1 } }).hand(P1, CARD, "vex").build();
    await game.p1.play("vex");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("vex")).toBe("base");
    expect(game.state("vex")).toMatchObject({ isExhausted: true, might: 5 });
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "vex").build()).p1.can("play", "vex")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "vex").build()).p1.can("play", "vex")).toBe(false);
  });

  test("negative space: Vex idle in the base — a friendly spell on your own turn costs its full 3 + [fury]", async () => {
    const game = await board().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, BOLT, "bolt").build();
    await game.p1.cast("bolt", { targets: "home" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    const short = await board().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, BOLT, "bolt").build();
    expect(short.p1.can("cast", "bolt")).toBe(false);
  });

  test("Vex attacking: during the combat showdown a friendly 3+[fury] spell costs 2 and no power", async () => {
    const game = await board().resources(P1, { energy: 2 }).hand(P1, BOLT, "bolt").build();
    expect(game.p1.can("cast", "bolt")).toBe(false); // not yet in combat: 2 energy, no fury is short
    await game.p1.move("vex", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("vex").combatRole).toBe("attacker");
    expect(game.p1.can("cast", "bolt")).toBe(true);
    await game.p1.cast("bolt", { targets: "def" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("def")).toBe("trash"); // 1 from the bolt + 5 in combat
  });

  test("'to a minimum of [1]': a 1-cost spell still costs 1 (never free) and a 2-cost spell drops to exactly 1", async () => {
    const one = await board().resources(P1, { energy: 1 }).hand(P1, ONE, "one").build();
    await one.p1.move("vex", "bf1");
    await one.p1.cast("one", { targets: "def" });
    expect(one.p1.energy()).toBe(0);
    const broke = await board().resources(P1, { energy: 0 }).hand(P1, ONE, "one").build();
    await broke.p1.move("vex", "bf1");
    expect(broke.p1.can("cast", "one")).toBe(false);
    const two = await board().resources(P1, { energy: 1 }).hand(P1, TWO, "two").build();
    await two.p1.move("vex", "bf1");
    await two.p1.cast("two", { targets: "def" });
    expect(two.p1.energy()).toBe(0);
  });

  test("enemy spells cost [1][rainbow] more while she attacks: the opponent pays 4 + [fury] + one power of ANY domain", async () => {
    const game = await board().resources(P2, { energy: 4, power: { calm: 1, fury: 1 } }).hand(P2, BOLT, "ebolt").build();
    await game.p1.move("vex", "bf1");
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("ebolt", { targets: "dummy" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
  });

  test("negative space: an opponent holding exactly the printed 3 + [fury] (or 4 + [fury] with no spare power) cannot cast while Vex is in combat", async () => {
    const exact = await board().resources(P2, { energy: 3, power: { fury: 2 } }).hand(P2, BOLT, "ebolt").build();
    await exact.p1.move("vex", "bf1");
    await exact.p1.passFocus();
    expect(exact.actingSeat()).toBe(P2);
    expect(exact.p2.can("cast", "ebolt")).toBe(false);
    const noSparePip = await board().resources(P2, { energy: 4, power: { fury: 1 } }).hand(P2, BOLT, "ebolt").build();
    await noSparePip.p1.move("vex", "bf1");
    await noSparePip.p1.passFocus();
    expect(noSparePip.p2.can("cast", "ebolt")).toBe(false);
    // ...whereas with Vex NOT in combat (P2's own turn, open state) the printed cost is enough.
    const calm = await board().active(P2).resources(P2, { energy: 3, power: { fury: 1 } }).hand(P2, BOLT, "ebolt").build();
    await calm.p2.cast("ebolt", { targets: "dummy" });
    expect(calm.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("Vex DEFENDING on the opponent's turn: the attacker's spell is taxed (+1 +any pip), her controller's is discounted", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 8, power: { fury: 3 } })
      .resources(P1, { energy: 8, power: { fury: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "vex")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P2, BOLT, "ebolt")
      .hand(P1, BOLT, "fbolt")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("vex").combatRole).toBe("defender");
    await game.p2.cast("ebolt", { targets: "vex" }); // 4 energy + fury + 1 more (paid from fury)
    expect(game.p2.resources()).toEqual({ energy: 4, power: { fury: 1 } });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("vex").damage).toBe(1);
    if (game.actingSeat() === P2) {
      await game.p2.passFocus();
    }
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("fbolt", { targets: "raider" }); // 2 energy, pip waived
    expect(game.p1.resources()).toEqual({ energy: 6, power: { fury: 3 } });
  });

  test("negative space: a friend fights at bf1 while Vex stays home — no discount (she is not the one in combat)", async () => {
    const game = await board().resources(P1, { energy: 3, power: { fury: 1 } }).unit(P1, "base", { might: 2, name: "Scout" }, "scout").hand(P1, BOLT, "bolt").build();
    await game.p1.move("scout", "bf1");
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("vex").combatRole).toBeNull();
    await game.p1.cast("bolt", { targets: "def" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("negative space: Vex walks onto an EMPTY enemy battlefield — a showdown opens but it is not combat, so full price", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "vex")
      .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.move("vex", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("vex").combatRole).toBeNull();
    await game.p1.cast("bolt", { targets: "home" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("the aura switches off when combat ends: after Vex conquers, a spell later that turn costs the full 3 + [fury]", async () => {
    const game = await board().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, BOLT, "bolt").build();
    await game.p1.move("vex", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("vex").combatRole).toBeNull();
    expect((game.decision() as ActionDecision).context).toBe("main");
    await game.p1.cast("bolt", { targets: "home" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("Deflect then discount (356.2 → 356.4): a 2-cost powerless spell at a defending Pouty Poro costs exactly 1 energy and no power", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "vex")
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .hand(P1, TWO, "two")
      .build();
    expect(game.p1.can("cast", "two")).toBe(false); // at rest: 2 + [rainbow] for the poro, unaffordable
    await game.p1.move("vex", "bf1");
    await game.p1.cast("two", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash"); // 1 + 5 combat damage
    // Control: without Vex the same cast needs 2 energy AND a power for Deflect.
    const noVex = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .hand(P1, TWO, "two")
      .build();
    await noVex.p1.move("bruiser", "bf1");
    const atPoro = await noVex.p1.try((p) => p.cast("two", { targets: "poro" }));
    expect(atPoro.ok).toBe(false);
    expect(noVex.zoneOf("two")).toBe("hand");
  });

  test("parsed abilities match the printed text: one static, condition in-combat, [friendly spells −[1][rainbow] min [1] | enemy spells +[1][rainbow]]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 5, isChampion: true, might: 5, powerCost: ["chaos"], tags: ["Vex"] });
    const abilities = (def?.abilities ?? []) as { type: string; condition?: unknown; effect?: { type: string; effects?: Record<string, unknown>[] } }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ condition: { type: "in-combat" }, type: "static" });
    const effects = abilities[0]?.effect?.type === "sequence" ? (abilities[0].effect.effects ?? []) : [abilities[0]?.effect as Record<string, unknown>];
    const less = effects.find((e) => e.type === "cost-reduction");
    const more = effects.find((e) => e.type === "cost-increase");
    expect(less).toMatchObject({ target: { controller: "friendly", type: "spell" } });
    expect(more).toMatchObject({ target: { controller: "enemy", type: "spell" } });
    // Amounts decode to 1 energy + 1 any-domain pip; the floor decodes to 1 energy.
    const amount = (v: unknown) => JSON.stringify(v ?? null);
    expect(amount(less?.by ?? less?.amount ?? less?.reduction)).toMatch(/1/);
    expect(amount(less?.by ?? less?.amount ?? less?.reduction)).toMatch(/rainbow/);
    expect(amount(less?.minimum)).toMatch(/1/);
    expect(amount(more?.by ?? more?.amount ?? more?.increase)).toMatch(/rainbow/);
  });
});

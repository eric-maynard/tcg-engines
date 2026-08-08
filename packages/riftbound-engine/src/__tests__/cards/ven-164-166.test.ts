/**
 * Sandswept Tomb — ven-164-166 · Battlefield
 *
 *   Each spell that chooses one or more units here that are friendly to it costs [rainbow] less.
 *
 * Rules: 356.4 (discounts — "cost [amount] less"; applied while the cost is determined during the
 * play, 356.4.b), [rainbow] = one power of any domain, so exactly ONE power pip is waived and Energy is
 * never touched, 355.8 / 359.2 (a spell "chooses" its targets as it is played — the discount is decided
 * per play from the targets actually chosen), 740.1.a ("friendly TO IT" = controlled by the SPELL's
 * controller — the caster — not by the battlefield's controller or owner), 053.3 ("here" = at this
 * battlefield), 364 (an unconditional passive: "each spell" — either player's — regardless of who
 * controls the Tomb), "one or more" (a spell choosing two units here is still discounted once).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Target-dependent affordability: with 4 energy and NO power, Primal Strength (4 + [body]) is
 *     castable — but only on the friendly unit here; the base unit and the enemy unit here are not
 *     affordable targets.
 *  2. "friendly to it": P1's spell on P2's unit standing at the Tomb gets nothing; P2's spell on that
 *     same unit (on P2's turn) IS discounted, even though P1 controls the Tomb.
 *  3. Only a power pip: a discounted 4 + [body] still needs all 4 energy; a spell with no power cost
 *     gains nothing; a two-pip spell still owes one pip.
 *  4. Two-role spells (Challenge: a friendly unit AND an enemy unit): the friendly-here half is enough
 *     for the discount, and it is one [rainbow] however many units here are chosen.
 *  5. Choosing a BATTLEFIELD (Siphon Power "Choose a battlefield…") is not choosing units here.
 *  6. Engine status: the set-JSON card carries no abilities at all (`abilities: []`, parseSuccess
 *     false) — no discount is ever applied. Positive clauses below are BUG tests.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-164-166";
const PRIMAL_STRENGTH = "ogn-154-298"; // [Action] 4 + [body]: give a unit +7 Might this turn
const CHALLENGE = "ogn-128-298"; // [Action] 2 + [body]: choose a friendly unit and an enemy unit; they trade Might damage
const LAST_BREATH = "ogn-260-298"; // [Action] 3 + [rainbow][rainbow]: ready a friendly unit; it deals its Might to an enemy at a battlefield
const SIPHON_POWER = "ogn-266-298"; // [Reaction] 2 + [rainbow]: choose a battlefield; friendly units there +1 / enemies -1

function board(res: { energy?: number; power?: Record<string, number> } = { energy: 4, power: { body: 1 } }) {
  return scenario()
    .resources(P1, res)
    .battlefield("tomb", { controller: P1, def: CARD, inert: false })
    .battlefield("plain", { controller: P2 })
    .unit(P1, "tomb", { might: 2, name: "Mine Here" }, "mineHere")
    .unit(P2, "tomb", { might: 2, name: "Theirs Here" }, "theirsHere")
    .unit(P1, "base", { might: 2, name: "Home" }, "home")
    .unit(P2, "plain", { might: 2, name: "Far Foe" }, "farFoe")
    .hand(P1, PRIMAL_STRENGTH, "ps");
}

function targetsOf(game: { p1: { option(v: string, c: string): { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }, card: string) {
  return (game.p1.option("cast", card)?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
}

describe("Sandswept Tomb (ven-164-166)", () => {
  // BUG — expected (356.4): choosing MY unit at the Tomb waives Primal Strength's [body] pip — 4 energy
  // paid, the body power left untouched, +7 lands. Actual: no ability on the card; the pip is spent.
  test.failing("BUG: a spell choosing a friendly unit here costs [rainbow] less — Primal Strength on Mine Here pays 4 energy and keeps the body power", async () => {
    const game = await board().build();
    await game.p1.cast("ps", { targets: "mineHere" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } });
    await game.settle();
    expect(game.state("mineHere").might).toBe(9);
    expect(game.zoneOf("ps")).toBe("trash");
  });

  // BUG — expected: with 4 energy and NO power the spell is castable, and the ONLY affordable target is
  // the friendly unit here (base unit / enemy unit here would need the pip). Actual: not castable at all.
  test.failing("BUG: target-dependent affordability — 4 energy, 0 power: castable, and only onto the friendly unit here", async () => {
    const game = await board({ energy: 4 }).build();
    expect(game.p1.can("cast", "ps")).toBe(true);
    expect(targetsOf(game, "ps")).toEqual([["mineHere"]]);
    await game.p1.cast("ps", { targets: "mineHere" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("ps")).toBe("chain");
  });

  test("negative space — 'friendly TO IT': the same spell on the ENEMY unit standing here, or on my unit in the base, pays the full 4 + [body]", async () => {
    const enemyHere = await board().build();
    await enemyHere.p1.cast("ps", { targets: "theirsHere" });
    expect(enemyHere.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    const atHome = await board().build();
    await atHome.p1.cast("ps", { targets: "home" });
    expect(atHome.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    // and with no power at all neither of those targets is castable
    const broke = await board({ energy: 4 }).build();
    expect((await broke.p1.try((p) => p.cast("ps", { targets: "theirsHere" }))).ok).toBe(false);
    expect((await broke.p1.try((p) => p.cast("ps", { targets: "home" }))).ok).toBe(false);
  });

  test("negative space — only a power pip is waived, never Energy: 3 energy + [body] cannot cast Primal Strength even onto the friendly unit here", async () => {
    const game = await board({ energy: 3, power: { body: 1 } }).build();
    expect(game.p1.can("cast", "ps")).toBe(false);
    expect((await game.p1.try((p) => p.cast("ps", { targets: "mineHere" }))).ok).toBe(false);
  });

  // BUG — expected (364 "each spell" + 740.1.a): the discount keys on the SPELL's controller, not the
  // Tomb's — P2's Primal Strength on P2's own unit at P1's Tomb, on P2's turn, keeps P2's body power.
  test.failing("BUG: 'each spell' — the opponent's spell on THEIR unit here is discounted too, whoever controls the Tomb", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { body: 1 } })
      .battlefield("tomb", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "tomb", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "tomb", { might: 2, name: "Theirs Here" }, "theirsHere")
      .hand(P2, PRIMAL_STRENGTH, "ps2")
      .build();
    await game.p2.cast("ps2", { targets: "theirsHere" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 1 } });
    await game.settle();
    expect(game.state("theirsHere").might).toBe(9);
  });

  // BUG — expected ("one or more units here that are friendly to it"): Challenge chooses a friendly unit
  // (here) and an enemy unit (anywhere) — the friendly-here choice alone earns the single [rainbow]
  // discount: 2 energy paid, body kept; then 2 and 2 trade damage and both die.
  test.failing("BUG: a two-role spell (Challenge) whose FRIENDLY choice is here is discounted once — 2 energy, body power kept", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .battlefield("tomb", { controller: P1, def: CARD, inert: false })
      .unit(P1, "tomb", { might: 2, name: "Mine Here" }, "mineHere")
      .unit(P2, "base", { might: 2, name: "Lurker" }, "lurker")
      .hand(P1, CHALLENGE, "ch")
      .build();
    await game.p1.cast("ch", { targets: ["mineHere", "lurker"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } });
    await game.settle();
    expect(game.zoneOf("lurker")).toBe("trash");
    expect(game.zoneOf("mineHere")).toBe("trash");
  });

  // BUG — expected: exactly ONE pip is waived — Last Breath (3 + [rainbow][rainbow]) readying my unit here
  // still owes one power: with 3 energy + 1 power it is castable and spends that one power.
  // Actual: no discount, so 1 power is one short and the cast is refused.
  test.failing("BUG: a two-pip spell choosing a friendly unit here still owes exactly one pip (3 energy + 1 power suffices)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .battlefield("tomb", { controller: P1, def: CARD, inert: false })
      .unit(P1, "tomb", { might: 3, name: "Mine Here" }, "mineHere", { exhausted: true })
      .unit(P2, "tomb", { might: 2, name: "Theirs Here" }, "theirsHere")
      .hand(P1, LAST_BREATH, "lb")
      .build();
    expect(game.p1.can("cast", "lb")).toBe(true);
    await game.p1.cast("lb", { targets: ["mineHere", "theirsHere"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("negative space — choosing a BATTLEFIELD is not choosing units here: Siphon Power on the Tomb pays its full 2 + [rainbow]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("tomb", { controller: P1, def: CARD, inert: false })
      .unit(P1, "tomb", { might: 2, name: "Mine Here" }, "mineHere")
      .unit(P2, "tomb", { might: 3, name: "Theirs Here" }, "theirsHere")
      .hand(P1, SIPHON_POWER, "si")
      .build();
    expect(targetsOf(game, "si")).toEqual([["tomb"]]);
    await game.p1.cast("si", { targets: "tomb" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.state("mineHere").might).toBe(3);
    expect(game.state("theirsHere").might).toBe(2);
    const short = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("tomb", { controller: P1, def: CARD, inert: false })
      .unit(P1, "tomb", { might: 2, name: "Mine Here" }, "mineHere")
      .hand(P1, SIPHON_POWER, "si")
      .build();
    expect(short.p1.can("cast", "si")).toBe(false);
  });

  test("the Tomb is otherwise inert: no chain items, no Might changes, holding it is a plain +1 point", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("tomb", { controller: P1, def: CARD, inert: false }).unit(P1, "tomb", { might: 2, name: "Mine Here" }, "mineHere").build();
    expect(game.state("mineHere").might).toBe(2);
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // BUG — expected: the payload should carry the printed static — a cost-reduction of one [rainbow]
  // (power 1, any domain) scoped to spells that choose ≥1 unit here friendly to the spell. Actual: the
  // VEN set-JSON entry has no abilities at all (parseSuccess: false), so the registry sees a blank card.
  test.failing("BUG: registry payload — a static [rainbow] cost-reduction for spells choosing friendly units here (currently no abilities at all)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Sandswept Tomb" });
    const abilities = (def?.abilities ?? []) as { type: string; effect?: { type?: string } }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ effect: { type: "cost-reduction" }, type: "static" });
    const s = JSON.stringify(abilities[0]);
    expect(s).toContain('"spell"');
    expect(s).toContain('"here"');
    expect(s).toMatch(/rainbow|power/);
  });
});

/**
 * Interaction: Acceptable Losses (ogn-179-298) · Spell · Chaos · 1 energy · Action
 *     "Each player kills one of their gear."
 *   × Gold (unl-t05) · Gear token — "[Reaction][>] Kill this, [Exhaust]: [Add] [rainbow]."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2 — "[Hidden] If a friendly unit would die, kill
 *     this instead. Heal that unit, exhaust it, and recall it."
 *
 * Rules: 355.10.e ("each player kills one of their X" is a set chosen by each player at resolution —
 * NOT targeting), 355.8 (only TARGETS must be valid to put a spell on the chain — so a gearless caster
 * is not blocked), 359.3.e.11 (follow instructions as far as possible: a player with no gear just skips),
 * 359.3.e.10 (a spell that ends up doing nothing was still played), 357 (costs are paid regardless).
 *
 * Question: P1 plays Acceptable Losses. (a) P1 has NO gear, P2 has exactly one Gold token. (b) nobody has
 * gear. (c) P1 nothing, P2 Gold + Zhonya's. Is it playable by a gearless caster, who is prompted, who picks
 * P2's gear, and can P2 respond by cracking the Gold first?
 * Answer: legal in all three; P1 is never prompted; (a) Gold dies with no choice (or P2 cracks it in
 * response and then nothing dies); (b) resolves doing nothing, still "played"; (c) P2 — not P1 — picks
 * which of THEIR gear dies, no declining; a picked Zhonya's simply dies (it protects units, not itself).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ACCEPTABLE_LOSSES = "ogn-179-298";
const GOLD = "unl-t05";
const ZHONYAS = "ogn-077-298";
const VANGUARD_CAPTAIN = "ogn-218-298"; // Legion probe: "played another card this turn" → two Recruit tokens

/** (a) P1: 1 energy, Acceptable Losses, no gear (a unit in base to prove units are untouched). P2: one ready Gold token. */
function boardA() {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", { might: 2, name: "P1 Body" }, "p1body")
    .unit(P2, "base", { might: 2, name: "P2 Body" }, "p2body")
    .gear(P2, GOLD, "gold")
    .hand(P1, ACCEPTABLE_LOSSES, "al");
}

/** (b) no gear anywhere. */
function boardB() {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", { might: 2, name: "P1 Body" }, "p1body")
    .unit(P2, "base", { might: 2, name: "P2 Body" }, "p2body")
    .hand(P1, ACCEPTABLE_LOSSES, "al");
}

/** (c) P1 nothing; P2 Gold + Zhonya's Hourglass (face up in base) and a unit for Zhonya's to (not) matter to. */
function boardC() {
  return boardA().gear(P2, ZHONYAS, "zh");
}

/** Cast with whatever (empty) targets bundle the engine wants from a gearless caster. */
async function castAL(game: Game): Promise<void> {
  await game.p1.cast("al");
}

describe("Acceptable Losses with a gearless caster (× Gold token, × Zhonya's Hourglass)", () => {
  test("(a)(b)(c) the spell is a legal play for a caster with NO gear — nothing is targeted (355.10.e), so 355.8 never blocks it; the cast asks P1 for no object", async () => {
    for (const b of [boardA, boardB, boardC]) {
      const game = await b().build();
      expect(game.p1.gear()).toEqual([]);
      expect(game.p1.can("cast", "al")).toBe(true);
      const targets = game.p1.option("cast", "al")?.fields.find((f) => f.arg === "targets");
      // either no targets field at all, or one that admits only the empty choice
      expect(targets === undefined || targets.max === 0).toBe(true);
      await castAL(game);
      expect(game.p1.resources().energy).toBe(0); // 357: cost paid regardless
      expect(game.chain()).toEqual([expect.objectContaining({ cardId: "al", controller: P1, triggered: false })]);
      expect(game.chain()[0]?.targets ?? []).toEqual([]);
      expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // straight to priority, no pick
    }
  });

  test("(a) resolution: P1 (no gear) is skipped with NO prompt; P2's lone Gold is killed with no choice and no way to decline — the token ceases to exist", async () => {
    const game = await boardA().build();
    await castAL(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves
    // nobody was asked anything: we are directly back in P1's open main phase
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.p2.gear()).toEqual([]);
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.zoneOf("p1body")).toBe("base"); // units are not gear
    expect(game.zoneOf("p2body")).toBe("base");
    expect(game.p2.resources().power.rainbow ?? 0).toBe(0); // killed, not cracked — no [rainbow] for P2
    expect(game.violations()).toEqual([]);
  });

  test("(a) P2 may instead RESPOND: with Acceptable Losses on the chain and priority passed, Gold's [Reaction] Add ability is legal — cracking it yields [rainbow] at once and leaves the spell nothing to kill", async () => {
    const game = await boardA().build();
    await castAL(game);
    expect(game.p2.can("activate", "gold")).toBe(false); // P1 still holds priority over its own spell
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("activate", "gold")).toBe(true);
    await game.p2.activate("gold");
    // Add abilities resolve immediately — never a chain item; the spell is still waiting underneath
    expect(game.chain().map((c) => c.cardId)).toEqual(["al"]);
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.p2.resources().power.rainbow).toBe(1);
    await game.settle(); // P2 passes → Acceptable Losses resolves against two gearless players
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.p2.resources().power.rainbow).toBe(1);
    expect(game.zoneOf("p2body")).toBe("base");
  });

  test("(b) nobody has gear: the spell resolves doing nothing at all, no player sees a prompt, it goes to the trash and still counts as PLAYED (359.3.e.10)", async () => {
    const game = await boardB().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    await castAL(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 still gets its normal window
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1);
    expect([...game.p1.base(), ...game.p2.base()].sort()).toEqual(["p1body", "p2body"]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) the 'real use': an Acceptable Losses that killed nothing still turns on Legion — Vanguard Captain played next makes its two Recruit tokens", async () => {
    const game = await boardB().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, VANGUARD_CAPTAIN, "captain").build();
    await castAL(game);
    await game.settle();
    expect(game.zoneOf("al")).toBe("trash");
    await game.p1.play("captain");
    await game.settle();
    const recruits = game.p1.units("base").filter((u) => game.state(u).isToken);
    expect(recruits).toHaveLength(2);
  });

  test("(c) P2 — not P1 — is prompted at resolution to choose which of THEIR two gear dies: exactly {Gold, Zhonya's}, mandatory (no decline); P1 is never asked", async () => {
    const game = await boardC().build();
    await castAL(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves → the only prompt of the whole spell
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P2, source: { cardId: "al" }, timing: "RES" });
    expect(game.actingSeat()).toBe(P2);
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["gold", "zh"]);
    // P1 cannot answer it
    expect((await game.p1.try((p) => p.pick("zh"))).ok).toBe(false);
    expect((await game.p2.try((p) => p.decline())).ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  });

  test("(c) P2 picks the Gold: the token is gone, Zhonya's stays in base, spell to trash", async () => {
    const game = await boardC().build();
    await castAL(game);
    await game.settle(); // passes priority for both; stops at P2's unscripted pick
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
    await game.p2.pick("gold");
    await game.settle();
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p2.gear()).toEqual(["zh"]);
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) P2 picks Zhonya's Hourglass: it is simply killed to the trash — its replacement effect guards friendly UNITS dying, not itself; Gold and every unit untouched", async () => {
    const game = await boardC().build();
    await castAL(game);
    await game.settle();
    await game.p2.pick("zh");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("gold")).toBe("base");
    expect(game.state("gold").isReady).toBe(true);
    expect(game.zoneOf("p2body")).toBe("base");
    expect(game.state("p2body")).toMatchObject({ damage: 0, isExhausted: false });
    expect(game.zoneOf("al")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(c) P2 can also shrink the set in response: crack the Gold with priority, then at resolution only Zhonya's is left and it dies with no prompt", async () => {
    const game = await boardC().build();
    await castAL(game);
    await game.p1.passPriority();
    await game.p2.activate("gold");
    expect(game.p2.resources().power.rainbow).toBe(1);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // single gear → no choice asked
    expect(game.zoneOf("gold")).toBe("gone");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p2.gear()).toEqual([]);
  });
});

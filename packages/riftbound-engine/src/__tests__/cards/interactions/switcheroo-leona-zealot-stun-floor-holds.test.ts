/**
 * Interaction: Switcheroo (sfd-145-221) · Chaos Action spell · 2 + [chaos][chaos]
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].) [Action]
 *      Swap the Might of two units at the same battlefield this turn."                    — P2's, facedown at bf2
 *   × Leona, Zealot (ogn-079-298) · Champion Unit · Calm · 6 + [calm] · 6 Might
 *     "… Stunned enemy units here have -8 [Might], to a minimum of 1 [Might]."             — P1's attacker
 *   × Rune Prison (ogn-050-298) · Calm Action spell · 2 + [calm] · "Stun a unit."          — in P1's hand
 *   (+ Flash ogs-011-024 · Chaos Reaction · 2 · "Move up to 2 friendly units to base." for facet (e))
 *
 * Position: P1's turn (turn 3 — Switcheroo was hidden on an earlier turn). P2 controls bf2 with X (3 Might) and has
 * Switcheroo facedown there. P1 attacks bf2 with Leona, Zealot (6) — or, in the contrast, a plain 6-Might Brute —
 * and in the showdown plays Rune Prison on X.
 *
 * Question. (a) X's Might once stunned under Leona's aura? (b) P2 then flips Switcheroo (free) choosing X and Leona,
 * hoping for X 6 / Leona 1: the swap computes the difference of CURRENT values and applies +diff/−diff — but Leona's
 * floor is a continuously re-applied passive. X and Leona after it resolves? Are the values "reversed"? Combat result?
 * (c) Same line with a plain 6-Might attacker. (d) P2 flips Switcheroo in RESPONSE to Rune Prison (swap first, then
 * the stun). (e) In (b), X's Might if Leona leaves bf2 later this turn, and at end of turn.
 *
 * Rules: 433.1 / 433.1.a / 433.1.b (Swap = difference of current values → an Increase on the lower and a Decrease on
 * the higher, two independent this-turn effects), 433.1.c, 423.1 / 423.1.b / 423.1.c (stunned: deals no combat
 * damage, still dies to damage ≥ its Might), 423.1.a.2 (stun ends at end of turn), 143.2.a (lethal), 340.1 (LIFO),
 * 466.1.a.2 (attackers recalled if defenders remain), 811 (play from Hidden for [0], gains Reaction, targets at that
 * battlefield).
 *
 * Expected: (a) 3 − 8 → floored: X = 1. (b) current values X 1 / Leona 6 → diff 5: Leona 6 − 5 = 1; X 3 + 5 − 8 = 0 →
 * floor 1. X 1, Leona 1 — NOT reversed. Combat: X (stunned) deals 0, Leona deals 1 ≥ 1 → X dies, Leona survives,
 * P1 conquers bf2 (+1 point). (c) no aura: stunned X stays 3; diff 3 → X 6, Brute 3; Brute deals 3 < 6, X deals 0 →
 * both survive, Brute recalled (466.1.a.2), P2 keeps bf2 — here the swap really reverses 3↔6. (d) LIFO: swap on
 * X 3 / Leona 6 → X 6, Leona 3; then the stun: 3 + 3 − 8 → floor 1. Final X 1, Leona 3; Leona's 3 kills X, P1
 * conquers. (e) Leona leaves bf2 → aura gone, nothing snapshotted: X = 3 + 5 = 8 (still stunned); end of turn →
 * X 3, Leona 6.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const LEONA_ZEALOT = "ogn-079-298";
const RUNE_PRISON = "ogn-050-298";
const FLASH = "ogs-011-024";

/**
 * Turn 3, P1's turn. P2 controls bf2 with X (3) and Switcheroo facedown there; P2 has no resources (the flip is
 * free). P1 holds Rune Prison (+ Flash) with 4 energy, 1 calm, 1 chaos, and the attacker "A" in base — Leona,
 * Zealot or a vanilla 6-Might Brute.
 */
function board(attacker: "leona" | "brute" = "leona") {
  const b = scenario()
    .turn(3)
    .resources(P1, { energy: 4, power: { calm: 1, chaos: 1 } })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Defender X" }, "X")
    .facedown(P2, "bf2", SWITCHEROO, "sw")
    .hand(P1, RUNE_PRISON, "prison")
    .hand(P1, FLASH, "flash");
  return attacker === "leona" ? b.unit(P1, "base", LEONA_ZEALOT, "A") : b.unit(P1, "base", { might: 6, name: "Brute" }, "A");
}

function showdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1);
}

/** Combat damage dealt to `target` (public damageLog). */
function combatDamageTo(game: Game, target: string): number {
  return (game.gameState.damageLog ?? []).filter((r) => r.combat && r.target === target).reduce((s, r) => s + r.amount, 0);
}

/** A attacks bf2 (P1 has Focus) and P1 casts Rune Prison on X — the spell is on the chain, P1 holds priority. */
async function attackAndPrison(attacker: "leona" | "brute" = "leona"): Promise<Game> {
  const game = await board(attacker).build();
  await game.p1.move("A", "bf2");
  expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf2", focusPlayer: P1, isCombatShowdown: true });
  await game.p1.cast("prison", { targets: "X" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "prison", controller: P1, targets: ["X"] })]);
  return game;
}

/** …both pass → Rune Prison resolves (X stunned); Focus passes to P2. */
async function stunned(attacker: "leona" | "brute" = "leona"): Promise<Game> {
  const game = await attackAndPrison(attacker);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.state("X").isStunned).toBe(true);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  return game;
}

/** …P2 (Focus) flips Switcheroo on the only two units at bf2, both pass → it resolves. Stops before combat damage. */
async function stunnedThenSwapped(attacker: "leona" | "brute" = "leona"): Promise<Game> {
  const game = await stunned(attacker);
  await game.p2.reveal("sw");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sw", controller: P2, targets: ["X", "A"] })]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("sw")).toBe("trash");
  return game;
}

describe("(a) stunned X under Leona's aura", () => {
  test("before anything: X is 3, Leona 6; Switcheroo is hidden at bf2 and P2 has nothing floating", async () => {
    const game = await board().build();
    expect(game.state("X")).toMatchObject({ isStunned: false, might: 3 });
    expect(game.state("A").might).toBe(6);
    expect(game.zoneOf("sw")).toBe("facedown-bf2");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });

  test("Rune Prison resolves: X is stunned and its Might is max(1, 3 − 8) = 1 — the floor holds; Leona stays 6", async () => {
    const game = await stunned();
    expect(game.state("X")).toMatchObject({ baseMight: 3, isStunned: true, might: 1, zone: "battlefield-bf2" });
    expect(game.state("A").might).toBe(6);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 0, chaos: 1 } });
  });
});

describe("(b) P2 flips Switcheroo on X (1) and Leona (6): the +5 is swallowed by the floor — X 1, Leona 1, not reversed", () => {
  test("the flip from hidden is free and legal with Focus; its two objects are the two units at bf2 (811.1.d.2)", async () => {
    const game = await stunned();
    expect(game.p2.can("reveal", "sw")).toBe(true);
    await game.p2.reveal("sw");
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sw", controller: P2, targets: ["X", "A"], triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("after it resolves: Leona = 6 − 5 = 1; X = 3 + 5 − 8 = 0 → floored to 1 (433.1.b on CURRENT values 1/6, aura re-applied continuously) — both read 1, the values are NOT reversed", async () => {
    const game = await stunnedThenSwapped();
    expect(game.state("A")).toMatchObject({ baseMight: 6, might: 1 });
    expect(game.state("X")).toMatchObject({ baseMight: 3, isStunned: true, might: 1 });
    // The swap's Increase on X is a real +5 modifier (433.1.a) — it is the aura's unspent −8 that eats it.
    expect(game.state("X").mightModifier).toBe(5);
  });

  test("combat: stunned X contributes 0 (423.1.b); Leona deals 1 to X whose Might is 1 → lethal (423.1.c, 143.2.a): X → P2's trash, Leona undamaged at bf2", async () => {
    const game = await stunnedThenSwapped();
    await game.settle();
    expect(combatDamageTo(game, "A")).toBe(0);
    expect(combatDamageTo(game, "X")).toBe(1);
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.p2.trash()).toContain("X");
    expect(game.state("A")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(showdown(game)).toBeUndefined();
  });

  test("result: P1 conquers bf2 and scores 1; back to P1's open main phase; Leona still reads 1 for the rest of the turn", async () => {
    const game = await stunnedThenSwapped();
    await game.settle();
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("A").might).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) contrast — a plain 6-Might Brute attacks: no aura, the swap really reverses 3 ↔ 6", () => {
  test("stunned X keeps its 3 (a stun alone never touches Might); Brute 6", async () => {
    const game = await stunned("brute");
    expect(game.state("X")).toMatchObject({ isStunned: true, might: 3 });
    expect(game.state("A").might).toBe(6);
  });

  test("Switcheroo: diff 3 → X = 6, Brute = 3", async () => {
    const game = await stunnedThenSwapped("brute");
    expect(game.state("X")).toMatchObject({ isStunned: true, might: 6 });
    expect(game.state("A").might).toBe(3);
  });

  test("combat: Brute deals 3 to a 6-Might X (survives), X deals 0 (stunned) → both survive; Brute is RECALLED to base (466.1.a.2), healed; P2 keeps bf2, nobody scores", async () => {
    const game = await stunnedThenSwapped("brute");
    await game.settle();
    expect(combatDamageTo(game, "X")).toBe(3);
    expect(combatDamageTo(game, "A")).toBe(0);
    expect(game.state("X")).toMatchObject({ damage: 0, might: 6, zone: "battlefield-bf2" });
    expect(game.state("A")).toMatchObject({ damage: 0, might: 3, zone: "base" });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("end of turn: swap and stun expire — X 3 unstunned, Brute 6", async () => {
    const game = await stunnedThenSwapped("brute");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("X")).toMatchObject({ isStunned: false, might: 3 });
    expect(game.state("A").might).toBe(6);
  });
});

describe("(d) contrast — Switcheroo flipped in RESPONSE to Rune Prison (swap resolves first, then the stun)", () => {
  test("with Rune Prison on the chain and priority passed, P2 may flip Switcheroo as a Reaction (811.1.b): chain = [prison, sw]", async () => {
    const game = await attackAndPrison();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("reveal", "sw")).toBe(true);
    await game.p2.reveal("sw");
    expect(game.chain().map((c) => c.cardId)).toEqual(["prison", "sw"]);
  });

  test("LIFO (340.1): Switcheroo resolves on X 3 / Leona 6 → X 6, Leona 3 while Rune Prison still waits", async () => {
    const game = await attackAndPrison();
    await game.p1.passPriority();
    await game.p2.reveal("sw");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["prison"]);
    expect(game.state("X")).toMatchObject({ isStunned: false, might: 6 });
    expect(game.state("A").might).toBe(3);
  });

  test("then Rune Prison stuns X → the aura applies: 3 + 3 − 8 → floor 1. Final X 1, Leona 3 (not 1) — order changes Leona's number, X is floored either way", async () => {
    const game = await attackAndPrison();
    await game.p1.passPriority();
    await game.p2.reveal("sw");
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("X")).toMatchObject({ isStunned: true, might: 1 });
    expect(game.state("A").might).toBe(3);
  });

  test("combat: Leona's 3 kills the 1-Might stunned X; Leona survives; P1 conquers bf2 (+1)", async () => {
    const game = await attackAndPrison();
    await game.p1.passPriority();
    await game.p2.reveal("sw");
    await game.settle();
    expect(combatDamageTo(game, "X")).toBe(3);
    expect(combatDamageTo(game, "A")).toBe(0);
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.state("A")).toMatchObject({ damage: 0, might: 3, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

describe("(e) in (b), the aura is continuous, not a snapshot: Leona leaving bf2 releases the full +5", () => {
  test("after the swap P1 (Focus) Flashes Leona to base: X = 3 + 5 = 8 (still stunned, no aura); with no attacker left the combat ends and P2 keeps bf2", async () => {
    const game = await stunnedThenSwapped();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "flash")).toBe(true);
    await game.p1.cast("flash", { targets: "A" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("A")).toBe("base");
    expect(game.state("X")).toMatchObject({ isStunned: true, might: 8, zone: "battlefield-bf2" });
    expect(game.state("A").might).toBe(1); // Leona keeps her own −5 for the turn
    await game.settle();
    expect(game.state("X")).toMatchObject({ might: 8, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
  });

  test("at end of turn both swap effects and the stun expire (433.1.a 'this turn', 423.1.a.2): X 3 unstunned, Leona 6", async () => {
    const game = await stunnedThenSwapped();
    await game.p1.cast("flash", { targets: "A" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("X")).toMatchObject({ isStunned: false, might: 3, zone: "battlefield-bf2" });
    expect(game.state("A")).toMatchObject({ might: 6, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});

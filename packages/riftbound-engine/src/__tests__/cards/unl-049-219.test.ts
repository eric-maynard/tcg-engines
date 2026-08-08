/**
 * Honeyfruit — unl-049-219 · Gear · Calm · 2 energy (no power)
 *
 *   This enters exhausted.
 *   [Reaction][>] [Exhaust]: [Add] [rainbow]. (Abilities that add resources can't be reacted to.)
 *   [Level 6][>] [>>][Reaction][>] [Exhaust]: [Add] [1][rainbow]. (Use this ability only while you have 6+ XP.)
 *
 * Rules: 143.4-style "enters exhausted" static; 429.2/429.2.a (Add abilities resolve on finalization —
 * never a chain item, priority does not pass); 813 (Reaction: Closed states on any turn / showdowns,
 * NOT the opponent's Neutral Open state); 135.2.e.5.b (added [A]/rainbow pays a Power cost of ANY
 * domain); 824 (Level N: the dependent ability exists only while the CONTROLLER has ≥ N XP; 824.1.d off
 * again below N); both abilities share one [Exhaust] cost → at most one activation per ready cycle.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. Enters exhausted even when hard-cast from hand → no same-turn ramp; it readies in YOUR next Awaken
 *     (not during the opponent's turn).
 *  2. Threshold is "6+": 5 XP → the second ability must not be offered at all; 6 XP → offered. Only the
 *     controller's XP counts (opponent at 6 XP does nothing for you).
 *  3. At 6+ XP both abilities are listed, but exhausting for one removes the other (shared cost).
 *  4. Reaction Add on the opponent's turn: legal while their spell is on the chain, adds immediately,
 *     leaves the chain exactly as it was; illegal in their Neutral Open main phase.
 *  5. The rainbow power is domain-agnostic: a CALM gear's output pays a MIND pip (Seal of Insight).
 *  6. Partner: Herald of Spring (unl-034-219) — its play trigger can push XP to 6 mid-turn and switch
 *     the Level-6 ability on (covered in unl-034-219.test.ts).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-049-219";
const SEAL_OF_INSIGHT = "ogn-120-298"; // Gear · Mind · 0 energy + [mind]
const SLOW_DRAW = { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 0, name: "Slow Draw", timing: "action" };

describe("Honeyfruit (unl-049-219)", () => {
  test("cost: exactly 2 energy, no power; resolves straight to the base as gear (no chain item) and ENTERS EXHAUSTED; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "fruit").build();
    await game.p1.play("fruit");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("fruit")).toBe("base");
    expect(game.p1.gear()).toContain("fruit");
    expect(game.chain()).toHaveLength(0);
    expect(game.state("fruit").isExhausted).toBe(true);
    expect((await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "fruit").build()).p1.can("play", "fruit")).toBe(false);
  });

  test("enters exhausted ⇒ no same-turn ramp: neither ability is usable the turn it is played (even at 6 XP); it stays exhausted through P2's turn and readies in P1's next Awaken", async () => {
    const game = await scenario().xp(P1, 6).resources(P1, { energy: 2 }).hand(P1, CARD, "fruit").build();
    await game.p1.play("fruit");
    expect(game.p1.can("activate", "fruit")).toBe(false);
    expect((await game.p1.try((p) => p.activate("fruit", 1))).ok).toBe(false);
    expect((await game.p1.try((p) => p.activate("fruit", 2))).ok).toBe(false);
    await game.advanceTurn(); // P2's turn
    expect(game.state("fruit").isExhausted).toBe(true);
    await game.advanceTurn(); // P1 again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("fruit").isReady).toBe(true);
    expect(game.p1.can("activateAbility:fruit#1")).toBe(true);
    expect(game.p1.can("activateAbility:fruit#2")).toBe(true);
  });

  test("[Exhaust]: [Add][rainbow] — exhausts, adds exactly 1 rainbow power (no energy) at once, nothing on the chain, P1 keeps the action; cannot be used again while exhausted", async () => {
    const game = await scenario().gear(P1, CARD, "fruit").build();
    await game.p1.activate("fruit");
    expect(game.state("fruit").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "fruit")).toBe(false);
    expect((await game.p1.try((p) => p.activate("fruit", 1))).ok).toBe(false);
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("[Level 6] gate: at 0 XP and at 5 XP (one short) only the base ability exists; forcing index 2 is refused and adds nothing", async () => {
    for (const xp of [0, 5]) {
      const game = await scenario().xp(P1, xp).gear(P1, CARD, "fruit").build();
      expect(game.p1.can("activateAbility:fruit#1")).toBe(true);
      expect(game.p1.can("activateAbility:fruit#2")).toBe(false);
      const t = await game.p1.try((p) => p.activate("fruit", 2));
      expect(t.ok).toBe(false);
      expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
      expect(game.state("fruit").isReady).toBe(true);
    }
  });

  test("[Level 6] at exactly 6 XP: the second ability adds 1 energy AND 1 rainbow immediately (no chain), exhausts Honeyfruit, XP is not spent", async () => {
    const game = await scenario().xp(P1, 6).gear(P1, CARD, "fruit").build();
    expect(game.p1.can("activateAbility:fruit#2")).toBe(true);
    await game.p1.activate("fruit", 2);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
    expect(game.state("fruit").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(6);
  });

  test("shared [Exhaust] cost: at 6+ XP both abilities are listed, but using either one removes both until it readies", async () => {
    const viaBase = await scenario().xp(P1, 9).gear(P1, CARD, "fruit").build();
    await viaBase.p1.activate("fruit", 1);
    expect(viaBase.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(viaBase.p1.can("activateAbility:fruit#2")).toBe(false);
    expect((await viaBase.p1.try((p) => p.activate("fruit", 2))).ok).toBe(false);

    const viaLevel = await scenario().xp(P1, 9).gear(P1, CARD, "fruit").build();
    await viaLevel.p1.activate("fruit", 2);
    expect(viaLevel.p1.can("activateAbility:fruit#1")).toBe(false);
    expect(viaLevel.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
  });

  test("only the CONTROLLER's XP counts (824.1.c): P2 at 6 XP, P1 at 0 → P1's Honeyfruit has no Level-6 ability", async () => {
    const game = await scenario().xp(P2, 6).xp(P1, 0).gear(P1, CARD, "fruit").build();
    expect(game.p1.can("activateAbility:fruit#1")).toBe(true);
    expect(game.p1.can("activateAbility:fruit#2")).toBe(false);
  });

  test("Reaction on the opponent's turn: NOT in P2's Neutral Open state; legal once P2's spell is on the chain — adds at once, the chain still holds only the spell, and it is still P2's turn", async () => {
    const game = await scenario().active(P2).xp(P1, 6).gear(P1, CARD, "fruit").hand(P2, SLOW_DRAW, "theirs").build();
    expect(game.p1.can("activate", "fruit")).toBe(false);
    await game.p2.cast("theirs");
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activateAbility:fruit#1")).toBe(true);
    expect(game.p1.can("activateAbility:fruit#2")).toBe(true);
    await game.p1.activate("fruit", 2);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["theirs"]);
    expect(game.turnPlayer()).toBe(P2);
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("trash");
  });

  test("Reaction in a showdown: when P1 holds Focus in P2's attack, Honeyfruit can be tapped for power there too", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .gear(P1, CARD, "fruit")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activateAbility:fruit#1")).toBe(true);
    await game.p1.activate("fruit", 1);
    expect(game.p1.power("rainbow")).toBe(1);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
  });

  test("rainbow is any-domain power (135.2.e.5.b): the calm Honeyfruit's [rainbow] pays Seal of Insight's [mind] pip", async () => {
    const game = await scenario().gear(P1, CARD, "fruit").hand(P1, SEAL_OF_INSIGHT, "seal").build();
    expect(game.p1.can("play", "seal")).toBe(false);
    await game.p1.activate("fruit", 1);
    expect(game.p1.can("play", "seal")).toBe(true);
    await game.p1.play("seal");
    expect(game.zoneOf("seal")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(Object.values(game.p1.resources().power).reduce((a, b) => a + b, 0)).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the Level-6 output is exactly [1][rainbow]: not enough for a second Honeyfruit (2 energy), but it pays Seal of Insight's [mind] pip and leaves the 1 energy", async () => {
    const game = await scenario().xp(P1, 6).gear(P1, CARD, "fruit").hand(P1, CARD, "fruit2").hand(P1, SEAL_OF_INSIGHT, "seal").build();
    await game.p1.activate("fruit", 2);
    expect(game.p1.can("play", "fruit2")).toBe(false); // 1 energy < 2
    await game.p1.play("seal");
    expect(game.p1.resources().energy).toBe(1);
    expect(game.zoneOf("seal")).toBe("base");
  });

  test("registry payload matches the printed text: static enters-exhausted; activated Reaction {exhaust} → add [rainbow]; activated Reaction {exhaust} → add 1 energy + [rainbow] gated by while-level 6; 2 energy, no power", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "calm", energyCost: 2, name: "Honeyfruit" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(3);
    expect(def?.abilities?.[0]).toMatchObject({ effect: { type: "enters-exhausted" }, type: "static" });
    expect(def?.abilities?.[1]).toMatchObject({ cost: { exhaust: true }, effect: { power: ["rainbow"], type: "add-resource" }, timing: "reaction", type: "activated" });
    expect((def?.abilities?.[1] as { effect: { energy?: number } }).effect.energy ?? 0).toBe(0);
    expect((def?.abilities?.[1] as { condition?: unknown }).condition).toBeUndefined();
    expect(def?.abilities?.[2]).toMatchObject({
      condition: { threshold: 6, type: "while-level" },
      cost: { exhaust: true },
      effect: { energy: 1, power: ["rainbow"], type: "add-resource" },
      timing: "reaction",
      type: "activated",
    });
  });
});

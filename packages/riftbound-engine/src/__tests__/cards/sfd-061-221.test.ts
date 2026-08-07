/**
 * Aspiring Engineer — sfd-061-221 · Unit · Mind · 3 energy + [mind] · 3 might
 *
 *   When you play me, return a gear from your trash to your hand.
 *
 * Rules: 383.4 ("When you play me" = triggered ability, goes on the chain after the unit
 * resolves); 355.10.a (the trash is public → "return a gear from your trash" TARGETS a gear card
 * there); 355.8 / 055 (no legal target → the instruction is simply skipped, the unit still
 * arrives); 137 (Equipment is a kind of gear); no "may" → with a legal target the return is
 * mandatory; "your trash" → an opponent's trash is never a source.
 *
 * Head-judge corner cases considered:
 *   - two gear in trash → the controller must be asked which (a real choice, not auto-picked),
 *     exactly one moves, the other stays;
 *   - Equipment in trash counts as gear; units / spells in trash are never offered;
 *   - empty trash (or trash with only non-gear) → no prompt, no crash, unit on board, chain empty;
 *   - "YOUR trash": a gear in the OPPONENT's trash must not be offered (parsed target carries no
 *     controller — likely leak);
 *   - mandatory: no decline option when a gear exists;
 *   - the trigger is an ability on the chain controlled by P1 → the opponent gets priority before
 *     it resolves (Not So Fast-style windows), and the returned gear is a normal hand card after.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-061-221";
const HEART = "sfd-052-221"; // Heart of Dark Ice — gear
const HEXPLATE = "sfd-073-221"; // Experimental Hexplate — equipment (a gear subtype)
const FILLER = "ogn-175-298"; // vanilla unit
const SPELL = "ogn-004-298"; // Cleave — spell

function base(energy = 3, mind = 1) {
  return scenario().resources(P1, { energy, power: { mind } }).hand(P1, CARD, "eng");
}

/** Settle until P1 faces a pick prompt (the trigger's target choice) or the game is open again. */
async function settleToPick(game: Game): Promise<Decision | null> {
  const r = await game.settle();
  return r.reason === "unanswered" ? game.decision() : null;
}

describe("Aspiring Engineer (sfd-061-221)", () => {
  test("cost: 3 energy + 1 mind deducted; 3-might unit lands in base; unaffordable without the mind or with 2 energy", async () => {
    const game = await base().trash(P1, HEART, "heart").build();
    expect(game.p1.can("play", "eng")).toBe(true);
    await game.p1.play("eng", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("eng")).toBe("base");
    expect(game.state("eng").might).toBe(3);
    expect((await base(3, 0).build()).p1.can("play", "eng")).toBe(false);
    expect((await base(2, 1).build()).p1.can("play", "eng")).toBe(false);
    expect((await base(3, 0).resources(P1, { power: { fury: 1 } }).build()).p1.can("play", "eng")).toBe(false);
  });

  test("'When you play me' is a triggered ability: after the unit resolves a P1-controlled triggered item sits on the chain", async () => {
    const game = await base().trash(P1, HEART, "heart").build();
    await game.p1.play("eng", { to: "base" });
    expect(game.zoneOf("eng")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "eng", controller: P1, triggered: true })]);
    expect(game.zoneOf("heart")).toBe("trash"); // nothing has moved yet
  });

  test("single gear in your trash: it is returned to your hand when the trigger resolves; the Engineer stays on board", async () => {
    const game = await base().trash(P1, HEART, "heart").trash(P1, FILLER, "deadUnit").build();
    await game.p1.play("eng", { to: "base" });
    const d = await settleToPick(game);
    if (d) {
      expect(d).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("heart");
      await game.settle();
    }
    expect(game.zoneOf("heart")).toBe("hand");
    expect(game.p1.hand()).toEqual(["heart"]);
    expect(game.zoneOf("deadUnit")).toBe("trash");
    expect(game.zoneOf("eng")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("two gear in your trash: P1 is asked which one (only the gear are offered), exactly that one moves", async () => {
    const game = await base()
      .trash(P1, HEART, "heart")
      .trash(P1, HEXPLATE, "plate")
      .trash(P1, FILLER, "deadUnit")
      .trash(P1, SPELL, "deadSpell")
      .build();
    await game.p1.play("eng", { to: "base" });
    const d = await settleToPick(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["heart", "plate"]);
    await game.p1.pick("plate");
    await game.settle();
    expect(game.zoneOf("plate")).toBe("hand");
    expect(game.zoneOf("heart")).toBe("trash");
    expect(game.zoneOf("deadUnit")).toBe("trash");
    expect(game.zoneOf("deadSpell")).toBe("trash");
  });

  test("Equipment is gear: an Equipment alone in the trash is returned", async () => {
    const game = await base().trash(P1, HEXPLATE, "plate").build();
    await game.p1.play("eng", { to: "base" });
    const d = await settleToPick(game);
    if (d) {
      await game.p1.pick("plate");
      await game.settle();
    }
    expect(game.zoneOf("plate")).toBe("hand");
  });

  test("mandatory (no 'may'): with a gear in trash the prompt, if shown, cannot be declined", async () => {
    const game = await base().trash(P1, HEART, "heart").trash(P1, HEXPLATE, "plate").build();
    await game.p1.play("eng", { to: "base" });
    const d = await settleToPick(game);
    expect(d?.kind).toBe("pick");
    if (d?.kind === "pick") {
      expect(d.allowDecline).toBe(false);
      expect(d.min).toBe(1);
      expect(d.max).toBe(1);
    }
    const r = await game.p1.try((p) => p.decline());
    expect(r.ok).toBe(false);
    expect(game.zoneOf("heart")).toBe("trash");
    expect(game.zoneOf("plate")).toBe("trash");
  });

  test("no gear in your trash (only a unit and a spell): no prompt, nothing returns, Engineer still enters, chain clears", async () => {
    const game = await base().trash(P1, FILLER, "deadUnit").trash(P1, SPELL, "deadSpell").build();
    await game.p1.play("eng", { to: "base" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("eng")).toBe("base");
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("deadUnit")).toBe("trash");
    expect(game.zoneOf("deadSpell")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("completely empty trash: the play is still legal and resolves cleanly", async () => {
    const game = await base().build();
    expect(game.p1.can("play", "eng")).toBe(true);
    await game.p1.play("eng", { to: "base" });
    await game.settle();
    expect(game.zoneOf("eng")).toBe("base");
    expect(game.state("eng").isExhausted).toBe(true); // rule 143.4 — nothing here says "enter ready"
    expect(game.violations()).toEqual([]);
  });

  test("'YOUR trash': a gear in the opponent's trash is never offered nor moved — with only that available nothing returns", async () => {
    const game = await base().trash(P2, HEART, "theirHeart").build();
    await game.p1.play("eng", { to: "base" });
    const d = await settleToPick(game);
    if (d && d.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key)).not.toContain("theirHeart");
    }
    await game.settle({ policy: "first" });
    expect(game.zoneOf("theirHeart")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.hand()).toEqual([]);
  });

  test("'YOUR trash' with gear on both sides: only your own gear is offered", async () => {
    const game = await base().trash(P1, HEART, "heart").trash(P1, HEXPLATE, "plate").trash(P2, HEART, "theirHeart").build();
    await game.p1.play("eng", { to: "base" });
    const d = await settleToPick(game);
    expect(d?.kind).toBe("pick");
    const offered = d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["heart", "plate"]);
  });

  test("the opponent receives priority while the trigger is on the chain (a window to respond) before anything returns", async () => {
    const game = await base().trash(P1, HEART, "heart").build();
    await game.p1.play("eng", { to: "base" });
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("heart")).toBe("trash");
    await game.p2.passPriority();
    const d = await settleToPick(game);
    if (d) {
      await game.p1.pick("heart");
      await game.settle();
    }
    expect(game.zoneOf("heart")).toBe("hand");
  });

  test("the returned gear is an ordinary hand card: it can be played again right away if affordable", async () => {
    const game = await base(6, 1).resources(P1, { power: { calm: 1 } }).trash(P1, HEART, "heart").build();
    await game.p1.play("eng", { to: "base" });
    const d = await settleToPick(game);
    if (d) {
      await game.p1.pick("heart");
      await game.settle();
    }
    expect(game.zoneOf("heart")).toBe("hand");
    expect(game.p1.can("playGear", "heart")).toBe(true);
    await game.p1.play("heart");
    await game.settle();
    expect(game.zoneOf("heart")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
  });

  test("parsed ability: one play-self trigger returning a gear from trash to hand (not optional)", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 3, might: 3, powerCost: ["mind"] });
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as Record<string, unknown>;
    expect(ab).toMatchObject({
      effect: { target: { location: "trash", type: "gear" }, type: "return-to-hand" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
    expect(ab.optional).not.toBe(true);
  });
});

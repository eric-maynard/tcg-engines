/**
 * Reflection — unl-t06 · Token Unit · (no domain, no cost) · 0 Might
 *
 *   (I become a copy of something when played. I don't get that card's play effects.)
 *
 * A Reflection never plays itself: Mirror Image (unl-200-219: "Choose a unit. Play a ready Reflection
 * unit token to your base. It becomes a copy of that unit. Give it [Temporary].") and Keeper of Masks
 * (unl-081-219: "When you play me, play two Reflection unit tokens here. They become copies of me.")
 * mint it, so most clauses are exercised through them.
 *
 * Head-judge notes — the tricky spots for this token:
 *  1. 477.1.b.1.a — a copy takes Name / Type / Tags / COST / Domain / Rules text (and Might); 185.3.a.2:
 *     the costless token now HAS the copied cost (a copy of 6-cost Cloud Drake reads Energy 6).
 *  2. "I don't get that card's play effects" (383.4.a): copying Cloud Drake ("When you play me, draw 1")
 *     draws nothing; Keeper's two Reflections don't re-fire Keeper's own play effect (exactly 2 tokens).
 *  3. Everything that is NOT a play effect IS copied and live: a Reflection of Honest Broker has
 *     Deathknell and pays a Gold when it dies (the 477.1.b.1.b example) — here via the [Temporary]
 *     Mirror Image adds, at the start of its controller's next Beginning Phase.
 *  4. 186.1 — a token that leaves the board (dies, bounced to hand) ceases to exist: never in trash/hand.
 *  5. 142.4.b — 0 Might is not dead: a bare Reflection lives until it has ≥1 damage, and (Scuttle Crab
 *     reminder) a 0-Might unit can still conquer an empty battlefield.
 *  6. Mirror Image may copy an ENEMY unit; the token is still yours (182) and enters READY (184.1).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-t06";
const MIRROR_IMAGE = "unl-200-219"; // Mind/Order spell · 3 + 2 hybrid pips
const KEEPER = "unl-081-219"; // Keeper of Masks · 2 · 1 Might · Hidden, Temporary, play two Reflections here as copies
const CLOUD_DRAKE = "ven-048-166"; // 6-cost 5-Might unit · "When you play me, draw 1."
const HONEST_BROKER = "sfd-155-221"; // 2-cost 2-Might · Deathknell — play a Gold gear token exhausted
const RETREAT = "ogn-104-298"; // [Reaction] 1: return a friendly unit to its owner's hand …

const reflections = (game: Game, seat: "p1" | "p2", at?: string) => game[seat].units(at as "base").filter((id) => game.state(id).isToken);
const golds = (game: Game, seat: "p1" | "p2") => game[seat].gear().filter((id) => game.state(id).isToken && game.state(id).name === "Gold");

/** P1 with Mirror Image + resources and `source` on the board (P1's base unless `enemy`). */
function mirrorBoard(source: string, opts: { enemy?: boolean } = {}) {
  const b = scenario().resources(P1, { energy: 3, power: { mind: 2 } }).battlefield("bf1", { controller: P2 }).hand(P1, MIRROR_IMAGE, "mi");
  return opts.enemy ? b.unit(P2, "bf1", source as never, "src") : b.unit(P1, "base", source, "src");
}

async function castMirror(game: Game): Promise<string> {
  const before = game.p1.resources();
  await game.p1.cast("mi", { targets: "src" });
  expect(game.p1.resources()).toEqual({ energy: before.energy - 3, power: { mind: (before.power.mind ?? 0) - 2 } });
  await game.settle();
  const [tok] = reflections(game, "p1", "base");
  expect(tok).toBeDefined();
  return tok!;
}

describe("Reflection (unl-t06)", () => {
  test("registry payload: a costless, domainless 0-Might unit whose only ability is the static CopyOnPlay marker (no printed play effect of its own)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "bare").build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", might: 0, name: "Reflection" });
    expect(def?.energyCost).toBeUndefined(); // 185.3.a: tokens have no cost …
    expect(def?.powerCost).toBeUndefined();
    expect(def?.domain).toBeUndefined(); // 185.3.b: … and no domain
    expect(def?.abilities).toEqual([{ effect: { keyword: "CopyOnPlay", target: "self", type: "grant-keyword" }, type: "static" }]);
    expect(game.state("bare")).toMatchObject({ baseMight: 0, energyCost: 0, might: 0, name: "Reflection" }); // 185.3.a.1: treated as 0
    expect(game.state("bare").domains).toEqual([]);
    expect(game.state("bare").powerCost).toEqual([]);
  });

  test("142.4.b: a bare 0-Might Reflection is alive with 0 damage, and a 0-Might unit can still walk onto and conquer an empty battlefield", async () => {
    const game = await scenario().battlefield("open", { controller: null }).unit(P1, "base", CARD, "bare").build();
    await game.settle();
    expect(game.zoneOf("bare")).toBe("base");
    await game.p1.move("bare", "open");
    await game.settle();
    expect(game.locationOf("bare")).toBe("open");
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("142.4.b — any NON-ZERO damage on a 0-Might unit is lethal: Incinerate's 2 kills a bare Reflection (a token: killed, it ceases to exist — 186.1)", async () => {
    // Expected: 2 damage ≥ 0 Might and non-zero → dies in the cleanup. Actual: it sits at bf1 with 2 damage marked.
    const game = await scenario().active(P2).resources(P2, { energy: 2 }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "bare").hand(P2, "ogs-003-024", "burn").build();
    await game.p2.cast("burn", { targets: "bare" });
    await game.settle();
    expect(game.has("bare") ? game.zoneOf("bare") : "gone").toBe("gone");
  });

  test("142.4.b in combat — a lone 0-Might defender takes 1 from a 1-Might attacker and dies; the attacker (dealt 0) stays and conquers", async () => {
    // Expected: bare → trash, poker holds bf1 for P2. Actual: the attacker is sent home and the
    // 0-Might defender keeps the battlefield undamaged (0-Might treated as unkillable).
    const game = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "bare").unit(P2, "base", { might: 1, name: "Poker" }, "poker").build();
    await game.p2.move("poker", "bf1");
    await game.settle();
    expect(game.has("bare")).toBe(false); // killed token ceases to exist (186.1)
    expect(game.locationOf("poker")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Mirror Image on Cloud Drake: ONE ready Reflection token in P1's base that is a copy — name, 5 Might, unit type, and (185.3.a.2) the copied Energy cost 6 — plus the granted [Temporary]", async () => {
    const game = await mirrorBoard(CLOUD_DRAKE).build();
    const tok = await castMirror(game);
    expect(reflections(game, "p1")).toHaveLength(1);
    expect(game.state(tok)).toMatchObject({ baseMight: 5, cardType: "unit", controller: P1, energyCost: 6, isReady: true, isToken: true, might: 5, name: "Cloud Drake", owner: P1, zone: "base" });
    expect(game.state(tok).keywords).toContain("Temporary");
    expect((game.state(tok).meta as { copyOfCardId?: string }).copyOfCardId).toBe("src");
    expect(game.state("src")).toMatchObject({ might: 5, zone: "base" }); // the original is untouched
    expect(game.zoneOf("mi")).toBe("trash");
  });

  test("'I don't get that card's play effects': the Cloud Drake copy entering play draws P1 NOTHING (hand: Mirror Image gone, no new card) and leaves no trigger behind", async () => {
    const game = await mirrorBoard(CLOUD_DRAKE).build();
    expect(game.p1.hand()).toEqual(["mi"]);
    await castMirror(game);
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("control: actually PLAYING Cloud Drake from hand does draw 1 — so the silence above is the token clause, not a dead trigger", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CLOUD_DRAKE, "drake").build();
    await game.p1.play("drake");
    await game.settle();
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("non-play abilities ARE copied and live (477.1.b.1.b example): a Reflection of Honest Broker has Deathknell; when [Temporary] kills it at P1's next Beginning Phase, P1 gets a Gold and the token ceases to exist (186.1)", async () => {
    const game = await mirrorBoard(HONEST_BROKER).build();
    const tok = await castMirror(game);
    expect(game.state(tok)).toMatchObject({ might: 2, name: "Honest Broker" });
    expect(game.state(tok).keywords).toEqual(expect.arrayContaining(["Deathknell", "Temporary"]));
    expect(golds(game, "p1")).toHaveLength(0);
    await game.advanceTurn(); // → P2
    expect(game.has(tok) && game.zoneOf(tok)).toBe("base"); // not P1's Beginning Phase yet
    await game.advanceTurn(); // → P1: Temporary kill → Deathknell → Gold
    expect(game.turnPlayer()).toBe(P1);
    expect(game.has(tok) ? game.zoneOf(tok) : "gone").not.toBe("base");
    expect(game.p1.trash()).not.toContain(tok); // 186.1: a token never rests in the trash
    expect(golds(game, "p1")).toHaveLength(1);
    expect(golds(game, "p2")).toHaveLength(0);
    expect(game.zoneOf("src")).toBe("base"); // the real Broker is fine
  });

  test("186.1: a Reflection bounced to hand (Retreat) ceases to exist — it is in nobody's hand, base or trash", async () => {
    const game = await mirrorBoard(CLOUD_DRAKE).resources(P1, { energy: 4, power: { mind: 2 } }).hand(P1, RETREAT, "retreat").build();
    const tok = await castMirror(game);
    await game.p1.cast("retreat", { targets: tok });
    await game.settle({ policy: "first" }); // Retreat's rune-channel rider is irrelevant here
    expect(game.p1.hand()).not.toContain(tok);
    expect(game.p1.base()).not.toContain(tok);
    expect(game.p1.trash()).not.toContain(tok);
    expect(reflections(game, "p1")).toHaveLength(0);
  });

  test("Mirror Image may copy an ENEMY unit: P1 gets (and controls, 182) a ready 7-Might copy of P2's Wall in P1's base; the Wall itself stays put", async () => {
    const game = await mirrorBoard({ might: 7, name: "Wall" } as never, { enemy: true }).build();
    const tok = await castMirror(game);
    expect(game.state(tok)).toMatchObject({ controller: P1, isReady: true, might: 7, name: "Wall", owner: P1, zone: "base" });
    expect(reflections(game, "p2")).toHaveLength(0);
    expect(game.state("src")).toMatchObject({ controller: P2, zone: "battlefield-bf1" });
  });

  test("Keeper of Masks: exactly TWO Reflections 'here' become 1-Might Keeper copies (Hidden + Temporary copied as rules text) — Keeper's own play effect is not re-run by the copies", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).battlefield("bf1", { controller: P1 }).hand(P1, KEEPER, "keeper").build();
    await game.p1.play("keeper", { to: "bf1" });
    await game.settle();
    const toks = reflections(game, "p1", "bf1");
    expect(toks).toHaveLength(2); // not 4, 6, … (no recursive "When you play me")
    expect(reflections(game, "p1", "base")).toHaveLength(0); // "here"
    for (const id of toks) {
      expect(game.state(id)).toMatchObject({ baseMight: 1, energyCost: 2, isToken: true, might: 1, name: "Keeper of Masks" });
      expect(game.state(id).keywords).toEqual(expect.arrayContaining(["Hidden", "Temporary"]));
      expect(game.state(id).isExhausted).toBe(true); // Keeper does not say "ready": 143.4 default
    }
    expect(game.chain()).toEqual([]);
  });

  test("copies are real units in combat: the two 1-Might Keeper Reflections defend alongside Keeper (1+1+1 = 3) and kill a 3-Might attacker", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).battlefield("bf1", { controller: P1 }).unit(P2, "base", { might: 3, name: "Raider" }, "raider").hand(P1, KEEPER, "keeper").build();
    await game.p1.play("keeper", { to: "bf1" });
    await game.settle();
    expect(reflections(game, "p1", "bf1")).toHaveLength(2);
    await game.advanceTurn(); // P2's turn (Temporary only bites at P1's next Beginning Phase)
    expect(reflections(game, "p1", "bf1")).toHaveLength(2);
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
  });
});

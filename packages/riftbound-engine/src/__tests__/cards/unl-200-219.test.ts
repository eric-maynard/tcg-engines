/**
 * Mirror Image — unl-200-219 · Spell · Mind/Order · 3 energy + 2 hybrid [mind|order] pips
 *
 *   Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit.
 *   Give it [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)
 *
 * No [Action]/[Reaction] in the text → standard timing. Rules: 187.6 (Reflection = domainless 0-Might unit
 * token), 184.1 ("ready" overrides the enter-exhausted default), 477.1.b.1 (a copy takes the PRINTED
 * copyable traits — name, type, tags, cost, domain, rules text — plus printed Might; not damage, buffs or
 * this-turn modifiers), 477.1.b.1.b (copying a copy yields what it currently copies), 185.3.a.2 (the token
 * now has the copied cost), 816 (Temporary: killed at the START of its controller's Beginning Phase),
 * 186.1 (a token leaving the board ceases to exist), 359.3.e.5/12 (if the chosen unit is gone on resolution
 * the instructions that reference it are skipped, target-free instructions still run), 163.2 (power pays
 * costs of ITS domain — a mind|order pip is not payable with fury).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Printed, not current: copying a buffed, damaged, Discipline-pumped 3-Might unit gives a clean 3.
 *  2. "Ready" is the whole point: the copy can Standard-Move the turn it appears.
 *  3. Temporary clock is the TOKEN's controller's Beginning Phase: copying an enemy unit still dies on
 *     YOUR next turn start, and survives the opponent's.
 *  4. The LeBlanc, Fragmented line: her Reflection has Deathknell; Temporary kills it in your Beginning
 *     Phase → "draw 2 instead" (+ the Draw step) — three cards across that turn start.
 *  5. Target bounced in response (Retreat): the token is still played (that instruction names no target)
 *     but copies nothing — a bare 0-Might Temporary Reflection.
 *  6. Copy of a copy: Mirror Image on a Reflection-of-X makes another X, not a "Reflection".
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-200-219";
const LEBLANC = "unl-172-219"; // 3-Might, Assault, [Deathknell] Draw 1 (2 in your Beginning Phase)
const RETREAT = "ogn-104-298"; // [Reaction] 1: Return a friendly unit to its owner's hand. …
const DISCIPLINE = "ogn-058-298"; // [Reaction] 2: Give a unit +2 Might this turn. Draw 1.

const tokensOf = (game: Game, seat: "p1" | "p2", at?: "base" | string) => game[seat].units(at as "base").filter((id) => game.state(id).isToken);

function withSource(source: Parameters<ReturnType<typeof scenario>["unit"]>[2], opts: { power?: Record<string, number>; energy?: number; enemy?: boolean; meta?: Record<string, unknown> } = {}) {
  const b = scenario()
    .resources(P1, { energy: opts.energy ?? 3, power: opts.power ?? { mind: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("open", { controller: null })
    .hand(P1, CARD, "mi");
  return opts.enemy ? b.unit(P2, "bf1", source, "src", opts.meta as never) : b.unit(P1, "base", source, "src", opts.meta as never);
}

async function castAndResolve(game: Game): Promise<string> {
  await game.p1.cast("mi", { targets: "src" });
  await game.settle();
  const toks = tokensOf(game, "p1", "base");
  expect(toks).toHaveLength(1);
  return toks[0]!;
}

describe("Mirror Image (unl-200-219)", () => {
  test("registry payload matches the printed text: standard-timing spell; one create-token effect — a READY 0-Might 'Reflection' unit token in base carrying CopyOnPlay + Temporary, whose copy source is a chosen unit (any side); 3 energy + 2 hybrid pips", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: ["mind", "order"], energyCost: 3, name: "Mirror Image", timing: "standard" });
    expect(def?.powerCost).toEqual(["rainbow", "rainbow"]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        location: "base",
        ready: true,
        target: { type: "unit" },
        token: { keywords: ["CopyOnPlay", "Temporary"], might: 0, name: "Reflection", type: "unit" },
        type: "create-token",
      },
      type: "spell",
    });
  });

  test("cost: 3 energy + two pips payable with mind and/or order power (1 mind + 1 order here); the spell goes to trash; 2 energy, or a single power, cannot pay", async () => {
    const game = await withSource({ might: 4, name: "Bruiser" }).build();
    await game.p1.cast("mi", { targets: "src" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
    await game.settle();
    expect(game.zoneOf("mi")).toBe("trash");
    expect((await withSource({ might: 4 }, { power: { order: 2 } }).build()).p1.can("cast", "mi")).toBe(true);
    expect((await withSource({ might: 4 }, { energy: 2 }).build()).p1.can("cast", "mi")).toBe(false);
    expect((await withSource({ might: 4 }, { power: { mind: 1 } }).build()).p1.can("cast", "mi")).toBe(false);
  });

  test("163.2 — hybrid mind|order pips are NOT payable with off-domain (fury) power", async () => {
    const game = await withSource({ might: 4 }, { power: { fury: 2 } }).build();
    expect(game.p1.can("cast", "mi")).toBe(false);
  });

  test("copies a friendly 4-Might, 5-cost unit: exactly one READY Reflection token in P1's base named like it, 4 Might, energy cost 5, with Temporary, owned and controlled by P1; the source is untouched", async () => {
    const game = await withSource({ energyCost: 5, might: 4, name: "Bruiser" }).build();
    const tok = await castAndResolve(game);
    expect(game.state(tok)).toMatchObject({ baseMight: 4, cardType: "unit", controller: P1, damage: 0, energyCost: 5, isReady: true, isToken: true, might: 4, name: "Bruiser", owner: P1, zone: "base" });
    expect(game.state(tok).keywords).toContain("Temporary");
    expect(game.state("src")).toMatchObject({ might: 4, name: "Bruiser", zone: "base" });
    expect(game.state("src").keywords).not.toContain("Temporary"); // "give IT Temporary" — the token, not the source
    expect(tokensOf(game, "p2")).toHaveLength(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("477.1.b.1.b printed traits only: copying a buffed (+1), damaged (2), Discipline-pumped (+2 this turn) printed-3 unit yields a clean 3-Might token — no buff, no damage, no modifier", async () => {
    const game = await withSource({ might: 3, name: "Veteran" }, { energy: 5, meta: { buffed: true, damage: 2 } }).hand(P1, DISCIPLINE, "disc").build();
    await game.p1.cast("disc", { targets: "src" });
    await game.settle();
    expect(game.state("src")).toMatchObject({ damage: 2, isBuffed: true, might: 6 }); // 3 +1 buff +2 this turn
    const tok = await castAndResolve(game);
    expect(game.state(tok)).toMatchObject({ baseMight: 3, damage: 0, isBuffed: false, might: 3, mightModifier: 0, name: "Veteran" });
  });

  test("'ready' matters: the fresh copy can Standard-Move the same turn — a 3-Might copy walks onto the open battlefield and conquers it", async () => {
    const game = await withSource({ might: 3, name: "Walker" }).build();
    const tok = await castAndResolve(game);
    expect(game.p1.can("move")).toBe(true);
    await game.p1.move(tok, "open");
    await game.settle();
    expect(game.locationOf(tok)).toBe("open");
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("[Temporary] clock: the token survives P2's whole turn and is killed at the START of P1's next Beginning Phase; being a token it then ceases to exist (not in trash, 186.1)", async () => {
    const game = await withSource({ might: 4, name: "Bruiser" }).build();
    const tok = await castAndResolve(game);
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.has(tok) && game.zoneOf(tok)).toBe("base");
    await game.advanceTurn(); // → P1: Beginning Phase kills it
    expect(game.turnPlayer()).toBe(P1);
    expect(game.has(tok) ? game.zoneOf(tok) : "gone").not.toBe("base");
    expect(game.p1.trash()).not.toContain(tok);
    expect(tokensOf(game, "p1")).toHaveLength(0);
    expect(game.zoneOf("src")).toBe("base"); // the original lives on
  });

  test("copying an ENEMY unit at a battlefield: the token is P1's (owner + controller), ready in P1's base; its Temporary still keys off P1's Beginning Phase — alive through P2's turn, gone at P1's", async () => {
    const game = await withSource({ might: 6, name: "Wall" }, { enemy: true }).build();
    const tok = await castAndResolve(game);
    expect(game.state(tok)).toMatchObject({ controller: P1, isReady: true, might: 6, name: "Wall", owner: P1, zone: "base" });
    expect(game.state("src")).toMatchObject({ controller: P2, zone: "battlefield-bf1" });
    await game.advanceTurn(); // P2's Beginning Phase came and went
    expect(game.has(tok) && game.zoneOf(tok)).toBe("base");
    await game.advanceTurn();
    expect(tokensOf(game, "p1")).toHaveLength(0);
  });

  test("'Choose a unit' is mandatory: with no unit anywhere on the board the spell cannot be played", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1, order: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "mi").build();
    expect(game.p1.can("cast", "mi")).toBe(false);
  });

  test("timing — standard speed only: not inside a showdown on your own turn, not on the opponent's turn", async () => {
    const showdown = await withSource({ might: 3, name: "Walker" }).unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await showdown.p1.move("scout", "open");
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown.p1.can("cast", "mi")).toBe(false);
    const theirs = await withSource({ might: 3 }).active(P2).build();
    expect(theirs.p1.can("cast", "mi")).toBe(false);
  });

  test("359.3.e.5/7/12 — the chosen unit is Retreated to hand in response: 'Play a ready Reflection token' names no target and must still execute (only 'becomes a copy of that unit' is skipped) → a bare 0-Might Temporary Reflection; the engine fizzles the whole spell and plays no token", async () => {
    // Expected: exactly one token in P1's base, name "Reflection", 0 Might, Temporary. Actual: zero tokens.
    const game = await withSource({ might: 4, name: "Bruiser" }, { energy: 4 }).hand(P1, RETREAT, "retreat").build();
    await game.p1.cast("mi", { targets: "src" });
    await game.p1.cast("retreat", { targets: "src" }); // P1 answers their own spell (holds priority first)
    expect(game.chain().map((i) => i.cardId)).toEqual(["mi", "retreat"]);
    await game.settle({ policy: "first" }); // Retreat's rune-channel rider is irrelevant here
    expect(game.zoneOf("src")).toBe("hand");
    expect(game.zoneOf("mi")).toBe("trash");
    const toks = tokensOf(game, "p1", "base");
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!)).toMatchObject({ might: 0, name: "Reflection" });
    expect(game.state(toks[0]!).keywords).toContain("Temporary");
  });

  test("477.1.b.1.b copy of a copy: a second Mirror Image aimed at the Reflection-of-Bruiser produces another 4-Might 'Bruiser', not a 0-Might 'Reflection'", async () => {
    const game = await withSource({ might: 4, name: "Bruiser" }, { energy: 6, power: { mind: 2, order: 2 } }).hand(P1, CARD, "mi2").build();
    const first = await castAndResolve(game);
    await game.p1.cast("mi2", { targets: first });
    await game.settle();
    const toks = tokensOf(game, "p1", "base");
    expect(toks).toHaveLength(2);
    for (const t of toks) {
      expect(game.state(t)).toMatchObject({ isReady: true, might: 4, name: "Bruiser" });
      expect(game.state(t).keywords).toContain("Temporary");
    }
  });

  test("the LeBlanc, Fragmented line (setup): her Reflection is a ready 3-Might 'LeBlanc, Fragmented' with Assault, Deathknell AND Temporary; the real LeBlanc keeps no Temporary", async () => {
    const game = await withSource(LEBLANC).build();
    const tok = await castAndResolve(game);
    expect(game.state(tok)).toMatchObject({ energyCost: 3, isReady: true, might: 3, name: "LeBlanc, Fragmented" });
    expect(game.state(tok).keywords).toEqual(expect.arrayContaining(["Assault", "Deathknell", "Temporary"]));
    expect(game.state("src").keywords).not.toContain("Temporary");
    // Control: across P1's next turn start the copy dies to Temporary and its copied Deathknell draws at least 1.
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(tokensOf(game, "p1")).toHaveLength(0);
    expect(game.p1.hand().length).toBeGreaterThanOrEqual(2); // ≥1 Deathknell + 1 Draw step
    expect(game.zoneOf("src")).toBe("base");
  });

  test("the LeBlanc line pays off 'draw 2 instead' — the copy's Deathknell resolves in P1's Beginning Phase (Temporary kill), so P1 should go 0 → 3 cards across that turn start (2 + Draw step); the engine's LeBlanc parse only ever draws 1", async () => {
    const game = await withSource(LEBLANC).build();
    await castAndResolve(game);
    expect(game.p1.hand()).toHaveLength(0);
    await game.advanceTurn(); // → P2
    expect(game.p1.hand()).toHaveLength(0);
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(tokensOf(game, "p1")).toHaveLength(0);
    expect(game.p1.hand()).toHaveLength(3);
  });
});

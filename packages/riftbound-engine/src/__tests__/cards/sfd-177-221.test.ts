/**
 * Azir, Sovereign — sfd-177-221 · Champion Unit · Order · 4 energy · 4 Might · Azir
 *
 *   [Accelerate] (You may pay [1][order] as an additional cost to have me enter ready.)
 *   When I attack, you may move any number of your token units to this battlefield.
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. "When I attack" fires when Azir gains the Attacker designation (383.4.e) — not when he defends,
 *     and not when he walks onto an EMPTY enemy battlefield (a non-combat showdown is not combat).
 *  2. "your TOKEN units": Sand Soldiers / Birds / … only. A printed unit and Azir himself must
 *     never be offered. Tokens come from anywhere on your board (base AND other battlefields);
 *     emptying another battlefield costs you its control at the next cleanup (190.4.c).
 *  3. It is an effect move, not a Standard Move: no exhaust cost, exhausted tokens move too and keep
 *     their state; arrivals join the combat as attackers (464.2.c.3.a) and swing the fight — Azir
 *     alone bounces off a stunned 5-Might wall, Azir + two soldiers (8) take it.
 *  4. "you may … any number": declining, or choosing zero, moves nothing; the trigger still used
 *     the chain and the opponent had priority.
 *  5. Accelerate is [1][order] specifically (805.1.a.1); 4 energy flat otherwise, no power pip.
 *  6. Real minted tokens (Desert's Call's Sand Soldier) must be recognised exactly like pre-placed ones.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-177-221";
const DESERTS_CALL = "sfd-031-221"; // 2 energy: Play a 2 [Might] Sand Soldier unit token.
const SAND_SOLDIER = { might: 2, name: "Sand Soldier", tags: ["Sand Soldier"] };
/** Reaction removal used to make Azir leave the battlefield while his trigger is still on the chain. */
const REACTION_KILL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Snipe",
  timing: "reaction",
};
const REACTION_RECALL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "recall" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Flash",
  timing: "reaction",
};

/** Azir + a ready soldier token + a printed ally in base, an exhausted soldier token holding bf2, a stunned 5-Might wall on P2's bf1. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", CARD, "azir")
    .unit(P1, "base", SAND_SOLDIER, "token-s1")
    .unit(P1, "bf2", SAND_SOLDIER, "token-s2", { exhausted: true })
    .unit(P1, "base", { might: 3, name: "Printed Ally" }, "real")
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall", { stunned: true }); // stunned: deals no combat damage
}

/** After Azir's move: accept the "you may" and return the (finalize-time) target prompt — or, past it, pass priority around and return whatever comes next. */
async function toTargetPrompt(game: Game, accept = true): Promise<Decision | null> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind === "pick") {
      return d;
    }
    if (d.kind === "yes-no") {
      await (accept ? game.seat(d.seat).yes() : game.seat(d.seat).no());
    } else if (d.kind === "action" && game.chain().length > 0) {
      await game.seat(d.seat).pass();
    } else {
      return d;
    }
  }
  return game.decision();
}

describe("Azir, Sovereign (sfd-177-221)", () => {
  test("cost: 4 energy and no power; enters exhausted; 3 energy is short", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "azir").build();
    await game.p1.play("azir");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("azir")).toBe("base");
    expect(game.state("azir")).toMatchObject({ isExhausted: true, might: 4 });
    expect((await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, CARD, "azir").build()).p1.can("play", "azir")).toBe(false);
  });

  test("Accelerate: 5 energy + [order] → enters ready; the pip must be order (a calm power will not do), and 4 + order is an energy short", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).hand(P1, CARD, "azir").build();
    await game.p1.play("azir", { accelerate: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.state("azir").isReady).toBe(true);
    const calm = await scenario().resources(P1, { energy: 5, power: { calm: 1 } }).hand(P1, CARD, "azir").build();
    expect((await calm.p1.try((p) => p.play("azir", { accelerate: true }))).ok).toBe(false);
    const short = await scenario().resources(P1, { energy: 4, power: { order: 1 } }).hand(P1, CARD, "azir").build();
    expect((await short.p1.try((p) => p.play("azir", { accelerate: true }))).ok).toBe(false);
    expect(short.zoneOf("azir")).toBe("hand");
  });

  test("attacking puts the optional trigger on the chain; the controller is asked 'you may' and names the tokens as it is finalized (402.1–402.2), and the opponent gets priority before it resolves", async () => {
    const game = await board().build();
    await game.p1.move("azir", "bf1");
    expect(game.state("azir").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", controller: P1, triggered: true })]);
    // The "you may" and the "any number of your token units" set are P1's calls while the trigger is
    // FINALIZED; P2 must then hold priority with the trigger still on the chain before anything moves.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    await game.p1.pick("token-s1", "token-s2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", targets: ["token-s1", "token-s2"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.pass();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()).toHaveLength(1);
    expect(game.locationOf("token-s1")).toBe("base");
    await game.p2.pass();
    expect(game.decision()?.kind).not.toBe("pick"); // nothing is asked again on resolution
    expect(game.locationOf("token-s1")).toBe("bf1");
  });

  test("only TOKEN units are offered — the printed ally and Azir himself are not legal choices", async () => {
    // Expected: the pick lists exactly the two Sand Soldier tokens. Actual: the `filter: "token"`
    // descriptor is ignored at resolution, so "real" and "azir" are offered as well.
    const game = await board().build();
    await game.p1.move("azir", "bf1");
    const d = await toTargetPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["token-s1", "token-s2"]);
  });

  test("moving both tokens (from base AND from bf2): they arrive as attackers, keep their ready/exhausted state, and bf2 is left uncontrolled", async () => {
    const game = await board().build();
    await game.p1.move("azir", "bf1");
    const d = await toTargetPrompt(game);
    expect(d?.kind).toBe("pick");
    await game.p1.answer(["token-s1", "token-s2"]);
    await toTargetPrompt(game); // drain any continuation / priority back to the open showdown
    expect(game.locationOf("token-s1")).toBe("bf1");
    expect(game.locationOf("token-s2")).toBe("bf1");
    expect(game.locationOf("real")).toBe("base");
    expect(game.state("token-s1")).toMatchObject({ combatRole: "attacker", isExhausted: false });
    expect(game.state("token-s2")).toMatchObject({ combatRole: "attacker", isExhausted: true });
    expect(game.state("azir").isExhausted).toBe(true); // he paid the standard-move cost; the tokens did not
    await game.settle();
    // 4 + 2 + 2 = 8 ≥ 5 kills the stunned wall (which deals nothing back): Azir conquers bf1.
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.units("bf1").sort()).toEqual(["azir", "token-s1", "token-s2"]);
    expect(game.gameState.battlefields.bf2?.controller).not.toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control case — declining the 'you may': nothing moves, and Azir alone (4 < 5) bounces off the wall and is recalled", async () => {
    const game = await board().build();
    await game.p1.move("azir", "bf1");
    const d = await toTargetPrompt(game, false);
    expect(d?.kind).not.toBe("pick");
    expect(game.locationOf("token-s1")).toBe("base");
    expect(game.locationOf("token-s2")).toBe("bf2");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.zoneOf("azir")).toBe("base"); // recalled: defenders remained (466.1.a.2)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("'any number' includes just one: move only the base soldier; the bf2 soldier stays and keeps holding bf2", async () => {
    const game = await board().build();
    await game.p1.move("azir", "bf1");
    await toTargetPrompt(game);
    await game.p1.answer(["token-s1"]);
    await toTargetPrompt(game);
    expect(game.locationOf("token-s1")).toBe("bf1");
    expect(game.locationOf("token-s2")).toBe("bf2");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // 4 + 2 = 6 ≥ 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("with no token units on the board there is nothing to choose — the printed ally is never offered and never moves", async () => {
    // Expected: after accepting, either no target prompt at all or an empty/decline-only one.
    // Actual: the non-token ally (and Azir) are offered as move targets.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "azir")
      .unit(P1, "base", { might: 3, name: "Printed Ally" }, "real")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall", { stunned: true })
      .build();
    await game.p1.move("azir", "bf1");
    const d = await toTargetPrompt(game);
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).not.toContain("real");
    expect(offered).not.toContain("azir");
    if (d?.kind === "pick") {
      await game.p1.decline();
    }
    await game.settle();
    expect(game.locationOf("real")).toBe("base");
  });

  // rule 359.3.f.2 — "to this battlefield" is a referent read off the source as the instruction
  // executes. Azir killed in response ⇒ no such location ⇒ the whole instruction is ignored: the
  // controller must not even be asked which tokens to move.
  test("Azir killed while his trigger is on the chain: 'this battlefield' has no referent — no target prompt is raised and no token moves", async () => {
    const game = await board().resources(P1, { energy: 1 }).hand(P1, REACTION_KILL, "snipe").build();
    await game.p1.move("azir", "bf1");
    expect(game.chain()).toHaveLength(1);
    await game.p1.yes();
    await game.p1.pick("token-s1", "token-s2"); // the set is named at finalization (402.2) …
    await game.p1.cast("snipe", { targets: "azir" });
    await game.settle();
    expect(game.zoneOf("azir")).toBe("trash");
    expect(game.decision()?.kind).not.toBe("pick"); // … and nothing is asked on resolution
    expect(game.locationOf("token-s1")).toBe("base");
    expect(game.locationOf("token-s2")).toBe("bf2");
  });

  // Same referent rule for a recall: base is not a battlefield, so the tokens must NOT be dragged to base.
  test("Azir recalled to base while his trigger is on the chain: no target prompt and the tokens stay put (they are never pulled to base)", async () => {
    const game = await board().resources(P1, { energy: 1 }).hand(P1, REACTION_RECALL, "flash").build();
    await game.p1.move("azir", "bf1");
    expect(game.chain()).toHaveLength(1);
    await game.p1.yes();
    await game.p1.pick("token-s1", "token-s2");
    await game.p1.cast("flash", { targets: "azir" });
    await game.settle();
    expect(game.locationOf("azir")).toBe("base");
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.locationOf("token-s1")).toBe("base");
    expect(game.locationOf("token-s2")).toBe("bf2");
  });

  test("negative space: DEFENDING Azir does not trigger (it is an attack trigger)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "azir")
      .unit(P1, "base", SAND_SOLDIER, "token-s1")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("azir").combatRole).toBe("defender");
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    expect(game.locationOf("token-s1")).toBe("base");
    expect(game.zoneOf("raider")).toBe("trash"); // 4 ≥ 3; 3 < 4
  });

  test("negative space: moving onto an EMPTY enemy battlefield is a showdown, not an attack — no trigger, tokens stay, Azir conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "azir")
      .unit(P1, "base", SAND_SOLDIER, "token-s1")
      .build();
    await game.p1.move("azir", "bf1");
    expect(game.state("azir").combatRole).toBeNull();
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    await game.settle();
    expect(game.locationOf("token-s1")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("a Sand Soldier actually minted by Desert's Call this turn is a token too: it is offered and rides along to the fight", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "azir")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall", { stunned: true })
      .hand(P1, DESERTS_CALL, "call")
      .build();
    await game.p1.cast("call");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
      await game.settle();
    }
    const minted = game.p1.units("base").find((id) => game.state(id).isToken);
    expect(minted).toBeDefined();
    expect(game.state(minted as string)).toMatchObject({ might: 2, name: "Sand Soldier" });
    await game.p1.move("azir", "bf1");
    const d = await toTargetPrompt(game);
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain(minted as string);
    await game.p1.answer([minted as string]);
    await toTargetPrompt(game);
    expect(game.locationOf(minted as string)).toBe("bf1");
    expect(game.state(minted as string).combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // 4 + 2 ≥ 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("parsed abilities match the printed text: Accelerate [1][order]; optional attack trigger moving any number of friendly TOKEN units here", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 4, isChampion: true, might: 4, tags: ["Azir"] });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ cost: { energy: 1, power: ["order"] }, keyword: "Accelerate", type: "keyword" });
    expect(abilities[1]).toMatchObject({
      effect: { target: { controller: "friendly", filter: "token", quantity: "any", type: "unit" }, to: "here", type: "move" },
      optional: true,
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    });
  });
});

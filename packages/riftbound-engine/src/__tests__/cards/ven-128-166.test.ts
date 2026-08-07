/**
 * Noxian Emissary — ven-128-166 · Unit · Order · 2 energy · 2 Might
 *
 *   [Empower] [1][order] ([1][order]: Empower me. Use only if not Empowered.)
 *   [Empowered][>][Deathknell][>] Play two 1 [Might] Recruit unit tokens to your base.
 *   (When I die while Empowered, get the effect.)
 *
 * Head-judge notes — the tricky situations for THIS card:
 *   1. [Empower] [1][order] is an activated ability (827.1.c.1): 1 energy + 1 order up front, a non-triggered
 *      chain item, own turn / Open state only (381), never while already Empowered. Killed IN RESPONSE to it
 *      (LIFO) the Emissary dies un-Empowered → no Recruits, and the resources stay spent.
 *   2. The Deathknell is a DEPENDENT ability (828.1.b.1): it exists only while Empowered. The status is read as
 *      the unit dies (808.1.d.3 — note attributes before it hits the trash, where statuses are wiped): Empowered
 *      at death → trigger; plain 2/2 at death → nothing, however it dies.
 *   3. Any death counts: kill spell, lethal damage, or combat (323.4) — and "to your base" means the tokens land
 *      in the controller's BASE even when the Emissary died at a battlefield; exactly two, 1 Might, Recruit tag,
 *      tokens, controlled by the Emissary's controller.
 *   4. It is a triggered chain item (808 / 383.3): the opponent gets priority before any token exists.
 *   5. Turn-scoped empower (Sanction) → dies the same turn: tokens; survives to next turn: back to a plain 2/2
 *      whose death makes nothing.
 *   6. Partner — Viktor, Leader (ogn-246): the Emissary is a non-Recruit, so Viktor adds a third Recruit; the
 *      Recruit tokens themselves never re-trigger Viktor.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-128-166";
const VIKTOR = "ogn-246-298"; // When another non-Recruit unit you control dies, play a Recruit token into your base
const SANCTION = "ven-035-166"; // Calm Reaction: mode 0 = Empower a unit, disempower it at end of turn
const KILL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Kill",
  timing: "reaction",
};
const recruits = (ids: string[]) => ids.filter((c) => c.startsWith("token-recruit-"));

/** Emissary in P1's base (Empowered per flag), a free reaction kill spell in each hand, bf1 held by P1. */
function board(empowered: boolean) {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", CARD, "em", empowered ? { empowered: true } : undefined)
    .hand(P1, KILL, "kill")
    .hand(P2, KILL, "theirKill");
}

async function killAndResolve(game: Game, seat: typeof P1 | typeof P2 = P1): Promise<void> {
  await game.seat(seat).cast(seat === P1 ? "kill" : "theirKill", { targets: "em" });
  await game.settle();
}

describe("Noxian Emissary (ven-128-166)", () => {
  test("registry payload: 2-cost 2-Might order unit; activated Empower [1][order] (not-empowered); a while-Empowered Deathknell that creates two 1-Might Recruit tokens in base", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 2, might: 2, name: "Noxian Emissary" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities.find((a) => a.type === "activated")).toMatchObject({
      cost: { energy: 1, power: ["order"] },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
    });
    expect(abilities.find((a) => a.type === "keyword")).toMatchObject({ condition: { type: "while-empowered" }, keyword: "Deathknell" });
    expect(abilities.find((a) => a.type === "triggered")).toMatchObject({
      condition: { type: "while-empowered" },
      effect: { amount: 2, location: "base", token: { might: 1, name: "Recruit", type: "unit" }, type: "create-token" },
      trigger: { event: "die", on: "self" },
    });
  });

  test("play cost: 2 energy, no power; enters exhausted at 2 Might, not Empowered, printed Deathknell keyword; 1 energy is short", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "em").build();
    await game.p1.play("em");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("em")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 2, zone: "base" });
    expect(game.state("em").keywords).toContain("Deathknell");
    expect((await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "em").build()).p1.can("play", "em")).toBe(false);
  });

  test("[Empower] [1][order]: pays 1 energy + 1 order, non-triggered chain item P2 may answer, resolves → Empowered (still 2 Might); not offered again", async () => {
    const game = await board(false).resources(P1, { energy: 2, power: { order: 2 } }).build();
    await game.p1.activate("em");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "em", controller: P1, triggered: false })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.state("em")).toMatchObject({ isEmpowered: true, might: 2 });
    expect(game.p1.can("activate", "em")).toBe(false);
  });

  test("negative space — no order power, no energy, already Empowered, or the opponent's turn: [Empower] is not offered", async () => {
    expect((await board(false).resources(P1, { energy: 1, power: { order: 0 } }).build()).p1.can("activate", "em")).toBe(false);
    expect((await board(false).resources(P1, { energy: 0, power: { order: 1 } }).build()).p1.can("activate", "em")).toBe(false);
    expect((await board(true).build()).p1.can("activate", "em")).toBe(false);
    expect((await board(false).active(P2).build()).p1.can("activate", "em")).toBe(false);
    expect((await board(false).build()).p1.can("activate", "em")).toBe(true);
  });

  test("NOT Empowered when it dies (kill spell) → no Deathknell item, no Recruits", async () => {
    const game = await board(false).build();
    await killAndResolve(game);
    expect(game.zoneOf("em")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(recruits(game.p1.base())).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Empowered when killed → the Deathknell goes on the chain as P1's trigger (P2 gets priority first), then two 1-Might Recruit TOKENS appear in P1's base", async () => {
    // Expected (808 / 828.1.b.1 / 187.1). Actual: the while-empowered Deathknell never triggers — no chain item, no tokens.
    const game = await board(true).build();
    await game.p1.cast("kill", { targets: "em" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // kill resolves
    expect(game.zoneOf("em")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "em", controller: P1, triggered: true })]);
    expect(recruits(game.p1.base())).toEqual([]); // nothing before resolution
    await game.settle();
    const toks = recruits(game.p1.base());
    expect(toks).toHaveLength(2);
    for (const t of toks) {
      expect(game.state(t)).toMatchObject({ controller: P1, isToken: true, might: 1, name: "Recruit", owner: P1 });
    }
    expect(recruits(game.p2.base())).toEqual([]);
  });

  test("killed by the OPPONENT's spell on their turn while Empowered → still MY two Recruits in MY base", async () => {
    const game = await board(true).active(P2).build();
    await killAndResolve(game, P2);
    expect(game.zoneOf("em")).toBe("trash");
    expect(recruits(game.p1.base())).toHaveLength(2);
    expect(recruits(game.p2.base())).toEqual([]);
  });

  test("dies IN COMBAT at a battlefield while Empowered (323.4) → the two Recruits are played to my BASE, not to that battlefield", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "em", { empowered: true })
      .unit(P2, "base", { might: 5, name: "Bruiser" }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("em")).toBe("trash");
    expect(recruits(game.p1.base())).toHaveLength(2);
    expect(recruits(game.p1.units("bf1"))).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // the attacker still conquered
  });

  test("killed IN RESPONSE to its own [Empower] (LIFO): it dies un-Empowered → no Recruits; the [1][order] stays spent; the trashed card is not Empowered", async () => {
    const game = await board(false).build();
    await game.p1.activate("em");
    await game.p1.passPriority();
    await game.p2.cast("theirKill", { targets: "em" });
    await game.settle();
    expect(game.zoneOf("em")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("em").isEmpowered).toBe(false);
    expect(recruits(game.p1.base())).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("Empower it, THEN kill it later the same turn → two Recruits (the status acquired via the ability counts)", async () => {
    const game = await board(false).build();
    await game.p1.activate("em");
    await game.settle();
    expect(game.state("em").isEmpowered).toBe(true);
    await killAndResolve(game);
    expect(game.zoneOf("em")).toBe("trash");
    expect(recruits(game.p1.base())).toHaveLength(2);
  });

  test("turn-only empower (Sanction) — dying that same turn while Empowered still yields two Recruits", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P1, "base", CARD, "em")
      .unit(P2, "base", { might: 3, name: "Bystander" }, "by")
      .hand(P1, SANCTION, "sanc")
      .hand(P1, KILL, "kill")
      .build();
    await game.p1.cast("sanc");
    for (let i = 0; i < 6 && !game.state("em").isEmpowered; i++) {
      await game.settle();
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        const key = d.options.find((o) => o.card === "em" || o.key === "em")?.key ?? d.options.find((o) => o.key === "0")?.key;
        await game.p1.answer({ keys: [key as string], kind: "pick" });
      }
    }
    await game.settle();
    expect(game.state("em").isEmpowered).toBe(true);
    await killAndResolve(game);
    expect(recruits(game.p1.base())).toHaveLength(2);
  });

  test("Sanction'd Emissary that survives the turn is a plain 2/2 again next turn — dying then makes nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .unit(P1, "base", CARD, "em")
      .unit(P2, "base", { might: 3, name: "Bystander" }, "by")
      .hand(P1, SANCTION, "sanc")
      .hand(P2, KILL, "theirKill")
      .build();
    await game.p1.cast("sanc");
    for (let i = 0; i < 6 && !game.state("em").isEmpowered; i++) {
      await game.settle();
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        const key = d.options.find((o) => o.card === "em" || o.key === "em")?.key ?? d.options.find((o) => o.key === "0")?.key;
        await game.p1.answer({ keys: [key as string], kind: "pick" });
      }
    }
    await game.settle();
    expect(game.state("em").isEmpowered).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("em").isEmpowered).toBe(false);
    await killAndResolve(game, P2);
    expect(game.zoneOf("em")).toBe("trash");
    expect(recruits(game.p1.base())).toEqual([]);
  });

  test("partner — with Viktor, Leader on board an Empowered Emissary's death yields THREE Recruits (2 + Viktor's 1); the tokens themselves trigger nothing further", async () => {
    const game = await board(true).unit(P1, "base", VIKTOR, "vik").build();
    await killAndResolve(game);
    await game.settle();
    expect(game.zoneOf("em")).toBe("trash");
    expect(recruits(game.p1.base())).toHaveLength(3);
    expect(game.chain()).toEqual([]);
  });
});

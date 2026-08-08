/**
 * Royal Guard — sfd-157-221 · Unit · Order · 4 energy · 2 Might
 *
 *   When you play me, play a 2 [Might] Sand Soldier unit token here.
 *
 * Rules: 383 ("When you play me" is a triggered ability → a chain item that can be reacted to),
 * 187.3 (Sand Soldier = domainless 2-Might unit token), 182/183 (token controller/owner = the
 * ability's controller), 185.2.d + 143.4 (token units enter exhausted), 184.2 ("here" restricts
 * where the token is played — no destination choice), 359.3.f.2 / 359.3.f.2.a ("here" is a referent
 * read from the source WHEN THE INSTRUCTION EXECUTES: moved in response → new location; gone from
 * the board → null → instruction ignored), 186.1 (a token put into a non-board zone ceases to exist).
 *
 * Head-judge corner cases considered:
 *   - "here" = base vs. a controlled battlefield (with a second controlled battlefield around, no
 *     prompt may appear — the location is fixed by the text);
 *   - response window: Gust bounces the 2-Might Guard before the trigger resolves → no token at all;
 *     Flash drags it to base in response → the token follows it to base;
 *   - partner Renata Glasc, Industrialist: the Sand Soldier enters ready, the Guard itself does not;
 *   - the token really is a token: 0 cost, no domain, vanishes instead of hitting the trash when it
 *     dies in a real combat next turn;
 *   - negative space: moving the Guard later is not "playing" it — no second token.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-157-221";
const GUST = "ogn-169-298"; // [Reaction] 1 energy: return a unit at a battlefield with ≤3 Might to hand
const FLASH = "ogs-011-024"; // [Reaction] 2 energy: move up to 2 friendly units to base
const RENATA = "sfd-171-221"; // Your tokens enter ready.

const soldiers = (game: Game, owner = P1) =>
  game.findAll({ name: "Sand Soldier", owner }).filter((id) => game.locationOf(id) !== undefined);

function board(energy = 4) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: P2 })
    .hand(P1, CARD, "rg");
}

describe("Royal Guard (sfd-157-221)", () => {
  test("costs 4 energy; played to base it enters exhausted and its play trigger goes on the chain as P1's item", async () => {
    const game = await board().build();
    await game.p1.play("rg", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("rg")).toBe("base");
    expect(game.state("rg")).toMatchObject({ isExhausted: true, might: 2 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rg", controller: P1, triggered: true })]);
    expect(soldiers(game)).toHaveLength(0); // nothing until it resolves
    await game.settle();
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    const s = game.state(made[0] as string);
    expect(s).toMatchObject({ baseMight: 2, cardType: "unit", controller: P1, energyCost: 0, isExhausted: true, isToken: true, might: 2, owner: P1, zone: "base" });
    expect(s.domains).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("'here' at a battlefield: played to bf1 the Sand Soldier appears AT bf1 — no destination prompt even with bf2 also controlled (184.2)", async () => {
    const game = await board().build();
    await game.p1.play("rg", { to: "bf1" });
    const r = await game.settle();
    expect(r.reason).toBe("open"); // never stopped on a pick
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.zoneOf(made[0] as string)).toBe("battlefield-bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["rg", made[0] as string].sort());
    expect(game.p1.units("bf2")).toEqual([]);
    expect(game.p1.units("base")).toEqual([]);
  });

  test("play destinations are base or a battlefield you control — never the enemy-held bf3; unaffordable at 3 energy", async () => {
    const game = await board().build();
    const dests = game.p1.option("play", "rg")?.fields.find((f) => f.arg === "to")?.options;
    expect(dests).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
    const bad = await game.p1.try((p) => p.play("rg", { to: "bf3" }));
    expect(bad.ok).toBe(false);
    const poor = await board(3).build();
    expect(poor.p1.can("play", "rg")).toBe(false);
  });

  test("response window: P2 Gusts the Guard back to hand before the trigger resolves → 'here' is null, NO token is played anywhere (359.3.f.2.a)", async () => {
    const game = await board().resources(P2, { energy: 1 }).hand(P2, GUST, "gust").build();
    await game.p1.play("rg", { to: "bf1" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("gust", { targets: "rg" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rg", "gust"]);
    await game.settle();
    expect(game.zoneOf("rg")).toBe("hand");
    expect(game.findAll({ name: "Sand Soldier" })).toHaveLength(0);
    expect(game.p1.energy()).toBe(0); // the cost stays paid
  });

  test("referent read on execution: P1 Flashes the Guard to base in response → the Sand Soldier is played to BASE, not bf1 (359.3.f.2)", async () => {
    const game = await board(6).hand(P1, FLASH, "flash").build();
    await game.p1.play("rg", { to: "bf1" });
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("flash", { targets: "rg" });
    await game.settle();
    expect(game.zoneOf("rg")).toBe("base");
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.zoneOf(made[0] as string)).toBe("base");
    expect(game.cardsAt("bf1")).toEqual([]);
  });

  test("partner — with Renata Glasc, Industrialist on board the token enters READY while Royal Guard itself still enters exhausted", async () => {
    const game = await board().unit(P1, "base", RENATA, "renata").build();
    await game.p1.play("rg", { to: "bf1" });
    await game.settle();
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0] as string).isReady).toBe(true);
    expect(game.state("rg").isExhausted).toBe(true);
  });

  test("an OPPONENT's Renata does not ready your token ('YOUR tokens')", async () => {
    const game = await board().unit(P2, "base", RENATA, "theirRenata").build();
    await game.p1.play("rg", { to: "base" });
    await game.settle();
    const made = soldiers(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0] as string).isExhausted).toBe(true);
  });

  test("the pair defends together next turn: a 5-Might attacker trades with Guard (2) + Soldier (2); the dead token ceases to exist (186.1), the Guard goes to trash", async () => {
    const game = await board().unit(P2, "base", { might: 5, name: "Brute" }, "brute").build();
    await game.p1.play("rg", { to: "bf1" });
    await game.settle();
    const [token] = soldiers(game);
    expect(token).toBeDefined();
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("brute", "bf1");
    await game.settle();
    // 4 total defending damage < 5 → Brute survives; 5 attacking damage kills both 2-Might defenders.
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.zoneOf("rg")).toBe("trash");
    expect(game.p1.trash()).not.toContain(token as string);
    expect(!game.has(token as string) || game.locationOf(token as string) === undefined).toBe(true);
    expect(game.findAll({ name: "Sand Soldier", zone: "trash" })).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("negative space: moving the Guard to a battlefield on a later turn is not playing it — no second Sand Soldier", async () => {
    const game = await board().build();
    await game.p1.play("rg", { to: "base" });
    await game.settle();
    expect(soldiers(game)).toHaveLength(1);
    await game.advanceTurn();
    await game.advanceTurn(); // back to P1, Guard is ready
    expect(game.state("rg").isReady).toBe(true);
    await game.p1.move("rg", "bf1");
    await game.settle();
    expect(game.locationOf("rg")).toBe("bf1");
    expect(soldiers(game)).toHaveLength(1);
    expect(game.chain()).toHaveLength(0);
  });

  test("registry payload: exactly one play-self trigger creating a 2-Might Sand Soldier unit token 'here'; 4-cost Order unit, no power pip", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 4, might: 2, name: "Royal Guard" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      {
        effect: { location: "here", token: { might: 2, name: "Sand Soldier", type: "unit" }, type: "create-token" },
        trigger: { event: "play-self" },
        type: "triggered",
      },
    ]);
  });
});

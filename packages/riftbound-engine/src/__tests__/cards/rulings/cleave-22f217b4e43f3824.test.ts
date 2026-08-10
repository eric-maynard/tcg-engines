/**
 * Ruling 22f217b4e43f3824 — Cleave (OGN-004 → ogn-004-298) · Action spell · Fury · [1] "Give a unit [Assault 3] this turn."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction spell · Chaos · [1] "Return a unit at a battlefield with 3 [Might] or less
 *     to its owner's hand."
 *   on Traveling Merchant (ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *
 * Q: Opponent Cleaves their Merchant in base, then moves it into my battlefield. Can I Gust it in response to its
 *    "When I move" trigger, before it gets +3 as an attacker?
 * A: Yes. The move trigger goes on the chain; combat cannot begin (and attacker/defender roles are not assigned) while
 *    the chain is non-empty, so the Merchant is still a 2-Might unit at a battlefield → Gust returns it to hand and no
 *    combat ever starts. ("When I attack" triggers differ — they need roles assigned.)
 * Rules: 727 (Assault: only while an attacker), 460/461 (combat begins only once the chain is empty), 383.2.c.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const GUST = "ogn-169-298";
const TRAVELING_MERCHANT = "ogn-185-298";
const SKULKER = "ogn-175-298"; // discard fodder for the Merchant's trigger

/** P2's turn. P1 holds bf1 with a 2-Might Guard and has Gust + [1]. P2: Merchant ready in base, Cleave + [1], a spare hand card. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .hand(P1, GUST, "gust")
    .resources(P1, { energy: 1 })
    .unit(P2, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P2, CLEAVE, "cleave")
    .hand(P2, SKULKER, "fodder")
    .resources(P2, { energy: 1 });
}

/** Cleave the Merchant (Assault 3 this turn), then move it into bf1; stop with its move trigger on the chain. */
async function cleaveThenMoveIn(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("cleave", { targets: "merchant" });
  await game.settle();
  expect(game.state("merchant").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  expect(game.state("merchant").might).toBe(2); // not attacking → Assault dormant
  await game.p2.move("merchant", "bf1");
  expect(game.zoneOf("merchant")).toBe("battlefield-bf1"); // the move itself is not denied
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P2, triggered: true })]);
  return game;
}

describe("Ruling 22f217b4e43f3824 — Gust the Cleaved Merchant in response to its 'When I move' trigger, before combat/Assault", () => {
  test("while the move trigger is on the chain no combat has begun: no showdown, no roles, Merchant is still 2 Might (Assault 3 not active)", async () => {
    const game = await cleaveThenMoveIn();
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.state("merchant").combatRole).toBeNull();
    expect(game.state("guard").combatRole).toBeNull();
    expect(game.state("merchant").might).toBe(2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("after P2 passes, P1 may respond with Gust and the Merchant (2 ≤ 3 Might, at a battlefield) is a legal target", async () => {
    const game = await cleaveThenMoveIn();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "gust")).toBe(true);
    const offered = (game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("merchant");
    await game.p1.cast("gust", { targets: "merchant" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant", "gust"]);
  });

  test("Gust resolves first (LIFO): Merchant goes back to P2's hand; then its trigger resolves (discard 1, draw 1); combat never starts — Guard untouched, bf1 stays P1's, no showdown", async () => {
    const game = await cleaveThenMoveIn();
    await game.p2.passPriority();
    await game.p1.cast("gust", { targets: "merchant" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("merchant")).toBe("hand");
    expect(game.p2.hand()).toContain("merchant");
    // The orphaned move trigger still resolves: P2 discards (choose the fodder) then draws.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P2 && d.options.some((o) => (o.card ?? o.key) === "fodder")) {
        await game.p2.pick("fodder");
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.state("guard")).toMatchObject({ combatRole: null, damage: 0 });
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if nobody responds, the chain empties, combat begins, the Merchant becomes the attacker at 2+3 = 5 Might — and is then out of Gust's reach", async () => {
    const game = await cleaveThenMoveIn();
    // Resolve the move trigger (discard fodder, draw) with no response.
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else if (d?.kind === "pick" && d.seat === P2 && d.options.some((o) => (o.card ?? o.key) === "fodder")) {
        await game.p2.pick("fodder");
      } else {
        break;
      }
    }
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("merchant")).toMatchObject({ combatRole: "attacker", might: 5 });
    if (game.actingSeat() === P2) {
      await game.p2.passFocus();
    }
    const offered = (game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).not.toContain("merchant");
  });
});

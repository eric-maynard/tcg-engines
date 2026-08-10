/**
 * Ruling 4c3d2baeff97e184 — Anivia, Primal (OGN-148 → ogn-148-298) · 8 Might · "When I attack, deal 3 to all enemy units here."
 *   × Star-Crossed (UNL-128 → unl-128-219) · Reaction · [3][chaos] "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Anivia attacks a battlefield with two enemy units; the defender Star-Crosses one of their units together with Anivia
 *    in response to her attack trigger. Does the remaining unit still take 3?
 * A: No. When the trigger resolves it looks for "here" relative to Anivia; she is in hand, so there is no "here" (no
 *    last-known-information for locations) and no damage is dealt. Chain: [Anivia trigger, Star-Crossed] → Star-Crossed
 *    resolves first (both bounced) → the trigger resolves to nothing.
 * Rules: 359.3.e.12 (a source off the board has null location), 359.3.e.6 (impossible instruction ignored), 336/340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ANIVIA = "ogn-148-298";
const STAR_CROSSED = "unl-128-219";

/** P1's turn. P2 holds bf1 with One (4) and Two (4) and has Star-Crossed + [3][chaos]. Anivia ready in P1's base. */
function board() {
  return scenario()
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", ANIVIA, "anivia")
    .unit(P2, "bf1", { might: 4, name: "One" }, "one")
    .unit(P2, "bf1", { might: 4, name: "Two" }, "two")
    .hand(P2, STAR_CROSSED, "sc");
}

const ids = (game: Game) => game.chain().map((c) => c.cardId);

/** Anivia attacks; P1 passes; P2 Star-Crosses [One, Anivia]. Chain = [anivia*, sc]. */
async function attackAndStarCross(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("anivia", "bf1");
  expect(game.state("anivia").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "anivia", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.p2.can("cast", "sc")).toBe(true);
  const pairs = game.p2.option("cast", "sc")?.fields.find((f) => f.name === "targets")?.options ?? [];
  expect(pairs).toContainEqual(["one", "anivia"]); // [friendly, enemy]
  await game.p2.cast("sc", { targets: ["one", "anivia"] });
  expect(ids(game)).toEqual(["anivia", "sc"]);
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  return game;
}

async function resolveTop(game: Game): Promise<void> {
  const before = game.chain().length;
  for (let i = 0; i < 4 && game.chain().length >= before; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
  expect(game.chain()).toHaveLength(before - 1);
}

describe("Ruling 4c3d2baeff97e184 — Anivia bounced by Star-Crossed before her attack trigger resolves: nobody takes the 3", () => {
  test("Star-Crossed (top) resolves first: Anivia → P1's hand, One → P2's hand; Anivia's trigger is still on the chain and Two is undamaged so far", async () => {
    const game = await attackAndStarCross();
    await resolveTop(game);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("anivia")).toBe("hand");
    expect(game.p1.hand()).toContain("anivia");
    expect(game.zoneOf("one")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "anivia", triggered: true })]);
    expect(game.state("two")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("Anivia's trigger then resolves and finds no 'here' — the remaining Two takes NO damage; the attack is over and P2 keeps bf1", async () => {
    const game = await attackAndStarCross();
    await resolveTop(game); // Star-Crossed
    await resolveTop(game); // Anivia's trigger → nothing
    expect(game.chain()).toEqual([]);
    expect(game.state("two")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    await game.settle();
    expect(game.state("two")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("anivia")).toBe("hand");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: with no response the trigger deals 3 to BOTH enemy units here", async () => {
    const game = await board().build();
    await game.p1.move("anivia", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("one").damage).toBe(3);
    expect(game.state("two").damage).toBe(3);
  });
});

/**
 * Ruling 761d8b840c2e1f74 — Janna, Savior (SFD-053 → sfd-053-221) · [Reaction] Unit · Calm · [3][calm] · 3 Might
 *     "[Reaction] … When you play me, heal your units here, then move up to one enemy unit from here to its base."
 *
 * Q: I moved into a battlefield as the attacker — can I then play Janna?
 * A: Yes, she is a [Reaction] and may be played inside the showdown, but units are only ever played to your base or to
 *    a battlefield YOU control. The battlefield you just attacked is contested and still controlled by the defender,
 *    so Janna cannot be played there — only to your base or to another battlefield you already control.
 * Rules: 355.2.a (play destinations = base + battlefields you control), 190.4.b (the defender keeps control while the
 *        showdown is ongoing there), 355.1.c ([Reaction] timing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const JANNA_SAVIOR = "sfd-053-221";

/** P1's turn: P1 already holds bf2 (Anchor), P2 holds bf1 (Guard 4). P1's Raider (3) attacks bf1. Janna + [3][calm] in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 2, name: "Anchor" }, "anchor")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, JANNA_SAVIOR, "janna");
}

async function attacking(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

const destinations = (game: Game): string[] =>
  ((game.p1.option("play", "janna")?.fields.find((f) => f.arg === "to")?.options ?? []) as string[]).map(String);

describe("Ruling 761d8b840c2e1f74 — the attacker may play Janna in the showdown, but never onto the contested battlefield", () => {
  test("she IS playable while attacking (a [Reaction] unit inside a showdown on your own turn)", async () => {
    const game = await attacking();
    expect(game.p1.can("play", "janna")).toBe(true);
  });

  test("the offered destinations are P1's base and P1's own bf2 — the contested bf1 is not among them, and forcing it fails", async () => {
    const game = await attacking();
    const dests = destinations(game);
    expect(dests).toContain("base");
    expect(dests).toContain("battlefield-bf2");
    expect(dests).not.toContain("battlefield-bf1");
    const r = await game.p1.try((p) => p.play("janna", { to: "bf1" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("janna")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 1 } }); // nothing spent
  });

  test("played to a battlefield P1 already controls (bf2): she arrives there, costs [3][calm], and the showdown at bf1 is untouched", async () => {
    const game = await attacking();
    await game.p1.play("janna", { to: "bf2" });
    expect(game.locationOf("janna")).toBe("bf2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.state("janna").combatRole).toBeNull(); // not in the bf1 combat
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
    await game.settle();
    expect(game.violations()).toEqual([]);
  });

  test("played to P1's base is equally legal — and she still never joins the combat at bf1", async () => {
    const game = await attacking();
    await game.p1.play("janna", { to: "base" });
    expect(game.zoneOf("janna")).toBe("base");
    expect(game.state("janna").combatRole).toBeNull();
    await game.settle();
    expect(game.zoneOf("janna")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});

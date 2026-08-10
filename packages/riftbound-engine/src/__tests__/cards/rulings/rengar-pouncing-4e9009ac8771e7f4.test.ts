/**
 * Ruling 4e9009ac8771e7f4 — Rengar, Pouncing (SFD-025 → sfd-025-221) · Unit · [3][fury] · 3 Might
 *   "[Reaction] (… including to a battlefield you control.) [Assault 2] I can be played to a battlefield you're attacking."
 *   × Pridestalker (Rengar legend → unl-183-219) · "When you play a unit, give a unit +1 [Might] this turn."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · [1] · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: I play Rengar, Pouncing as a Reaction and my Rengar legend makes him +1; the opponent Gusts him to bounce
 *    him. How does it play out?
 * A: Rengar enters the board immediately when played (3 Might) and the legend's +1 makes him 4. Gust may only
 *    affect a unit with 3 or less, so Rengar is not a legal target — a Gust aimed at him does nothing and he stays.
 * Rules: 359.2 (a played permanent enters at once), Gust's "3 [Might] or less" targeting requirement,
 *        359.3.e.5 (requirements re-checked on resolution; an illegal target ⇒ the spell does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RENGAR_POUNCING = "sfd-025-221";
const PRIDESTALKER = "unl-183-219";
const GUST = "ogn-169-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P2's turn. P1 (legend Pridestalker) holds bf1 with a 5-Might Guard; P2's 3-Might Raider attacks it.
 * P1: Rengar, Pouncing + Discipline in hand, [5][fury]. P2: Gust + [1].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 5, power: { fury: 1 } })
    .resources(P2, { energy: 1 })
    .legend(P1, PRIDESTALKER, "pride")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 5, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RENGAR_POUNCING, "rengar")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, GUST, "gust");
}

function gustTargets(game: Game): string[] {
  const field = game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** Raider attacks bf1; P2 passes Focus; P1 plays Rengar as a Reaction to bf1 (a battlefield P1 controls). */
async function rengarPounces(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("play", "rengar")).toBe(true); // Reaction timing inside the showdown
  await game.p1.play("rengar", { to: "bf1" });
  return game;
}

describe("Ruling 4e9009ac8771e7f4 — Rengar, Pouncing at 3+1 = 4 Might is out of Gust's reach", () => {
  test("Rengar enters bf1 IMMEDIATELY on being played (3 Might, defending); the legend's 'when you play a unit' trigger is what sits on the chain, and P1 points its +1 at Rengar", async () => {
    const game = await rengarPounces();
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.state("rengar").might).toBe(3); // defender: Assault 2 does not apply
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pride", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("rengar");
    await game.p1.passPriority();
    await game.p2.passPriority(); // +1 resolves
    expect(game.state("rengar").might).toBe(4);
  });

  test("with Rengar at 4, P2 (holding Focus and [1] for Gust) cannot aim Gust at him: only the 3-Might Raider is a legal Gust target, an attempt on Rengar is rejected, and Rengar stays put", async () => {
    const game = await rengarPounces();
    await game.p1.pick("rengar");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("rengar").might).toBe(4);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true); // Gust itself is playable …
    expect(gustTargets(game)).toEqual(["raider"]); // … but not at Rengar
    const attempt = await game.p2.try((p) => p.cast("gust", { targets: "rengar" }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.zoneOf("gust")).toBe("hand");
    expect(game.p2.resources().energy).toBe(1);
  });

  test("359.3.e.5 in action: if Gust IS locked onto Rengar while he is still 3 and he then rises above 3 before Gust resolves (P1 answers with Discipline), Gust resolves doing nothing — Rengar remains and ends at 3+2+1 = 6", async () => {
    const game = await rengarPounces();
    await game.p1.pick("rengar");
    // P1 passes priority on the pending +1; P2 responds NOW, while Rengar is still 3 — a legal Gust target.
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(gustTargets(game).toSorted()).toEqual(["raider", "rengar"]);
    await game.p2.cast("gust", { targets: "rengar" });
    // P1 answers with Discipline on Rengar (+2), which resolves first (LIFO).
    await game.p2.passPriority();
    await game.p1.cast("disc", { targets: "rengar" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["pride", "gust", "disc"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Discipline: Rengar 3 → 5
    expect(game.state("rengar").might).toBe(5);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves against a 5-Might unit: no effect
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // the legend's +1
    expect(game.chain()).toEqual([]);
    expect(game.state("rengar").might).toBe(6);
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});

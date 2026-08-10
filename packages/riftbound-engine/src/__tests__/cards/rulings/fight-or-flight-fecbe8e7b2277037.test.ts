/**
 * Ruling fecbe8e7b2277037 — Fight or Flight (OGN-168 → ogn-168-298) [Hidden][Action] "Move a unit from a battlefield to its
 *   base."  × Dragon's Rage (OGN-258 → ogn-258-298) [4][rainbow] "Move an enemy unit. Then do this: Choose another enemy unit
 *   at its destination. They deal damage equal to their Mights to each other."  × Ember Monk (OGN-167 → ogn-167-298) 4 Might
 *   "When you play a card from [Hidden], give me +2 [Might] this turn."
 *
 * Q: Dragon's Rage targets Ember Monk (meaning to move it to base); a hidden Fight or Flight is flipped in response and
 *    resolves first, moving the Monk to base. What happens to Dragon's Rage?
 * A: It can no longer move the Monk to base — that is where the Monk already is — and since Dragon's Rage did not
 *    actually move the unit, its reflexive "Then do this" is not put on the chain at all: nobody strikes anybody.
 *    (The ruling additionally says the destination was locked in when Dragon's Rage was played.)
 * Rules: 355.4 / 355.4.a (a move destination must be a location other than the unit's current one), 387/388 (a
 *        reflexive trigger is created only if its main instruction was performed), 340.1 (LIFO), 811 (hidden ⇒ Reaction [0]).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const DRAGONS_RAGE = "ogn-258-298";
const EMBER_MONK = "ogn-167-298";

type PickD = Extract<Decision, { kind: "pick" }>;
const isDestination = (d: Decision | null): d is PickD => d?.kind === "pick" && d.seat === P1 && /destination/i.test(d.prompt);

/** P1's turn. P2 holds bf1 with Ember Monk (4) and a face-down Fight or Flight; P2's Brawler (3) waits in P2's base (the
 * intended strike partner); bf2 is open. P1 holds Dragon's Rage with exactly [4][rainbow]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", EMBER_MONK, "monk")
    .unit(P2, "base", { might: 3, name: "Brawler" }, "brawler")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P1, DRAGONS_RAGE, "rage");
}

/** Dragon's Rage on the Monk; P1 passes; P2 flips Fight or Flight on the Monk; FoF resolves (Monk → base). Rage still waits. */
async function rageThenFof(game: Game): Promise<void> {
  await game.p1.cast("rage", { targets: "monk" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rage", controller: P1, targets: ["monk"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "fof")).toBe(true);
  await game.p2.reveal("fof", { answers: ["monk"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["rage", "fof"]);
  // FoF resolves first (LIFO); the Monk's own "played a card from Hidden" trigger (+2) may follow it — let that resolve too.
  for (let i = 0; i < 8 && (game.chain().length > 1 || game.zoneOf("fof") !== "trash"); i++) {
    const d = game.decision();
    if (d?.kind !== "action") break;
    await game.acting().passPriority();
  }
  expect(game.zoneOf("fof")).toBe("trash");
  expect(game.locationOf("monk")).toBe("base");
  expect(game.chain().map((c) => c.cardId)).toEqual(["rage"]);
}

describe("Ruling fecbe8e7b2277037 — Fight or Flight sends the Monk home first; Dragon's Rage can't move it 'to base' and creates no strike", () => {
  // RULING-CONFLICT: riftjudge fecbe8e7b2277037 (nuance) says Dragon's Rage's destination is chosen as it is PLAYED (352.3);
  // riftjudge 25b00b80ac336276 says for this very card only the target is declared at play and the destination is chosen on
  // RESOLUTION (its reflexive "another enemy unit at its destination" reads the board then). The engine follows 25b00b80
  // (play-time-destinations.ts `dependsOnDestination`, green test flash-25b00b80ac336276) — so no destination prompt here.
  test("playing Dragon's Rage declares only its target (the Monk); Fight or Flight is a legal Reaction from face-down and resolves first, putting the Monk in P2's base (Ember Monk also gets +2 for the hidden play)", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "rage")?.fields.map((f) => f.arg) ?? [];
    expect(fields).toContain("targets");
    await game.p1.cast("rage", { targets: "monk" });
    expect(isDestination(game.decision())).toBe(false); // engine: destination not asked at play for this card
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    await game.p2.reveal("fof", { answers: ["monk"] });
    for (let i = 0; i < 8 && (game.chain().length > 1 || game.zoneOf("fof") !== "trash"); i++) {
      if (game.decision()?.kind !== "action") break;
      await game.acting().passPriority();
    }
    expect(game.locationOf("monk")).toBe("base");
    expect(game.state("monk").might).toBe(6); // 4 + 2 from "When you play a card from [Hidden]"
    expect(game.chain().map((c) => c.cardId)).toEqual(["rage"]);
  });

  test("Dragon's Rage then resolves: 'base' is NOT a legal destination for the Monk any more (it is already there — 355.4.a); with the Monk sent to empty bf2 instead no enemy is at its destination, so the reflexive strike is never put on the chain — Brawler and Monk undamaged", async () => {
    const game = await board().build();
    await rageThenFof(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Rage resolves
    const d = game.decision();
    expect(isDestination(d)).toBe(true);
    const keys = (d as PickD).options.map((o) => o.zone ?? o.key);
    expect(keys).not.toContain("base"); // can't be "moved" to where it is
    expect(keys).toContain("battlefield-bf2");
    await game.p1.pick("battlefield-bf2");
    // No "another enemy unit at its destination" ⇒ no reflexive item, no fight prompt.
    for (let i = 0; i < 4 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "chain"; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.state("brawler")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("monk").damage).toBe(0);
    expect(game.zoneOf("monk")).toBe("battlefield-bf2");
    // The Monk's arrival at open bf2 is a (non-combat) showdown staged by P1's spell; let it play out.
    await game.settle();
    await game.settle();
    expect(game.state("brawler")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("control — no Fight or Flight: Dragon's Rage moves the Monk to base, the reflexive 'Then do this' IS put on the chain, P1 picks the Brawler there and they strike each other (Monk 4 kills Brawler 3; Monk takes 3)", async () => {
    const game = await board().build();
    await game.p1.cast("rage", { targets: "monk" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(isDestination(d)).toBe(true);
    expect((d as PickD).options.map((o) => o.zone ?? o.key)).toContain("base");
    await game.p1.pick("base");
    expect(game.locationOf("monk")).toBe("base");
    // The reflexive trigger is a new chain item; its "another enemy unit at its destination" is chosen as it is finalized.
    for (let i = 0; i < 6; i++) {
      const x = game.decision();
      if (x?.kind === "pick" && x.seat === P1) {
        expect(x.options.map((o) => o.card ?? o.key)).toContain("brawler");
        await game.p1.pick("brawler");
      } else if (x?.kind === "action" && x.context === "chain") {
        expect(game.chain().some((c) => c.cardId === "rage" && c.triggered)).toBe(true);
        await game.seat(x.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("brawler")).toBe("trash"); // took 4 ≥ 3
    expect(game.state("monk")).toMatchObject({ damage: 3, zone: "base" }); // took 3 < 4
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling 7e27bb852f6162c0 — Nocturne, Horrifying (OGN-194 → ogn-194-298) · 4 Might · "[Ganking] As you look at or reveal me from the top of
 *     your deck, you may banish me. If you do, you may play me for [rainbow]."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Action [2] · "Move a unit from a battlefield to its base."
 *   (Stacked Deck ogn-183-298, Action [1] "Look at the top 3 cards of your Main Deck…", is the look effect that finds Nocturne.)
 *
 * Q: Can you play Nocturne to a battlefield you're defending during a showdown?
 * A: Yes — if you CONTROLLED that battlefield when the showdown began (being the defender alone doesn't grant control). You keep
 *    control for the whole showdown, even if it becomes empty of your units (e.g. Fight or Flight), so Nocturne can be played there
 *    at any point during it.
 * Rules: 340.2 / 620 (units are played to base or a battlefield you control), 190.4.c / 323.6 (no control loss mid-showdown),
 *        181.3 (contested ≠ uncontrolled).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";
const STACKED_DECK = "ogn-183-298";
const SKULKER = "ogn-175-298";

/**
 * P2's turn. P1 CONTROLS bf1 with a lone Guard (2); P2's Raider (3) attacks from base. P1: Stacked Deck + Fight or Flight in hand,
 * exactly [3] + [rainbow]; deck top: Nocturne, s1, s2, s3.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .deck(P1, [NOCTURNE, SKULKER, SKULKER, SKULKER], ["noc", "s1", "s2", "s3"])
    .hand(P1, STACKED_DECK, "sd")
    .hand(P1, FIGHT_OR_FLIGHT, "fof");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;
const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Pass around until P1 holds a showdown action window. */
async function toP1Window(game: Game): Promise<void> {
  for (let i = 0; i < 6 && !(game.decision()?.kind === "action" && game.actingSeat() === P1); i++) {
    await game.acting().pass();
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

/** P1 casts Stacked Deck, resolves it, accepts Nocturne's banish + play offers, takes s1 — stops at Nocturne's destination prompt. */
async function stackedDeckIntoNocturne(game: Game): Promise<PickDecision> {
  await game.p1.cast("sd");
  await game.p1.passPriority();
  await game.p2.passPriority();
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "noc") {
      await game.p1.yes();
      continue;
    }
    if (d?.kind === "pick" && d.seat === P1 && d.semantics === "from-revealed") {
      await game.p1.pick("s1");
      continue;
    }
    break;
  }
  const dest = game.decision();
  expect(dest).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "noc" } });
  return dest as PickDecision;
}

const where = (d: PickDecision) => d.options.map((o) => o.zone ?? o.key).sort();

describe("Ruling 7e27bb852f6162c0 — the controlling defender may play Nocturne to the showdown battlefield, even after it empties", () => {
  test("P1 controlled bf1 when the showdown began and still controls it mid-showdown (contested by P2, controller P1)", async () => {
    const game = await board().build();
    expect(bf1(game)?.controller).toBe(P1);
    await game.p2.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, defendingPlayer: P1 });
    expect(bf1(game)).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  });

  test("with the Guard still there: Nocturne found by Stacked Deck during the showdown may be played straight to bf1 (offered alongside base) and defends", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await toP1Window(game);
    const dest = await stackedDeckIntoNocturne(game);
    expect(where(dest)).toContain("battlefield-bf1");
    expect(where(dest)).toContain("base");
    expect(where(dest)).not.toContain("battlefield-bf2");
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("noc")).toBe("battlefield-bf1");
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.state("noc").combatRole).toBe("defender");
  });

  test("the nuance: P1 first Fight-or-Flights its OWN Guard home — bf1 now holds no P1 unit, yet mid-showdown P1 STILL controls it and the showdown continues", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await toP1Window(game);
    await game.p1.cast("fof", { targets: "guard" });
    expect(game.p1.energy()).toBe(1);
    for (let i = 0; i < 4 && game.zoneOf("fof") !== "trash"; i++) {
      await game.acting().pass();
    }
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("guard")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(showdown(game)?.active).toBe(true);
    expect(bf1(game)?.controller).toBe(P1);
  });

  test("… and into that EMPTY-but-controlled bf1 P1 can still play Nocturne: bf1 is offered as a destination, Nocturne lands there as the (only) defender, and holds off the 3-Might Raider", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await toP1Window(game);
    await game.p1.cast("fof", { targets: "guard" });
    for (let i = 0; i < 4 && game.zoneOf("fof") !== "trash"; i++) {
      await game.acting().pass();
    }
    expect(game.p1.units("bf1")).toEqual([]);
    await toP1Window(game);
    const dest = await stackedDeckIntoNocturne(game);
    expect(where(dest)).toContain("battlefield-bf1");
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("noc")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("noc").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 4 into 3
    expect(game.zoneOf("noc")).toBe("battlefield-bf1"); // 3 < 4
    expect(bf1(game)?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

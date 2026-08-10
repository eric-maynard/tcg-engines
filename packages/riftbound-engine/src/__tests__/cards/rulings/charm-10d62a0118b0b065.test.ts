/**
 * Ruling 10d62a0118b0b065 — Charm (OGN-043 → ogn-043-298) · Spell · Calm · 1 + [calm] · [Action] "Move an enemy unit."
 *   × Kai'Sa, Evolutionary (ogn-112-298) · 6 Might "[Ganking] When I conquer, you may play a spell from your trash with
 *     Energy cost less than your points without paying its Energy cost. Then recycle it."
 *
 * Q: Kai'Sa wins a showdown (taking damage), conquers, and her trigger plays Charm from the trash to drag another enemy
 *    unit into her battlefield — starting a new showdown. Does she heal from the first combat before the second begins?
 * A: Yes. The current combat finishes processing — including healing combat damage — and Cleanup runs before any new
 *    showdown can start (a showdown only begins from a neutral Open state). The Charm-moved unit's arrival is a pending
 *    combat that waits; it then begins with Kai'Sa at full health.
 * Rules: 627.3–627.5 / 465–466 (combat resolution: control, then heal), 628 (cleanup), 345 / 461 (a staged showdown
 *        begins only from a neutral open state with an empty chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const KAISA_EVOLUTIONARY = "ogn-112-298";

/**
 * P1's turn at 2 points with [calm] floating (Charm's Power must still be paid). P2 holds bf1 with Blocker (4) and has a
 * Bystander (2) in base. Kai'Sa (6) in P1's base; Charm (1 energy) in P1's trash. One battlefield → Charm's only
 * destination for the Bystander is bf1.
 */
function board() {
  return scenario()
    .points(P1, 2)
    .resources(P1, { power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", KAISA_EVOLUTIONARY, "kaisa")
    .unit(P2, "bf1", { might: 4, name: "Blocker" }, "blocker")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .trash(P1, CHARM, "charm");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;

/** Kai'Sa attacks bf1; both pass; combat: Blocker dies, Kai'Sa (took 4) conquers → her opt-in is asked. */
async function kaisaConquers(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("kaisa", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.zoneOf("blocker")).toBe("trash");
  expect(bf1(game)?.controller).toBe(P1);
  expect(game.p1.points()).toBe(3);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "kaisa" } });
  return game;
}

/** …P1 accepts, everyone passes, P1 picks Charm from the trash; it goes on the chain aimed at the Bystander (→ bf1). */
async function charmTheBystander(game: Game): Promise<void> {
  await game.p1.yes();
  await game.p1.passPriority();
  await game.p2.passPriority(); // Kai'Sa's ability resolves → reveal-and-pick from trash
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
  await game.p1.pick("charm");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P1, targets: ["bystander"] })]);
  expect(game.p1.power("calm")).toBe(0); // Power cost still paid; Energy ignored
}

describe("Ruling 10d62a0118b0b065 — Kai'Sa heals from the first combat before the Charm-provoked second showdown begins", () => {
  test("the first combat FINISHES (Blocker dead, Kai'Sa's 4 combat damage already healed, bf1 conquered, point scored) by the time her conquer trigger is even asked", async () => {
    const game = await kaisaConquers();
    expect(game.state("kaisa").damage).toBe(0);
    expect((game.state("kaisa").meta.lastDamage as { amount?: number } | undefined)?.amount).toBe(4); // she DID take 4
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1, showdownComplete: true });
  });

  test("Charm (1 < 3 points) is played from the trash for its [calm] only and moves the Bystander to bf1 — the new combat is merely PENDING while Charm's chain is open, then begins once it empties: Bystander attacks, Kai'Sa defends at FULL health", async () => {
    const game = await kaisaConquers();
    await charmTheBystander(game);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Charm resolves: Bystander arrives; chain empties → the staged showdown begins
    expect(game.zoneOf("charm")).toBe("mainDeck"); // "Then recycle it."
    expect(game.locationOf("bystander")).toBe("bf1");
    expect(bf1(game)).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // attacker (P2) has Focus
    expect(game.state("bystander").combatRole).toBe("attacker");
    expect(game.state("kaisa").combatRole).toBe("defender");
    expect(game.state("kaisa").damage).toBe(0); // healed BEFORE this showdown began
  });

  test("proof it matters: had she kept the 4, the Bystander's 2 would be lethal (6); instead the second combat is 2 into a healthy 6 — Bystander dies, Kai'Sa holds bf1", async () => {
    const game = await kaisaConquers();
    await charmTheBystander(game);
    await game.settle();
    expect(game.zoneOf("bystander")).toBe("trash");
    expect(game.zoneOf("kaisa")).toBe("battlefield-bf1");
    expect(game.state("kaisa").damage).toBe(0);
    expect(bf1(game)?.controller).toBe(P1);
    expect(game.p1.points()).toBe(3); // defending is not a conquer
    expect(game.violations()).toEqual([]);
  });
});

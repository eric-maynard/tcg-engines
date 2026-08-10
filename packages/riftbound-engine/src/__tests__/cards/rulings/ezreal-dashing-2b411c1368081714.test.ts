/**
 * Ruling 2b411c1368081714 — Ezreal, Dashing (SFD-082 → sfd-082-221) · 3 Might · "When I attack or defend, deal damage equal
 *     to my Might to an enemy unit here. I don't deal combat damage. …"
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction [2] "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: Ezreal attacks; the opponent Disciplines their unit (3 → 5) in response; can I then Discipline Ezreal (3 → 5) so
 *    his ability deals 5?
 * A: Yes. The trigger reads Ezreal's Might when it RESOLVES, nothing is locked in. Chain: Ezreal trigger < opp's
 *    Discipline < my Discipline. LIFO: mine (Ezreal 5) → theirs (their unit 5) → trigger deals 5.
 * Rules: 383 (triggered ability on the chain), 340 (LIFO), FAQ #259 (Might read on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EZREAL = "sfd-082-221";
const DISCIPLINE = "ogn-058-298";

/** P1's turn. Ezreal (3) in base; P2's Guard (3) holds bf1. Each player holds a Discipline with exactly [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", EZREAL, "ez")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, DISCIPLINE, "discMine")
    .hand(P2, DISCIPLINE, "discTheirs");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** Both players pass (whoever holds priority first) until exactly the top chain item has resolved. */
async function resolveTop(game: Game): Promise<void> {
  const before = game.chain().length;
  for (let i = 0; i < 4 && game.chain().length >= before; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toHaveLength(before - 1);
}

/** Steps 1–4 of the ruling: attack → trigger; P2 Disciplines the Guard; P1 Disciplines Ezreal. */
async function buildTheChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ez", "bf1");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("guard");
  }
  expect(game.state("ez").combatRole).toBe("attacker");
  expect(chainIds(game)).toEqual(["ez"]);
  expect(game.chain()[0]).toMatchObject({ controller: P1, targets: ["guard"], triggered: true });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.cast("discTheirs", { targets: "guard" });
  expect(chainIds(game)).toEqual(["ez", "discTheirs"]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.cast("discMine", { targets: "ez" });
  expect(chainIds(game)).toEqual(["ez", "discTheirs", "discMine"]);
  return game;
}

describe("Ruling 2b411c1368081714 — Ezreal's attack trigger uses his Might at resolution, so a Discipline in response makes it deal 5", () => {
  test("the chain builds exactly as described: Ezreal's trigger (bottom) < P2's Discipline on the Guard < P1's Discipline on Ezreal (top); no Might has changed yet", async () => {
    const game = await buildTheChain();
    expect(game.state("ez").might).toBe(3);
    expect(game.state("guard").might).toBe(3);
    expect(game.state("guard").damage).toBe(0);
  });

  test("LIFO step by step: P1's Discipline → Ezreal 5; P2's Discipline → Guard 5; then the trigger deals Ezreal's CURRENT 5 to the Guard — lethal on a 5", async () => {
    const game = await buildTheChain();
    await resolveTop(game); // discMine resolves
    expect(game.state("ez").might).toBe(5);
    expect(chainIds(game)).toEqual(["ez", "discTheirs"]);
    await resolveTop(game); // discTheirs resolves
    expect(game.state("guard").might).toBe(5);
    expect(chainIds(game)).toEqual(["ez"]);
    expect(game.state("guard").damage).toBe(0);
    await resolveTop(game); // Ezreal's trigger resolves: 5 damage
    expect(game.zoneOf("guard")).toBe("trash");
    await game.settle(); // rest of the combat: no defender left → Ezreal conquers
    expect(game.locationOf("ez")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control: if P1 does NOT pump Ezreal, the trigger deals only 3 to the Disciplined 5-Might Guard — it survives and keeps bf1 (Ezreal deals no combat damage)", async () => {
    const game = await board().build();
    await game.p1.move("ez", "bf1");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("guard");
    }
    await game.p1.passPriority();
    await game.p2.cast("discTheirs", { targets: "guard" });
    await resolveTop(game); // P2's Discipline resolves: Guard 5
    expect(game.state("guard").might).toBe(5);
    await resolveTop(game); // trigger: 3 damage
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(3);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});

/**
 * Ruling a2162970baca4c08 — Dragon's Rage (OGN-258 → ogn-258-298) · Spell · Calm/Body · [4]+[rainbow] · Action
 *     "Move an enemy unit. Then do this: Choose another enemy unit at its destination. They deal damage equal to their
 *      Mights to each other."
 *
 * Q: Can Dragon's Rage move an enemy unit back to base (or anywhere) if there is no other enemy unit at the new location?
 * A: Yes. The only target needed to play it is the enemy unit to move. If the reflexive "then do this" finds no other
 *    enemy unit at the destination, that part simply doesn't happen.
 * Rules: 355.6–355.8 (targeting requirements to play), 359.3.e (reflexive "then do this" chooses on resolution),
 *        359.3.e.7 (no legal choice ⇒ instruction does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAGONS_RAGE = "ogn-258-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P1's turn with [4]+1 any-power. P2: Victim (3) alone at its bf1, NOTHING in base; bf2 open. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "mine")
    .hand(P1, DRAGONS_RAGE, "rage");
}

/** Cast Rage at Victim, send it to `dest`, pass everything; records every pick prompt P1 saw after the destination. */
async function rageVictimTo(dest: string): Promise<{ game: Game; destinations: string[]; laterPicks: PickD[] }> {
  const game = await board().build();
  expect(game.p1.can("cast", "rage")).toBe(true);
  await game.p1.cast("rage", { targets: "victim" });
  let destinations: string[] = [];
  const laterPicks: PickD[] = [];
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.zone ?? o.key) === dest) && destinations.length === 0) {
      destinations = d.options.map((o) => o.zone ?? o.key);
      await game.p1.pick(dest);
      continue;
    }
    if (d.kind === "pick") {
      laterPicks.push(d);
      break;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  return { destinations, game, laterPicks };
}

describe("Ruling a2162970baca4c08 — Dragon's Rage may move an enemy unit to a place with no other enemy unit; the fight just doesn't happen", () => {
  test("to P2's EMPTY base: the spell is playable with only Victim as its target, Victim is moved home, no second choice is ever asked, nobody takes damage", async () => {
    const { game, destinations, laterPicks } = await rageVictimTo("base");
    expect(destinations).toContain("base");
    expect(laterPicks).toEqual([]); // "choose another enemy unit at its destination" found nothing → skipped
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("mine").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("'or anywhere': to the open, empty bf2 — same result: moved, no damage dealt", async () => {
    const { game, destinations, laterPicks } = await rageVictimTo("battlefield-bf2");
    expect(destinations).toEqual(expect.arrayContaining(["base", "battlefield-bf2"]));
    expect(laterPicks).toEqual([]);
    await game.settle();
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.violations()).toEqual([]);
  });
});

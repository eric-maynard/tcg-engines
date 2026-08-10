/**
 * Ruling ccad9282827924e7 — Dragon's Rage (OGN-258 → ogn-258-298) · Spell · Calm/Body · [4]+[rainbow] · Action
 *     "Move an enemy unit. Then do this: Choose another enemy unit at its destination. They deal damage equal to their
 *      Mights to each other."
 *
 * Q: Does Dragon's Rage require you to move an enemy unit in order to deal damage?
 * A: Yes. The move happens first; then, IF another enemy unit is at the destination, they damage each other; if none is,
 *    no damage. Nuances: if the chosen unit is killed by a Reaction before Rage resolves, the spell can't take effect at
 *    all; the second unit is a reflexive choice made only if the move actually executed.
 * Rules: 359.3.e (reflexive "then do this"), 355.15 / 359.3.e.5 (illegal target on resolution ⇒ nothing), 412.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAGONS_RAGE = "ogn-258-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P1's own Reaction removal (inline): deal 3 to a unit. */
const REACTION_BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Reaction Bolt",
  timing: "reaction",
} as const;

/** P1's turn: [5]+1 any-power, Rage + a Reaction bolt. P2: Victim (3) alone at bf1, Brute (5) in base; bf2 open & empty. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "base", { might: 5, name: "Brute" }, "brute")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "mine")
    .hand(P1, DRAGONS_RAGE, "rage")
    .hand(P1, REACTION_BOLT, "bolt");
}

/**
 * Drive P1's prompts: the destination pick is answered with `dest`; a later "another enemy unit" pick with `second`.
 * Chain priority is passed. Returns what was asked.
 */
async function drive(game: Game, dest: string, second?: string): Promise<{ destAsked: boolean; secondAsked: string[] | null }> {
  let destAsked = false;
  let secondAsked: string[] | null = null;
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1 && !destAsked && d.options.some((o) => (o.zone ?? o.key) === dest)) {
      destAsked = true;
      await game.p1.pick(dest);
      continue;
    }
    if (d.kind === "pick" && d.seat === P1) {
      secondAsked = (d as PickD).options.map((o) => o.card ?? o.key);
      expect(second).toBeDefined();
      await game.p1.pick(second as string);
      continue;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    break;
  }
  return { destAsked, secondAsked };
}

describe("Ruling ccad9282827924e7 — Dragon's Rage: move first, then fight only if another enemy unit is at the destination", () => {
  test("moved to P2's base where Brute (5) stands: Victim (3) and Brute deal their Mights to each other — Victim dies, Brute takes 3", async () => {
    const game = await board().build();
    await game.p1.cast("rage", { targets: "victim" });
    await drive(game, "base", "brute");
    await game.settle();
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("brute")).toMatchObject({ damage: 3, zone: "base" });
    expect(game.state("mine").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("moved to the EMPTY bf2 instead: the move happens, no other enemy unit is there → no second choice, no damage to anyone", async () => {
    const game = await board().build();
    await game.p1.cast("rage", { targets: "victim" });
    const asked = await drive(game, "battlefield-bf2");
    await game.settle();
    expect(asked.destAsked).toBe(true);
    expect(asked.secondAsked).toBeNull();
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.state("brute").damage).toBe(0);
    expect(game.zoneOf("rage")).toBe("trash");
  });

  test("nuance: P1's own Reaction bolt kills Victim in response — when Rage resolves its target is gone: no move, no second choice, Brute untouched; Rage still goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("rage", { targets: "victim" });
    // answer the destination (chosen with the spell), then react before anything resolves
    const d0 = game.decision();
    if (d0?.kind === "pick" && d0.seat === P1) {
      await game.p1.pick("base");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["rage"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.cast("bolt", { targets: "victim" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rage", "bolt"]);
    const asked = await drive(game, "base");
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash"); // killed by the bolt (3 ≥ 3)
    expect(asked.secondAsked).toBeNull(); // the reflexive choice never happened
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

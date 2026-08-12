/**
 * Ruling 25cf2e5e699732e9 — The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield
 *   (errata'd text) "When A PLAYER chooses a friendly unit here with a spell for the first time each
 *    turn, THEY draw 1."
 *
 * Q: Does the errata restrict the draw to the battlefield's controller — i.e. only the first player
 *    to choose a unit there each turn?
 * A: No. The old "you" meant the Tree's controller; the errata makes it symmetric, so EVERY player
 *    draws the first time that turn they choose a unit THEY control at the Tree with a spell — which
 *    is what makes "attack, cleave, draw" work for the player who does not hold the Tree.
 * Rules: 190.6.c / 740.1.a ("a player … they" is symmetric), 383.3.e ("for the first time each turn"
 *        is tallied per player), 359.2.c ("here" = this battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";

/** [Reaction] "Give a unit +1 [Might] this turn." — a cheap spell that CHOOSES a unit. */
const NUDGE = {
  abilities: [
    { effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Nudge",
  rulesText: "[Reaction] Give a unit +1 [Might] this turn.",
  timing: "reaction",
} as const;

/**
 * P1's turn. P2 holds The Dreaming Tree (live text) with a 2-Might Warden; P1's 4-Might Raider walks
 * in from base, so during the showdown BOTH players have a unit of their own at the Tree.
 * Each side carries Nudges.
 */
function board() {
  return scenario()
    .battlefield("tree", { controller: P2, def: DREAMING_TREE, inert: false })
    .unit(P2, "tree", { might: 2, name: "Warden" }, "warden")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, NUDGE, "p1a")
    .hand(P1, NUDGE, "p1b")
    .hand(P2, NUDGE, "p2a")
    .hand(P2, NUDGE, "p2b");
}

/** Resolve the chain WITHOUT passing Focus, so the showdown stays open and combat does not run. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
      continue;
    }
    if (d?.kind === "yes-no") {
      await game.seat(d.seat).yes();
      continue;
    }
    break;
  }
}

/** P1's Raider attacks the Tree; both units are now "here". */
async function attacking(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "tree");
  expect(game.p1.units("tree")).toEqual(["raider"]);
  expect(game.p2.units("tree")).toEqual(["warden"]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 25cf2e5e699732e9 — The Dreaming Tree draws for EVERY player, not just its controller", () => {
  test("ruling: the ATTACKER — who does not hold the Tree — draws the first time they choose their own unit there with a spell", async () => {
    const game = await attacking();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("p1a", { targets: "raider" });
    await resolveChain(game);
    expect(game.state("raider").might).toBe(5);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 1); // spent the Nudge, drew 1
    expect(game.p2.hand()).toHaveLength(p2Hand); // the Tree's controller drew nothing
  });

  test("…and it is once per player per turn: P1's second spell on the same unit draws nothing more", async () => {
    const game = await attacking();
    await game.p1.cast("p1a", { targets: "raider" });
    await resolveChain(game);
    const p1Hand = game.p1.hand().length;
    // Casting inside a showdown hands Focus to the opponent; P2 passes it straight back.
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passFocus();
    await game.p1.cast("p1b", { targets: "raider" });
    await resolveChain(game);
    expect(game.state("raider").might).toBe(6);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // no second draw
  });

  test("the Tree's controller has their OWN once-per-turn draw in the same turn — both players can draw off it", async () => {
    const game = await attacking();
    await game.p1.cast("p1a", { targets: "raider" });
    await resolveChain(game);
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    // Casting handed Focus to P2, who answers with a Nudge on their own Warden at the Tree.
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("p2a", { targets: "warden" });
    await resolveChain(game);
    expect(game.state("warden").might).toBe(3);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1); // P2 drew too
    expect(game.p1.hand()).toHaveLength(p1Hand); // P1 already used theirs this turn
  });

  test("negative space: choosing the ENEMY's unit at the Tree is not 'a friendly unit here' for the chooser — no draw", async () => {
    const game = await attacking();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("p1a", { targets: "warden" }); // P1 buffs the enemy Warden
    await resolveChain(game);
    expect(game.state("warden").might).toBe(3);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // no draw for P1 …
    expect(game.p2.hand()).toHaveLength(p2Hand); // … and none for P2 either
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling d3510b0e5a335d0e — Unyielding Spirit (OGN-145 → ogn-145-298) · Reaction [1][body] "Prevent all spell and ability damage
 *   this turn."
 *   × Carnivorous Snapvine (ogn-149-298, 6) "When you play me, choose an enemy unit at a battlefield. WE deal damage equal to our
 *     Mights to each other."   × Challenge (OGN-128 → ogn-128-298) "…THEY deal damage equal to their Mights to each other."
 *   × Last Breath (OGN-260 → ogn-260-298) "Ready a friendly unit. IT deals damage equal to its Might to an enemy unit at a battlefield."
 *   × Caitlyn, Patrolling (OGN-068 → ogn-068-298, 3) "[Exhaust]: Deal damage equal to my Might to a unit at a battlefield."
 *
 * Q: Does Unyielding Spirit prevent Snapvine's mutual damage?
 * A: No — the UNITS are the source ("we/they/it deal(s) damage"), not the ability, so it is not spell/ability damage. Same for
 *    Challenge and Last Breath. Abilities phrased "deal damage" with no unit as dealer (Caitlyn, Yasuo) ARE prevented.
 * Rules: 417.6.b.1–3 (source of damage), 437 (prevention keyed on source).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const SNAPVINE = "ogn-149-298";
const CHALLENGE = "ogn-128-298";
const LAST_BREATH = "ogn-260-298";
const CAITLYN = "ogn-068-298";

/**
 * P1's turn. P2 holds bf1 with a 9-Might Wall (survives everything, so damage stays readable) and has Unyielding Spirit with
 * exactly [1][body]. P1: Bruiser (4, exhausted) in base, Caitlyn (3) at P1's bf2; Snapvine / Challenge / Last Breath in hand.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { body: 2, calm: 1, chaos: 1 } })
    .resources(P2, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 4, name: "Bruiser" }, "bruiser", { exhausted: true })
    .unit(P1, "bf2", CAITLYN, "cait")
    .hand(P1, SNAPVINE, "snapvine")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P1, LAST_BREATH, "lastbreath")
    .hand(P2, UNYIELDING_SPIRIT, "us");
}

async function answerWallIfAsked(game: Game): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const d: Decision | null = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "wall")) {
      await game.p1.pick("wall");
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      return;
    }
  }
}

async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    await answerWallIfAsked(game);
    if (game.chain().length === 0) {
      break;
    }
    await game.acting().passPriority();
  }
  await answerWallIfAsked(game);
  expect(game.chain()).toEqual([]);
}

/** With P1's item on the chain: P1 passes, P2 answers with Unyielding Spirit (resolves first — shield up), then the chain drains. */
async function spiritInResponseThenResolve(game: Game): Promise<void> {
  await answerWallIfAsked(game);
  expect(game.chain().length).toBeGreaterThanOrEqual(1);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "us")).toBe(true);
  await game.p2.cast("us");
  expect(game.chain().at(-1)).toMatchObject({ cardId: "us", controller: P2 });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
  await drainChain(game);
  expect(game.zoneOf("us")).toBe("trash");
}

describe("Ruling d3510b0e5a335d0e — Unyielding Spirit does not stop unit-sourced damage (Snapvine, Challenge, Last Breath) but stops ability damage (Caitlyn)", () => {
  test("Carnivorous Snapvine — NOT prevented: under the shield Snapvine (6) and the Wall (9) still deal their Mights to each other → Wall on 6, Snapvine dies", async () => {
    const game = await board().build();
    await game.p1.play("snapvine", { to: "base" });
    await spiritInResponseThenResolve(game);
    expect(game.state("wall")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
    expect(game.zoneOf("snapvine")).toBe("trash"); // took 9 from the Wall
    expect(game.violations()).toEqual([]);
  });

  test("Challenge — NOT prevented: Bruiser (4) and Wall trade → Wall on 4, Bruiser dies", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["bruiser", "wall"] });
    await spiritInResponseThenResolve(game);
    expect(game.state("wall").damage).toBe(4);
    expect(game.zoneOf("bruiser")).toBe("trash");
  });

  test("Last Breath — NOT prevented: Bruiser is readied and IT deals its 4 to the Wall", async () => {
    const game = await board().build();
    expect(game.state("bruiser").isExhausted).toBe(true);
    await game.p1.cast("lastbreath", { targets: ["bruiser", "wall"] });
    await spiritInResponseThenResolve(game);
    expect(game.state("bruiser").isReady).toBe(true);
    expect(game.state("wall").damage).toBe(4);
  });

  test("Caitlyn, Patrolling's '[Exhaust]: Deal damage equal to my Might' — PREVENTED: the ability is the source, so the Wall takes 0 (Caitlyn still exhausted as the cost)", async () => {
    const game = await board().build();
    await game.p1.activate("cait", undefined, { answers: ["wall"] });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("wall");
    }
    expect(game.state("cait").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cait", controller: P1 })]);
    await spiritInResponseThenResolve(game);
    expect(game.state("wall").damage).toBe(0);
  });

  test("controls without the shield: Snapvine puts 6 on the Wall; Caitlyn's ability puts 3 on it", async () => {
    const a = await board().build();
    await a.p1.play("snapvine", { to: "base" });
    await drainChain(a);
    expect(a.state("wall").damage).toBe(6);

    const b = await board().build();
    await b.p1.activate("cait", undefined, { answers: ["wall"] });
    if (b.decision()?.kind === "pick" && b.decision()?.seat === P1) {
      await b.p1.pick("wall");
    }
    await drainChain(b);
    expect(b.state("wall").damage).toBe(3);
  });
});

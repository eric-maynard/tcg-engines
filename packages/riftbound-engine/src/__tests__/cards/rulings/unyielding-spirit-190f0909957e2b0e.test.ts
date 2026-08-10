/**
 * Ruling 190f0909957e2b0e — Unyielding Spirit (OGN-145 → ogn-145-298, Reaction, 1 + [body])
 *   "Prevent all spell and ability damage this turn."
 *   × Caitlyn, Patrolling (ogn-068-298, 3) "[Exhaust]: Deal damage equal to my Might to a unit at a battlefield."
 *   × Yasuo, Remorseful (ogn-076-298, 6) "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Challenge (ogn-128-298) "Choose a friendly unit and an enemy unit. THEY deal damage equal to their Mights to each other."
 *   × Carnivorous Snapvine (ogn-149-298, 6) "When you play me, choose an enemy unit at a battlefield. WE deal damage … to each other."
 *   × Last Breath (ogn-260-298) "Ready a friendly unit. IT deals damage equal to its Might to an enemy unit at a battlefield."
 *
 * Q: Does Unyielding Spirit prevent the damage from Caitlyn, Patrolling and Yasuo, Remorseful?
 * A: Yes — both say "Deal damage" with no subject, so the ABILITY deals the damage → prevented. Text with a unit as
 *    subject ("They deal" Challenge, "We deal" Snapvine, "It deals" Last Breath) is damage dealt BY UNITS → not
 *    prevented.
 * Rules: 417.6.a / 417.6.b.2 (no named source → the spell/ability is the source), 417.6.b.3 (units named as the
 *        source deal the damage), 437.1.b (source-filtered prevention), 437.4.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const CAITLYN = "ogn-068-298";
const YASUO = "ogn-076-298";
const CHALLENGE = "ogn-128-298";
const SNAPVINE = "ogn-149-298";
const LAST_BREATH = "ogn-260-298";

/**
 * P1's turn. bf1: P2's, held by a 9-Might Wall (big enough to survive every hit here so damage stays readable).
 * bf2: P1's, with Caitlyn (3). P1's base: Yasuo (6), Bruiser (4). P1 holds Challenge, Snapvine, Last Breath with
 * ample resources; P2 holds Unyielding Spirit with exactly 1 + [body].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { body: 2, calm: 1, chaos: 1 } })
    .resources(P2, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "bf2", CAITLYN, "cait")
    .unit(P1, "base", YASUO, "yasuo")
    .unit(P1, "base", { might: 4, name: "Bruiser" }, "bruiser", { exhausted: true })
    .hand(P1, CHALLENGE, "challenge")
    .hand(P1, SNAPVINE, "snapvine")
    .hand(P1, LAST_BREATH, "lastbreath")
    .hand(P2, UNYIELDING_SPIRIT, "us");
}

/** If P1 is being asked for the Wall as a target (trigger target on finalization/resolution), answer it. */
async function answerWallIfAsked(game: Game): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const d: Decision | null = game.decision();
    if (
      d?.kind === "pick" &&
      d.seat === P1 &&
      d.options.some((o) => (o.card ?? o.key) === "wall")
    ) {
      await game.p1.pick("wall");
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      return;
    }
  }
}

/**
 * With P1's item on the chain: P1 passes, P2 answers with Unyielding Spirit (LIFO → resolves first), then pass
 * priority around until the chain is empty (stopping short of any showdown/combat step).
 */
async function shieldThenResolveChain(game: Game): Promise<void> {
  await answerWallIfAsked(game);
  expect(game.chain().length).toBeGreaterThanOrEqual(1);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "us")).toBe(true);
  await game.p2.cast("us");
  expect(game.chain().at(-1)).toMatchObject({ cardId: "us", controller: P2 });
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    await answerWallIfAsked(game);
    if (game.chain().length === 0) {
      break;
    }
    await game.acting().passPriority();
  }
  await answerWallIfAsked(game);
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("us")).toBe("trash");
}

describe("Ruling 190f0909957e2b0e — Unyielding Spirit stops subject-less 'Deal damage' (Caitlyn, Yasuo) but not 'They/We/It deal' (units)", () => {
  test("Caitlyn's '[Exhaust]: Deal damage equal to my Might' is ABILITY damage → prevented: the Wall takes 0 (Caitlyn stays exhausted — cost paid)", async () => {
    const game = await board().build();
    await game.p1.activate("cait", undefined, { targets: "wall" });
    expect(game.state("cait").isExhausted).toBe(true);
    await shieldThenResolveChain(game);
    expect(game.state("wall").damage).toBe(0);
    expect(game.state("cait").isExhausted).toBe(true);
  });

  test("control: without the shield Caitlyn's ability puts 3 damage on the Wall", async () => {
    const game = await board().build();
    await game.p1.activate("cait", undefined, { targets: "wall" });
    await game.settle();
    expect(game.state("wall").damage).toBe(3);
  });

  test("Yasuo's 'When I attack, deal damage equal to my Might' is ABILITY damage → prevented: after the trigger resolves the Wall has 0 damage", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    expect(game.state("yasuo").combatRole).toBe("attacker");
    await answerWallIfAsked(game);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true }),
    ]);
    await shieldThenResolveChain(game);
    // The showdown is still open (combat damage not dealt yet) — only the trigger has resolved.
    expect(game.state("wall").damage).toBe(0);
    expect(game.locationOf("yasuo")).toBe("bf1");
  });

  test("control: without the shield Yasuo's attack trigger puts 6 damage on the Wall before combat damage", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    await answerWallIfAsked(game);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await answerWallIfAsked(game);
      await game.acting().passPriority();
    }
    await answerWallIfAsked(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(6);
  });

  test("Challenge — 'THEY deal damage': the units are the source → NOT prevented: Wall takes 4, Bruiser takes 9 and dies", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["bruiser", "wall"] });
    await shieldThenResolveChain(game);
    expect(game.state("wall").damage).toBe(4);
    expect(game.zoneOf("bruiser")).toBe("trash");
  });

  test("Carnivorous Snapvine — 'WE deal damage': unit-sourced → NOT prevented: Wall takes 6, Snapvine takes 9 and dies", async () => {
    const game = await board().build();
    await game.p1.play("snapvine", { to: "base" });
    await shieldThenResolveChain(game);
    expect(game.state("wall").damage).toBe(6);
    expect(game.zoneOf("snapvine")).toBe("trash");
  });

  test("Last Breath — 'IT deals damage': the readied unit is the source → NOT prevented: Bruiser readies and the Wall takes 4", async () => {
    const game = await board().build();
    expect(game.state("bruiser").isExhausted).toBe(true);
    await game.p1.cast("lastbreath", { targets: ["bruiser", "wall"] });
    await shieldThenResolveChain(game);
    expect(game.state("bruiser").isReady).toBe(true);
    expect(game.state("wall").damage).toBe(4);
    expect(game.state("bruiser").damage).toBe(0); // one-way: only "it" deals
    expect(game.violations()).toEqual([]);
  });
});

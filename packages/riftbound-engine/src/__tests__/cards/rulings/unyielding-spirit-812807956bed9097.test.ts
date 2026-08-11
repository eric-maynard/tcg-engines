/**
 * Ruling 812807956bed9097 — Unyielding Spirit (OGN-145 → ogn-145-298) · Reaction · 1 + [body]
 *     "Prevent all spell and ability damage this turn."
 *   × Challenge (OGN-128) "Choose a friendly unit and an enemy unit. THEY deal damage equal to their Mights to each other."
 *   × Carnivorous Snapvine (OGN-149, 6) "When you play me, choose an enemy unit at a battlefield. WE deal damage … to each other."
 *   × Void Seeker (OGN-024) "Deal 4 to a unit at a battlefield. Draw 1." · Stormbringer (OGN-250) "Choose a friendly unit
 *     in your base. Deal damage equal to its Might to all enemy units at a battlefield, then move your unit there."
 *   × Yasuo, Remorseless/Remorseful (OGN-076-298 in our data, 6) "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: Does Unyielding Spirit stop damage from fight spells like Challenge and Carnivorous Snapvine's ability?
 * A: No — those are dealt by the UNITS. It does stop Void Seeker, Stormbringer and Yasuo (damage dealt by the
 *    spell/ability itself). (Last Breath is likewise unit damage.)
 * Rules: 417.6.b.1–3 (who is the source of damage), 437 (prevention by source type).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const CHALLENGE = "ogn-128-298";
const SNAPVINE = "ogn-149-298";
const VOID_SEEKER = "ogn-024-298";
const STORMBRINGER = "ogn-250-298";
const YASUO = "ogn-076-298";

/**
 * P1's turn. P2 holds bf1 with a 9-Might Wall (survives everything so damage stays readable) and has Unyielding
 * Spirit with exactly 1 + [body]. P1: Bruiser (4) and Yasuo (6) in base; Challenge, Snapvine, Void Seeker,
 * Stormbringer in hand with resources for any one of them.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { body: 2, fury: 1, rainbow: 2 } })
    .resources(P2, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 4, name: "Bruiser" }, "bruiser")
    .unit(P1, "base", YASUO, "yasuo")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P1, SNAPVINE, "snapvine")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P1, STORMBRINGER, "storm")
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

/** Pass priority around (answering the Wall pick if asked) until the chain is empty — stops short of any combat. */
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

/** With P1's item on the chain: P1 passes, P2 answers with Unyielding Spirit (resolves first), then the chain drains. */
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

describe("Ruling 812807956bed9097 — Unyielding Spirit: fights (Challenge, Snapvine) get through; spell/ability damage (Void Seeker, Stormbringer, Yasuo) doesn't", () => {
  test("Challenge — NOT prevented: Bruiser (4) and Wall (9) deal their Mights to each other → Wall on 4 damage, Bruiser dies", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["bruiser", "wall"] });
    await spiritInResponseThenResolve(game);
    expect(game.state("wall")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.zoneOf("bruiser")).toBe("trash");
  });

  test("Carnivorous Snapvine — NOT prevented: its play trigger has Snapvine (6) and the Wall (9) trade → Wall on 6, Snapvine dies", async () => {
    const game = await board().build();
    await game.p1.play("snapvine", { to: "base" });
    await spiritInResponseThenResolve(game);
    expect(game.state("wall").damage).toBe(6);
    expect(game.zoneOf("snapvine")).toBe("trash");
  });

  test("Void Seeker — PREVENTED: the spell's 4 never lands (Wall 0 damage) though the rest of the spell (Draw 1) still happens", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("seeker", { targets: "wall" });
    await spiritInResponseThenResolve(game);
    expect(game.state("wall").damage).toBe(0);
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1);
  });

  // Expected: Stormbringer's "Deal damage equal to its Might" has no unit subject — the SPELL deals it (417.6.b.2), so
  // Unyielding Spirit prevents it (Wall 0). Actual: the engine attributes the damage to the chosen unit and lets the 4
  // through the shield.
  test("ruling 812807956bed9097 — Stormbringer's damage should be spell damage prevented by Unyielding Spirit; engine deals it anyway", async () => {
    const game = await board().build();
    await game.p1.cast("storm", { targets: ["bruiser", "bf1"] });
    await spiritInResponseThenResolve(game);
    // (read before the ensuing bf1 combat, whose cleanup would heal the Wall anyway)
    expect(game.state("wall").damage).toBe(0);
    expect(game.locationOf("bruiser")).toBe("bf1");
    expect(game.zoneOf("storm")).toBe("trash");
  });

  test("Yasuo — PREVENTED: his attack trigger's 6 is ability damage → after it resolves under the shield the Wall has 0 damage (combat itself not yet fought)", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    expect(game.state("yasuo").combatRole).toBe("attacker");
    await answerWallIfAsked(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1, triggered: true })]);
    await spiritInResponseThenResolve(game);
    expect(game.state("wall").damage).toBe(0);
    expect(game.locationOf("yasuo")).toBe("bf1");
  });

  test("controls without the shield: Void Seeker puts 4 on the Wall; Stormbringer puts 4 (Bruiser's Might) on it (read as the chain empties, before the bf1 combat)", async () => {
    const a = await board().build();
    await a.p1.cast("seeker", { targets: "wall" });
    await drainChain(a);
    expect(a.state("wall").damage).toBe(4);
    const b = await board().build();
    await b.p1.cast("storm", { targets: ["bruiser", "bf1"] });
    await drainChain(b);
    expect(b.state("wall").damage).toBe(4);
    expect(b.locationOf("bruiser")).toBe("bf1");
  });
});

/**
 * Ruling 3cee6f423edcfd26 — Singularity (OGN-105 → ogn-105-298) · Spell · Mind · [6]+[mind][mind]
 *     "Deal 6 to each of up to two units."
 *   × Star Spring (UNL-215 → unl-215-219) · Battlefield · "The first time a player plays a non-token unit here each turn,
 *     they may move another unit they control here to its base."
 *   × Nidalee, Cat Form (UNL-114 → unl-114-219) · [3]+[body] · 4 Might · "[Ambush] (You may play me as a [Reaction] to a
 *     battlefield where you have units.) …"   (+ Kai'Sa, Survivor ogn-039-298 as "my Kai'Sa".)
 *
 * Q: Opponent Singularities my Kai'Sa at Star Spring; I react by Ambushing in Nidalee, and Star Spring lets me move
 *    Kai'Sa to base. Does Singularity still kill Kai'Sa?
 * A: Yes. Singularity has no location requirement ("a unit"), so Kai'Sa stays a legal target after moving to base
 *    and takes the 6 when Singularity resolves.
 * Rules: 359.3 (target legality rechecked on resolution — only the spell's stated requirements), 355.5.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SINGULARITY = "ogn-105-298";
const STAR_SPRING = "unl-215-219";
const NIDALEE_CAT_FORM = "unl-114-219";
const KAISA_SURVIVOR = "ogn-039-298"; // 4 Might

/**
 * P2's turn with exactly [6] + 2 mind and Singularity. bf1 = Star Spring (live), held by P1 with Kai'Sa (4) on it.
 * P1: Nidalee, Cat Form in hand with [3] + body.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 6, power: { mind: 2 } })
    .resources(P1, { energy: 3, power: { body: 1 } })
    .battlefield("bf1", { controller: P1, def: STAR_SPRING, inert: false })
    .unit(P1, "bf1", KAISA_SURVIVOR, "kaisa")
    .hand(P2, SINGULARITY, "sing")
    .hand(P1, NIDALEE_CAT_FORM, "nidalee");
}

/** Singularity → Kai'Sa; P1 Ambushes Nidalee into bf1; Star Spring's "you may" is accepted (Kai'Sa → base). */
async function singularityNidaleeStarSpring(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("sing", { targets: ["kaisa"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sing", targets: ["kaisa"] })]);
  await game.p2.passPriority();
  // Ambush: Nidalee is playable at Reaction speed, and only to the battlefield where P1 has units.
  expect(game.p1.can("play", "nidalee")).toBe(true);
  expect(game.p1.option("play", "nidalee")?.fields.find((f) => f.arg === "to")?.options).toEqual(["battlefield-bf1"]);
  await game.p1.play("nidalee", { to: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  // Star Spring triggers for P1 (the player who played a unit here) — an optional "you may".
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "bf1" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("kaisa"); // "another unit you control here" — Kai'Sa is the only one
  }
  return game;
}

describe("Ruling 3cee6f423edcfd26 — moving Kai'Sa to base via Star Spring does not dodge Singularity (no location restriction)", () => {
  test("the Star Spring trigger resolves first: Kai'Sa is moved to base while Singularity (still targeting her) waits on the chain; Nidalee is at bf1", async () => {
    const game = await singularityNidaleeStarSpring();
    for (let i = 0; i < 4 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("nidalee")).toBe("battlefield-bf1");
    expect(game.zoneOf("kaisa")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sing", targets: ["kaisa"] })]);
    expect(game.state("kaisa").damage).toBe(0);
  });

  test("Singularity then resolves: Kai'Sa — now in base — is still a legal target, takes 6 and dies", async () => {
    const game = await singularityNidaleeStarSpring();
    await game.settle();
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.zoneOf("nidalee")).toBe("battlefield-bf1");
    expect(game.state("nidalee").damage).toBe(0); // never chosen
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling 5ec5265f10f80267 — Fight or Flight (OGN-168 → ogn-168-298) · [Hidden] [Action] "Move a unit from a battlefield to its base."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might to an enemy unit here."
 *
 * Q: If Fight or Flight is used on Yasuo as he attacks, does his "When I attack" ability still resolve?
 * A: No — provided Fight or Flight is played as a Reaction from HIDDEN in response to the trigger. It resolves first and
 *    moves Yasuo home; his ability then finds that "here" is no longer where Yasuo is, so it does nothing.
 *    If instead Fight or Flight is played from hand (Action speed), Yasuo's trigger has already resolved before it can
 *    be played at all.
 * Rules: 811 (hidden → gains Reaction), 359.3 (LIFO), 359.3.f.2 ("here" re-evaluated on resolution), 309 / 354.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const YASUO = "ogn-076-298";

/** P2's turn. P1 holds bf1 with a 7-Might Defender (survives a 6). P2's Yasuo (6) attacks from base. */
function board(fof: "hidden" | "hand") {
  const s = scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 7, name: "Defender" }, "def")
    .unit(P2, "base", YASUO, "yasuo");
  return fof === "hidden" ? s.facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof") : s.hand(P1, FIGHT_OR_FLIGHT, "fof");
}

async function yasuoAttacks(game: Game): Promise<void> {
  await game.p2.move("yasuo", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P2, triggered: true })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
}

describe("Ruling 5ec5265f10f80267 — hidden Fight or Flight answers Yasuo's attack trigger; his damage 'here' fizzles", () => {
  test("from HIDDEN: P1 flips Fight or Flight onto Yasuo in response; it lands above his trigger on the chain", async () => {
    const game = await board("hidden").build();
    await yasuoAttacks(game);
    expect(game.p1.can("reveal", "fof")).toBe(true);
    await game.p1.reveal("fof", { answers: ["yasuo"] });
    expect(game.p1.energy()).toBe(2); // played for [0] from facedown
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "fof"]);
  });

  test("Fight or Flight resolves first (Yasuo → base); Yasuo's trigger then has no 'here' with an enemy — Defender takes NO damage, the combat is off", async () => {
    const game = await board("hidden").build();
    await yasuoAttacks(game);
    await game.p1.reveal("fof", { answers: ["yasuo"] });
    // Resolve just Fight or Flight.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "fof"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("yasuo")).toBe("base");
    expect(game.state("def").damage).toBe(0); // trigger not resolved yet / nothing dealt
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("def").damage).toBe(0);
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.locationOf("yasuo")).toBe("base");
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]); // no attacker left → no combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("from HAND (Action): P1 cannot play it while the trigger is on the chain; the trigger resolves (Defender takes 6) BEFORE Fight or Flight can be cast", async () => {
    const game = await board("hand").build();
    await yasuoAttacks(game);
    expect(game.p1.can("cast", "fof")).toBe(false); // closed state — Action speed is not legal
    await game.p1.passPriority(); // both passed → Yasuo's trigger resolves
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("def");
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("def").damage).toBe(6);
    // Now, in the open showdown, P1 eventually gets Focus and may cast it — too late to stop the damage.
    for (let i = 0; i < 3 && !(game.actingSeat() === P1 && game.p1.can("cast", "fof")); i++) {
      await game.acting().pass();
    }
    expect(game.p1.can("cast", "fof")).toBe(true);
    expect(game.state("def").damage).toBe(6); // the damage is already marked when the window finally opens
    await game.p1.cast("fof", { targets: "yasuo" });
    await game.settle();
    expect(game.locationOf("yasuo")).toBe("base"); // (combat then ends and its cleanup heals — irrelevant to the ruling)
    expect(game.violations()).toEqual([]);
  });
});

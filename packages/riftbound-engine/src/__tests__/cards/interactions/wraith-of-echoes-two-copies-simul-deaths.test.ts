/**
 * Interaction: two Wraith of Echoes (ogn-118-298) "The first time a friendly unit dies each turn,
 *   draw 1." (5 Might, base)
 *   × two Watchful Sentry (ogn-096-298) "[Deathknell] — Draw 1." (1 Might, at a battlefield)
 *   × Flurry of Blades (ogn-133-298) "[Reaction] Deal 1 to all units at battlefields." (opponent)
 *
 * Rules: 383.1.b ("Nth time" trigger met by several simultaneous events → controller picks ONE,
 * ability triggers once), 383.3.e / 383.3.e.1 (once-each-turn triggers stop after N performances),
 * 383.3.d (controller orders simultaneous triggers), 323.4 / 323.5 (Cleanup 3a: death triggers are
 * noted before 3b moves the units to trash), 808.2 (each Deathknell instance triggers separately).
 *
 * Question: A (P1) has 2 Wraiths in base + 2 Sentries at bf1; B (P2, turn player) casts Flurry of
 * Blades, killing both Sentries simultaneously.
 *   (a) A draws 4: 2 Deathknells + 1 per Wraith (each Wraith is its own ability instance, but the two
 *       simultaneous deaths are ONE "first time" per Wraith — not two).
 *   (b) A third friendly death later the same turn draws nothing from either Wraith.
 *   Contrast: on the next turn the first friendly death triggers each Wraith again (+2).
 *
 * Engine note: Flurry of Blades currently (wrongly) asks for a battlefield; every unit that matters
 * sits at bf1 and "bf1" is fed via `answers` so the Wraith interaction can still be exercised.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WRAITH_OF_ECHOES = "ogn-118-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const FLURRY_OF_BLADES = "ogn-133-298";

/**
 * P2's turn. P1: two Wraiths (base), two Sentries + a 2-Might "survivor" at bf1 (survives the first
 * Flurry with 1 damage, dies to the second), and a 1-Might fodder in base for next turn's contrast.
 * P2: two Flurries in hand and a 6-Might wall on bf2 for the fodder to die against next turn.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", WRAITH_OF_ECHOES, "wraithA")
    .unit(P1, "base", WRAITH_OF_ECHOES, "wraithB")
    .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry1")
    .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry2")
    .unit(P1, "bf1", { might: 2, name: "Survivor" }, "survivor")
    .unit(P1, "base", { might: 1, name: "Fodder" }, "fodder")
    .unit(P2, "bf2", { might: 6, name: "Wall" }, "wall")
    .resources(P2, { energy: 2 })
    .hand(P2, FLURRY_OF_BLADES, "flurry1")
    .hand(P2, FLURRY_OF_BLADES, "flurry2");
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

async function flurry(game: Game, alias: string) {
  await game.p2.cast(alias, { answers: ["bf1"] });
  await game.settle({ policy: "first" }); // "first" also answers any trigger-ordering prompt for P1
}

describe("Two Wraith of Echoes × two simultaneous Watchful Sentry deaths", () => {
  test("Flurry of Blades kills both 1-Might Sentries simultaneously; the 2-Might survivor and the based Wraiths live", async () => {
    const game = await board().build();
    await flurry(game, "flurry1");
    expect(game.zoneOf("flurry1")).toBe("trash");
    expect(game.zoneOf("sentry1")).toBe("trash");
    expect(game.zoneOf("sentry2")).toBe("trash");
    expect(game.locationOf("survivor")).toBe("bf1");
    expect(game.state("survivor").damage).toBe(1);
    expect(game.state("wraithA").damage).toBe(0); // base units are not "at battlefields"
    expect(game.state("wraithB").damage).toBe(0);
  });

  test("each Watchful Sentry's Deathknell triggers separately (808.2, 323.4): at least 2 cards drawn", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await flurry(game, "flurry1");
    expect(game.p1.hand().length).toBeGreaterThanOrEqual(hand0 + 2);
    expect(game.chain()).toEqual([]);
  });

  test.failing("BUG: (a) A draws exactly 4 — 2 Deathknells + ONE trigger per Wraith (383.1.b: simultaneous deaths are a single 'first time'; two Wraiths = two instances). Engine never fires the Wraith trigger (draws 2)", async () => {
    // Expected: hand +4 (not +2 = Wraiths ignored, not +6 = each Wraith triggering per death).
    // Actual: only the two Deathknells resolve; "first time a friendly unit dies" never triggers.
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await flurry(game, "flurry1");
    expect(game.p1.hand()).toHaveLength(hand0 + 4);
  });

  test("(b) a third friendly death later the same turn draws nothing more from either Wraith (383.3.e.1)", async () => {
    // NOTE: passes today only because the Wraith trigger never fires at all; the absolute count is
    // pinned by the BUG test below.
    const game = await board().build();
    await flurry(game, "flurry1");
    const afterFirst = game.p1.hand().length;
    await flurry(game, "flurry2"); // survivor (2 Might, 1 damage) takes 1 more and dies — no Deathknell
    expect(game.zoneOf("survivor")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(afterFirst);
  });

  test.failing("BUG: (b) absolute count — after the simultaneous deaths (+4) and a later third death (+0) A has drawn exactly 4", async () => {
    // Expected: hand0 + 4 after both Flurries. Actual: hand0 + 2 (Wraith triggers missing).
    const game = await board().build();
    const hand0 = game.p1.hand().length;
    await flurry(game, "flurry1");
    await flurry(game, "flurry2");
    expect(game.zoneOf("survivor")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 4);
  });

  test.failing("BUG: contrast — the once-per-turn count resets: on the NEXT turn the first friendly death triggers each Wraith again (+2)", async () => {
    // Expected: after A's fodder dies in combat on A's own turn, A's hand grows by 2 (one per Wraith;
    // fodder has no Deathknell). Actual: +0 — the Wraith trigger never fires.
    const game = await board().build();
    await flurry(game, "flurry1");
    await flurry(game, "flurry2");
    await game.advanceTurn(); // P2 ends → P1's turn (P1 channels + draws 1 during Beginning)
    expect(game.turnPlayer()).toBe(P1);
    const beforeDeath = game.p1.hand().length;
    await game.p1.move("fodder", "bf2");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(beforeDeath + 2);
  });
});

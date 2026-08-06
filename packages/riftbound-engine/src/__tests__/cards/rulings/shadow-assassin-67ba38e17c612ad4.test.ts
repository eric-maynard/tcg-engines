/**
 * Ruling 67ba38e17c612ad4 — Shadow Assassin (ven-013-166) · Unit · Fury · 5 · 5 Might
 *   "I enter ready if you have a card with my name in your trash."
 *   × The Harrowing (ogn-198-298) · Spell · Chaos · 6 + [chaos][chaos]
 *     "Play a unit from your trash, ignoring its Energy cost. (You must still pay its Power cost.)"
 *
 * Q: Does Shadow Assassin count itself when I play it from my trash?
 * A: No. Playing it from the trash moves it onto the chain first (354, 419.1), so when it enters it is no
 *    longer in the trash. It enters ready only if a DIFFERENT card with its name is still there.
 *    (Consuming Curse / Shadowblade Lurker work the same way.)
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, scenario } from "../../../harness";

const SHADOW_ASSASSIN = "ven-013-166";
const THE_HARROWING = "ogn-198-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn with The Harrowing's 6 + [chaos][chaos] and Shadow Assassin ("sa") in the trash (+ optional 2nd copy). */
function harrowingBoard(secondCopy: boolean) {
  const s = scenario()
    .resources(P1, { energy: 6, power: { chaos: 2 } })
    .battlefield("bf1", { controller: null })
    .trash(P1, SHADOW_ASSASSIN, "sa")
    .hand(P1, THE_HARROWING, "harrowing");
  return secondCopy ? s.trash(P1, SHADOW_ASSASSIN, "saOther") : s;
}

/** Cast The Harrowing choosing "sa", then answer whatever the reanimation asks (unit → sa, location → base). */
async function harrowSa(game: Game): Promise<void> {
  await game.p1.cast("harrowing", { targets: "sa" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  for (let i = 0; i < 10; i++) {
    await game.settle();
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      return;
    }
    if (d.seat !== P1) {
      return;
    }
    if (d.kind === "pick") {
      const sa = d.options.find((o) => (o.card ?? o.key) === "sa");
      const base = d.options.find((o) => o.key === "base" || o.zone === "base");
      await game.p1.pick((sa ?? base ?? d.options[0]!).key);
    } else if (d.kind === "yes-no") {
      await game.p1.no(); // no Accelerate-style extras
    } else {
      return;
    }
  }
}

describe("Ruling 67ba38e17c612ad4 — Shadow Assassin played from the trash does not see itself there", () => {
  test("control: played from HAND while another Shadow Assassin is in the trash → enters READY (5 energy)", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).trash(P1, SHADOW_ASSASSIN, "dead").hand(P1, SHADOW_ASSASSIN, "sa").build();
    await game.p1.play("sa");
    await game.settle();
    expect(game.zoneOf("sa")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("dead")).toBe("trash");
    expect(game.state("sa").isReady).toBe(true);
  });

  // Expected: with NO card named Shadow Assassin in the trash the condition is false → it enters exhausted
  // like any played unit (143.4). Actual: the engine's enter-ready static is unconditional — it enters ready.
  test.failing("BUG: ruling 67ba38e17c612ad4 — played from hand with no namesake in the trash → enters EXHAUSTED (engine readies it unconditionally)", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).trash(P1, { might: 2, name: "Somebody Else" }, "other").hand(P1, SHADOW_ASSASSIN, "sa").build();
    await game.p1.play("sa");
    await game.settle();
    expect(game.zoneOf("sa")).toBe("base");
    expect(game.state("sa").isExhausted).toBe(true);
  });

  // Expected: The Harrowing plays the ONLY Shadow Assassin out of the trash; it goes trash → chain → board,
  // so at the moment it enters the trash holds no card with its name → it enters EXHAUSTED (354, 419.1).
  // Actual: The Harrowing's play-from-trash effect is not functional (it enumerates board units as
  // "targets" and resolves doing nothing) — Shadow Assassin never leaves the trash.
  test.failing("BUG: ruling 67ba38e17c612ad4 — reanimated by The Harrowing as the only copy: it does NOT count itself → enters EXHAUSTED", async () => {
    const game = await harrowingBoard(false).build();
    const offered = game.p1.option("cast", "harrowing")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered.flat()).toContain("sa"); // a unit in P1's TRASH is what The Harrowing chooses
    await harrowSa(game);
    expect(game.zoneOf("harrowing")).toBe("trash");
    expect(game.zoneOf("sa")).toBe("base");
    expect(game.p1.trash()).not.toContain("sa");
    expect(game.state("sa").isExhausted).toBe(true);
  });

  // Expected: with a SECOND Shadow Assassin left behind in the trash, the reanimated one does see "a card
  // with my name in your trash" when it enters → READY. Actual: not played at all (see above).
  test.failing("BUG: ruling 67ba38e17c612ad4 — reanimated by The Harrowing while a different Shadow Assassin stays in the trash → enters READY", async () => {
    const game = await harrowingBoard(true).build();
    await harrowSa(game);
    expect(game.zoneOf("sa")).toBe("base");
    expect(game.zoneOf("saOther")).toBe("trash");
    expect(game.state("sa").isReady).toBe(true);
  });
});

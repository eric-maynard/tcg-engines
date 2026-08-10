/**
 * Ruling cc3c643f7b4e241f — Noxus Saboteur (OGN-018 → ogn-018-298) · Unit · Fury · [3] · 3 Might
 *     "Your opponents' [Hidden] cards can't be revealed here."
 *   × Lee Sin, Ascetic (ogn-078-298) · 5 Might · [Shield] — the defender
 *   × Zhonya's Hourglass (ogn-077-298) — P1's card hidden at the battlefield
 *
 * Q: Lee Sin kills the Saboteur in combat while also taking lethal damage. Is there a window after the Saboteur
 *    dies (lifting its "can't be revealed here") but before Lee Sin leaves, in which the hidden card can be used?
 * A: No. All units with lethal damage are removed in the same step of the cleanup — the Saboteur and Lee Sin die
 *    simultaneously, so no such window exists.
 * Rules: 465.2 (combat damage dealt simultaneously), 466.1 / 322–323 (one cleanup kills every lethally damaged
 *        unit at once), 811.1.b (a hidden card is lost with control of its battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOXUS_SABOTEUR = "ogn-018-298";
const LEE_SIN_ASCETIC = "ogn-078-298";
const ZHONYAS = "ogn-077-298";

/**
 * P2's turn. P1 controls bf1 with Lee Sin, Ascetic (5, Shield ⇒ 6 while defending) and has a Zhonya's hidden there
 * since an earlier turn. P2 attacks with Noxus Saboteur (3) + a 3-Might Brute: 6 each way — everybody dies.
 */
function board() {
  return scenario()
    .turn(4)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LEE_SIN_ASCETIC, "lee")
    .facedown(P1, "bf1", ZHONYAS, "zh")
    .unit(P2, "base", NOXUS_SABOTEUR, "sab")
    .unit(P2, "base", { might: 3, name: "Brute" }, "brute")
    .unit(P1, "base", { might: 1, name: "Bystander" }, "by");
}

async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p2.move(["sab", "brute"], "bf1");
  expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true });
  return game;
}

describe("Ruling cc3c643f7b4e241f — Saboteur and Lee Sin die in the same cleanup step: no window to flip the hidden card", () => {
  test("baseline before the attack: on P2's turn P1's hidden Zhonya's is a legal Reaction… but once the Saboteur is AT bf1 and P1 holds Focus, revealing it there is forbidden", async () => {
    const game = await attack();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "zh")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("zh"));
    expect(r.ok).toBe(false);
  });

  test("(control: without a Saboteur at bf1 the same Focus window DOES let P1 flip it)", async () => {
    const game = await scenario()
      .turn(4)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LEE_SIN_ASCETIC, "lee")
      .facedown(P1, "bf1", ZHONYAS, "zh")
      .unit(P2, "base", { might: 3, name: "Brute" }, "brute")
      .unit(P2, "base", { might: 3, name: "Brute Two" }, "brute2")
      .build();
    await game.p2.move(["brute", "brute2"], "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "zh")).toBe(true);
  });

  test("combat: 6 damage each way — Saboteur, Brute AND Lee Sin all die in ONE cleanup; stepping through every decision from the damage step to P2's open main phase, P1 is never able to reveal the Hourglass", async () => {
    const game = await attack();
    await game.p2.passFocus();
    await game.p1.passFocus(); // → combat damage step
    let everRevealable = false;
    let sawSplitState = false; // a state where the Saboteur is dead but Lee Sin is still on bf1
    for (let i = 0; i < 30; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      everRevealable ||= game.p1.can("reveal", "zh");
      sawSplitState ||= game.zoneOf("sab") === "trash" && game.zoneOf("lee") === "battlefield-bf1";
      const step = await game.settle({ maxSteps: 1 });
      if (step.reason === "unanswered") {
        break;
      }
    }
    expect(everRevealable).toBe(false);
    expect(sawSplitState).toBe(false);
    expect(game.zoneOf("sab")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("lee")).toBe("trash");
  });

  test("aftermath: nobody holds bf1 (uncontrolled), and with control gone P1's still-facedown Hourglass went to the trash unused — Lee Sin was not saved", async () => {
    const game = await attack();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling 7df709c48220dff5 — Piercing Light (SFD-023 → sfd-023-221) · Spell · Fury · 2+[fury] "[Repeat] [2][fury] … Deal 2 to a unit at a
 *     battlefield, then deal 2 to up to one other unit."
 *   × Fizz, Trickster (SFD-140 → sfd-140-221) · 3+[chaos] · 3 Might "When you play me, you may play a spell from your trash with Energy
 *     cost no more than [3], ignoring its Energy cost. Recycle that spell after you play it. (You must still pay its Power cost.)"
 *
 * Q: Can you play Fizz and play a REPEATED Piercing Light from the trash?
 * A: Yes. Fizz's when-played trigger resolves and you play Piercing Light from trash: its Energy cost is ignored but its Power cost
 *    ([fury]) must be paid, and because you are playing the spell you may also pay its [Repeat] cost — in full ([2][fury]). It then
 *    executes twice, and afterwards Fizz's rider recycles it.
 * Rules: 820 (Repeat: optional additional cost chosen as you play the spell), 356 (additional costs), 346 (playing a card via an
 *        effect is still playing it), Fizz text.
 * ENGINE: the effect-play pipeline offers the spell's [Repeat] as the optional additional cost of that play
 *        (`play-pipeline.ts continueEffectPlay`), so the ruling's repeated line is playable (see the last test).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";
const FIZZ = "sfd-140-221";

/**
 * P1's turn. P2 holds bf1 with X (4) and Y (4) — each survives one execution (2) but not two (4). P1: Fizz in hand, Piercing Light
 * in trash; exactly Fizz's 3+[chaos] plus the Repeat's [2] and two [fury] (base power + repeat power).
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "X" }, "X")
    .unit(P2, "bf1", { might: 4, name: "Y" }, "Y")
    .hand(P1, FIZZ, "fizz")
    .trash(P1, PIERCING_LIGHT, "pl")
    .resources(P1, { energy: 5, power: { chaos: 1, fury: 2 } });
}

/** Play Fizz, accept his trigger (Piercing Light is the only candidate) and resolve it until Piercing Light itself is on the chain. */
async function fizzPlaysLight(game: Game, onDecision?: (d: Decision) => Promise<boolean>): Promise<void> {
  await game.p1.play("fizz");
  expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, fury: 2 } }); // Fizz paid
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "fizz" } });
  await game.p1.yes();
  for (let i = 0; i < 10 && !game.chain().some((c) => c.cardId === "pl" && !c.triggered); i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (onDecision && (await onDecision(d))) {
      continue;
    }
    if (d.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "pl") {
      // rule 820.1.c.1 — the [Repeat] election on the effect-play; unrepeated lines decline it.
      await game.p1.no();
    } else if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick((d.options.find((o) => o.card === "pl") ?? d.options[0]!).key);
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
}

/** Answer Piercing Light's target prompts: first X, then Y ("up to one other unit"). */
function lightTargets(game: Game): void {
  game.script(P1, [
    (d) => (d.kind === "pick" ? (d.options.find((o) => o.card === "X") ?? d.options[0])?.key : undefined),
    (d) => (d.kind === "pick" ? (d.options.find((o) => o.card === "Y") ?? d.options[0])?.key : undefined),
    (d) => (d.kind === "pick" ? (d.options.find((o) => o.card === "X") ?? d.options[0])?.key : undefined),
    (d) => (d.kind === "pick" ? (d.options.find((o) => o.card === "Y") ?? d.options[0])?.key : undefined),
  ]);
}

describe("Ruling 7df709c48220dff5 — Fizz replays Piercing Light from trash; Energy ignored, Power paid, Repeat payable", () => {
  test("Fizz's when-played trigger plays Piercing Light from the trash as a real spell on the chain: its [2] Energy is NOT paid, its [fury] Power IS", async () => {
    const game = await board().build();
    await fizzPlaysLight(game);
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pl", controller: P1, triggered: false })]);
    expect(game.zoneOf("pl")).toBe("chain");
    expect(game.p1.energy()).toBe(2); // energy cost ignored
    expect(game.p1.power("fury")).toBe(1); // power cost paid
  });

  test("unrepeated, it resolves once (X takes 2, then Y takes 2 — both survive) and Fizz's rider then RECYCLES it to the bottom of P1's deck instead of the trash", async () => {
    const game = await board().build();
    await fizzPlaysLight(game);
    lightTargets(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("X")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.state("Y")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.zoneOf("pl")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("pl");
    expect(game.p1.trash()).not.toContain("pl");
    expect(game.violations()).toEqual([]);
  });

  // rule 820 / 356.2.b / 346 (ruling 7df709c48220dff5) — playing a card off an effect is still playing it, so the
  // performer may elect the spell's [Repeat] and pay it IN FULL ([2][fury]) on top of the ignored base Energy; two
  // executions then run from the ONE Chain item and Fizz's rider still recycles the spell afterwards.
  test("the [Repeat] IS offered on the effect-play and costs [2][fury] in full: two executions run from one chain item and the lead target takes 2+2 and dies", async () => {
    const game = await board().build();
    let repeatOffered = false;
    await fizzPlaysLight(game, async (d) => {
      if (d.seat === P1 && d.source?.cardId === "pl" && (d.kind === "yes-no" || d.kind === "integer")) {
        repeatOffered = true;
        await (d.kind === "yes-no" ? game.p1.yes() : game.p1.chooseX(1));
        return true;
      }
      return false;
    });
    expect(repeatOffered).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } }); // [2][fury] on top of the base [fury]
    expect(game.chain().filter((c) => c.cardId === "pl" && !c.triggered)).toHaveLength(1); // ONE item (820.3.a)
    lightTargets(game);
    await game.settle();
    expect(game.zoneOf("X")).toBe("trash"); // 2 + 2 on a 4-Might unit
    expect(game.zoneOf("pl")).toBe("mainDeck"); // Fizz's rider still recycles it
    expect(game.violations()).toEqual([]);
  });

  // Expected (820.2): EVERY execution of the repeated spell makes its own choices as the spell is played, so the
  // second execution names its own "…then deal 2 to up to one other unit" — X and Y each take 2 twice and both die.
  // Actual: an effect-played spell binds ONE target set at finalization and both executions run against it, so the
  // second execution's "other unit" is never named and Y is only damaged once.
  test.failing("BUG: with Repeat both executions name their own targets, so X and Y each take 2+2 and both die (820.2)", async () => {
    const game = await board().build();
    await fizzPlaysLight(game, async (d) => {
      if (d.seat === P1 && d.source?.cardId === "pl" && (d.kind === "yes-no" || d.kind === "integer")) {
        await (d.kind === "yes-no" ? game.p1.yes() : game.p1.chooseX(1));
        return true;
      }
      return false;
    });
    lightTargets(game);
    await game.settle();
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.zoneOf("Y")).toBe("trash");
  });
});

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
 * ENGINE: the Repeat half is a known RULING-CONFLICT — a spell's riders are `playSpell` move params, so an effect-played
 *        spell is never offered its optional additional cost (see the last test).
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
    if (d.kind === "pick" && d.seat === P1) {
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

  // RULING-CONFLICT: by rule 820 / 356.2.b the [Repeat] is an optional additional cost the performer may elect while
  // playing the spell, and playing it off Fizz's trigger is still playing it (346) — so the ruling says P1 could pay
  // [2][fury] and get two executions. The engine cannot: a SPELL's riders (repeatCount, targets) are parameters of the
  // `playSpell` MOVE, and the effect-play pipeline explicitly skips the optional-additional-cost offer for spells
  // (`play-pipeline.ts finishPlayItem`: "never for a spell here: its riders are play params"). An effect-played spell
  // therefore always runs unrepeated; the Repeat's [2] and the second [fury] stay in the pool.
  test("RULING-CONFLICT (effect-played spells take no riders): no [Repeat] is ever offered, so Fizz's Piercing Light runs once and the Repeat resources stay unspent", async () => {
    const game = await board().build();
    let repeatOffered = false;
    await fizzPlaysLight(game, async (d) => {
      // Any opt-in / amount prompt about Piercing Light before it finalizes would be the Repeat payment.
      if (d.seat === P1 && d.source?.cardId === "pl" && (d.kind === "yes-no" || d.kind === "integer")) {
        repeatOffered = true;
        await (d.kind === "yes-no" ? game.p1.yes() : game.p1.chooseX(1));
        return true;
      }
      return false;
    });
    expect(repeatOffered).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 0, fury: 1 } }); // only the base [fury] was paid
    lightTargets(game);
    await game.settle();
    expect(game.state("X")).toMatchObject({ damage: 2 }); // one execution only — both survive
    expect(game.state("Y")).toMatchObject({ damage: 2 });
    expect(game.zoneOf("pl")).toBe("mainDeck"); // Fizz's rider still recycles it
    expect(game.violations()).toEqual([]);
  });
});

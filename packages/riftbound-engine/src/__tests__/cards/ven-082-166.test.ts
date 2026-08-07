/**
 * Profiteer — ven-082-166 · Unit · Body · 4 energy · 4 Might
 *
 *   When you play me, you may disempower something you control to empower a legend, unit, or gear.
 *
 * Head-judge notes — the tricky situations for THIS card:
 *   1. "disempower something you control TO empower …" is a cost within instructions right after the
 *      leading "you may" (383.3.b): the disempower is the BASE COST of the trigger, paid to finalize it to
 *      the chain (383.3.b.1) — before the opponent gets priority — while the empower happens on resolution.
 *   2. Only an Empowered object YOU CONTROL can pay (442.1.a: disempowering a non-Empowered card does
 *      nothing, so it is not a payment). Nothing of yours Empowered → the trigger cannot be performed and
 *      Profiteer is just a 4/4; an enemy's Empowered unit is never touched. Profiteer itself enters
 *      un-Empowered so it can never pay for itself.
 *   3. The target is "a legend, unit, or gear" with NO controller restriction: your legend, your gear, or
 *      even an enemy unit are all legal. Losing [Empowered] switches off the payer's [Empowered][>] passive
 *      (Legion Marauder 3 → 2) and gaining it switches the target's on.
 *   4. Empowering via Profiteer is the Empower game action → "When I become [Empowered]" triggers on the
 *      target fire (441.2.a / 828.1.d) — Apprentice Mage Predicts.
 *   5. "you may": declining leaves everything as it was (payer stays Empowered, nothing gained).
 *   6. Registry: the parser currently leaves the whole effect as `raw` text — every effect clause is a BUG.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-082-166";
const MARAUDER = "ven-074-166"; // Legion Marauder — 2 Might, [Empowered][>] +1 Might
const MAGE = "ven-047-166"; // Apprentice Mage — When I become [Empowered], Predict 2; [Empowered][>] +1
const BALLISTA = "ogn-017-298"; // Iron Ballista — plain gear
const LEGEND = { cardType: "legend", domain: "body", name: "Test Legend" };

/** P1: 4 energy, Profiteer in hand, an Empowered Marauder (3 Might), a plain gear, a legend. P2: a plain Marauder + an Empowered 3-Might unit. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .legend(P1, LEGEND, "legend")
    .unit(P1, "base", MARAUDER, "payer", { empowered: true })
    .gear(P1, BALLISTA, "ballista")
    .unit(P2, "base", MARAUDER, "theirs")
    .unit(P2, "base", { might: 3, name: "Their Amped" }, "theirAmped", { empowered: true })
    .hand(P1, CARD, "prof");
}

/** Answer P1's prompts (yes / the wanted picks, in whatever order the engine asks) until none apply. */
async function drive(game: Game, wants: string[]): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.seat !== P1) {
      return;
    }
    if (d.kind === "yes-no") {
      await game.p1.yes();
      continue;
    }
    if (d.kind === "pick") {
      const want = wants.find((w) => d.options.some((o) => o.card === w || o.key === w));
      if (want === undefined) {
        return;
      }
      wants.splice(wants.indexOf(want), 1);
      await game.p1.pick(want);
      continue;
    }
    return;
  }
}

/** Play Profiteer, pay with `payer`, empower `target`, and resolve everything. */
async function playAndResolve(game: Game, target: string, payer = "payer"): Promise<void> {
  const wants = [payer, target];
  await game.p1.play("prof");
  await drive(game, wants);
  await game.settle();
  await drive(game, wants);
  await game.settle();
  await drive(game, wants);
  await game.settle({ policy: "first" }); // drain any follow-on prompt (e.g. a Predict)
}

describe("Profiteer (ven-082-166)", () => {
  test("registry payload — the play trigger should carry a disempower cost + an empower of a legend/unit/gear, not raw text", async () => {
    // Expected: one optional play-self trigger whose payload models cost {disempower: friendly permanent}
    // and effect {type: "empower", target types legend|unit|gear}. Actual: effect is {type: "raw", text}.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 4, might: 4, name: "Profiteer" });
    expect(def?.abilities).toHaveLength(1);
    const trig = def?.abilities?.[0] as { type: string; optional?: boolean; trigger: { event: string }; effect: { type: string } };
    expect(trig).toMatchObject({ optional: true, trigger: { event: "play-self" }, type: "triggered" });
    expect(trig.effect.type).not.toBe("raw");
    expect(JSON.stringify(trig)).toMatch(/disempower/);
    expect(JSON.stringify(trig.effect)).toMatch(/"empower"/);
  });

  test("cost: 4 energy, enters the base exhausted as a 4-Might non-Empowered unit; 3 energy is one short", async () => {
    const game = await board().build();
    await game.p1.play("prof");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("prof")).toBe("base");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.state("prof")).toMatchObject({ isEmpowered: false, isExhausted: true, might: 4 });
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "prof").build();
    expect(poor.p1.can("play", "prof")).toBe(false);
  });

  function nothingEmpowered() {
    return scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", MARAUDER, "mine")
      .unit(P2, "base", { might: 3, name: "Their Amped" }, "theirAmped", { empowered: true })
      .hand(P1, CARD, "prof");
  }

  test("nothing you control is Empowered → even opting in changes nothing: the enemy's Empowered unit is untouched, nothing of mine gains the status (442.1.a)", async () => {
    const game = await nothingEmpowered().build();
    await game.p1.play("prof");
    await game.settle();
    await drive(game, ["theirAmped", "mine", "prof"]); // try to abuse every conceivable prompt
    await game.settle();
    await drive(game, ["theirAmped", "mine", "prof"]);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("theirAmped").isEmpowered).toBe(true);
    expect(game.state("mine")).toMatchObject({ isEmpowered: false, might: 2 });
    expect(game.state("prof").isEmpowered).toBe(false);
  });

  test("with no Empowered object of yours the 'you may [cost]' cannot be accepted at all (383.3.b.1) — the prompt must be absent or canAccept:false", async () => {
    // Expected: no acceptable opt-in when the base cost is unpayable. Actual: a plain yes/no with canAccept true.
    const game = await nothingEmpowered().build();
    await game.p1.play("prof");
    await game.settle();
    const d = game.decision();
    const acceptable = d?.seat === P1 && d.kind === "yes-no" && d.canAccept !== false;
    expect(acceptable).toBe(false);
  });

  test("disempower my Marauder (3 → 2 Might) to empower my LEGEND", async () => {
    // Expected: payer loses Empowered (its +1 passive turns off), the legend gains it. Actual: raw no-op.
    const game = await board().build();
    await playAndResolve(game, "legend");
    expect(game.state("payer")).toMatchObject({ isEmpowered: false, might: 2 });
    expect(game.state("legend").isEmpowered).toBe(true);
    expect(game.state("prof").isEmpowered).toBe(false); // Profiteer is neither payer nor default target
  });

  test("the target may be a GEAR — Iron Ballista becomes Empowered", async () => {
    const game = await board().build();
    await playAndResolve(game, "ballista");
    expect(game.state("payer").isEmpowered).toBe(false);
    expect(game.state("ballista").isEmpowered).toBe(true);
  });

  test("no controller restriction on the target — an ENEMY unit can be empowered (their Marauder 2 → 3)", async () => {
    const game = await board().build();
    await playAndResolve(game, "theirs");
    expect(game.state("payer")).toMatchObject({ isEmpowered: false, might: 2 });
    expect(game.state("theirs")).toMatchObject({ controller: P2, isEmpowered: true, might: 3 });
  });

  test("only YOUR Empowered objects can pay — the enemy's Empowered unit is never offered as the cost", async () => {
    // Expected: at the cost prompt the options include `payer` but not `theirAmped`. Actual: no prompt at all.
    const game = await board().build();
    await game.p1.play("prof");
    let sawCostPrompt = false;
    for (let i = 0; i < 8 && !sawCostPrompt; i++) {
      const d = game.decision();
      if (d?.seat === P1 && d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d?.seat === P1 && d.kind === "pick" && d.options.some((o) => o.card === "payer" || o.key === "payer")) {
        sawCostPrompt = true;
        expect(d.options.some((o) => o.card === "theirAmped" || o.key === "theirAmped")).toBe(false);
        expect(d.options.some((o) => o.card === "prof" || o.key === "prof")).toBe(false); // not Empowered itself
      } else {
        await game.settle();
      }
    }
    expect(sawCostPrompt).toBe(true);
  });

  test.failing("BUG: timing (383.3.b.1) — the disempower is paid when the trigger is finalized, before P2 gets priority; the empower waits for resolution", async () => {
    // Expected: after P1's finalization answers, chain = [Profiteer trigger], payer already un-Empowered,
    // legend not yet Empowered; P2 may respond; after both pass the legend is Empowered.
    const game = await board().build();
    await game.p1.play("prof");
    await drive(game, ["payer", "legend"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "prof", controller: P1, triggered: true })]);
    expect(game.state("payer").isEmpowered).toBe(false);
    expect(game.state("legend").isEmpowered).toBe(false);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    await drive(game, ["legend"]);
    await game.settle();
    expect(game.state("legend").isEmpowered).toBe(true);
  });

  test("'you may' — declining keeps the payer Empowered (3 Might) and empowers nothing", async () => {
    const game = await board().build();
    await game.p1.play("prof");
    await game.settle();
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind === "yes-no" || (d?.kind === "pick" && d.allowDecline)).toBe(true);
    await (d?.kind === "yes-no" ? game.p1.no() : game.p1.decline());
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("payer")).toMatchObject({ isEmpowered: true, might: 3 });
    expect([game.state("legend"), game.state("ballista"), game.state("theirs")].map((s) => s.isEmpowered)).toEqual([false, false, false]);
  });

  test("partner — empowering Apprentice Mage this way is 'becoming Empowered' (441.2.a): +1 Might and its Predict 2 prompt fires", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", MARAUDER, "payer", { empowered: true })
      .unit(P1, "base", MAGE, "mage")
      .deckTop(P1, { cardType: "spell", energyCost: 0, name: "Top A" }, "a")
      .deckTop(P1, { cardType: "spell", energyCost: 0, name: "Top B" }, "b")
      .hand(P1, CARD, "prof")
      .build();
    const wants = ["payer", "mage"];
    await game.p1.play("prof");
    await drive(game, wants);
    await game.settle();
    await drive(game, wants);
    await game.settle();
    await drive(game, wants);
    await game.settle();
    expect(game.state("mage")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.state("payer")).toMatchObject({ isEmpowered: false, might: 2 });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 }); // Predict 2: shown a and b
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["a", "b"]);
  });
});

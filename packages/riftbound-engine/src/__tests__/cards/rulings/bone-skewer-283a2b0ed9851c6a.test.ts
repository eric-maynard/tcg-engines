/**
 * Ruling 283a2b0ed9851c6a — Bone Skewer (UNL-139 → unl-139-219) · [Hidden] · [2][chaos]
 *   "Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play
 *    that unit to that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *
 * Q: After I win a showdown, can I use Bone Skewer to start another one?
 * A: Yes. Back in the open Main Phase you may play it (it has neither [Action] nor [Reaction], so it
 *    is a Main-Phase-only spell — you could NOT have played it during the showdown). Putting the
 *    opponent's unit at a battlefield where you have units makes that battlefield contested, which
 *    opens a fresh combat showdown. Rule 465 still caps the battlefield at one score per turn.
 * Rules: 342 / 344.1 (a battlefield becoming contested opens a showdown), 459.2 (units of different
 *        players present ⇒ a combat showdown), 148.2 (standard-timing spells: your open Main Phase
 *        only), 465 (each battlefield scores at most once per turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";

/**
 * P1's turn. P2 holds bf1 with a 2-Might Defender; P1's 5-Might Vanguard is ready in base and will
 * win the first showdown there. P1 also holds Bone Skewer with exactly [2][chaos] left for it.
 * P2's hand: a 2-Might Recruit (the only unit) and a blank spell.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
    .unit(P1, "base", { might: 5, name: "Vanguard" }, "vanguard")
    .hand(P1, BONE_SKEWER, "skewer")
    .hand(P2, { cardType: "unit", energyCost: 2, might: 2, name: "Recruit" }, "recruit")
    .hand(P2, { cardType: "spell", energyCost: 1, name: "Blank Spell" }, "blank");
}

/** Run the current showdown/combat to completion. */
async function finishShowdown(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind === "action" && d.context === "showdown") {
      await game.seat(d.seat).passFocus();
      continue;
    }
    break;
  }
}

/** P1 attacks bf1 and wins the combat, conquering it and scoring 1. */
async function afterFirstShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("vanguard", "bf1");
  await finishShowdown(game);
  expect(game.zoneOf("def")).toBe("trash");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
  expect(game.p1.points()).toBe(1);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 283a2b0ed9851c6a — Bone Skewer can open a second showdown once the first one is over", () => {
  test("timing: Bone Skewer is NOT playable during the showdown (it carries neither [Action] nor [Reaction])", async () => {
    const game = await board().build();
    await game.p1.move("vanguard", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "skewer")).toBe(false);
  });

  test("…but it is playable again the moment the game is back in P1's open Main Phase", async () => {
    const game = await afterFirstShowdown();
    expect(game.p1.can("cast", "skewer")).toBe(true);
    const battlefields = (game.p1.option("cast", "skewer")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(battlefields).toEqual(["bf1"]);
  });

  test("ruling: choosing bf1 makes P2 play their Recruit there — the battlefield becomes contested and a COMBAT showdown opens", async () => {
    const game = await afterFirstShowdown();
    await game.p1.cast("skewer", { answers: ["bf1"] });
    let stop = await game.settle();
    const first = game.decision();
    if (stop.reason === "unanswered" && first?.kind === "pick" && first.options.some((o) => (o.card ?? o.key) === "bf1")) {
      await game.p1.pick("bf1");
      stop = await game.settle();
    }
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const offered = game.decision();
    expect(offered?.kind === "pick" ? offered.options.map((o) => o.card ?? o.key) : []).toEqual(["recruit"]);
    await game.p1.pick("recruit");
    expect(game.zoneOf("recruit")).toBe("battlefield-bf1");
    expect(game.state("recruit")).toMatchObject({ controller: P2, isStunned: true, owner: P2 });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // "ignoring any and all costs"
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("…and that second showdown resolves as a real combat: the 5-Might Vanguard kills the stunned Recruit and keeps bf1", async () => {
    const game = await afterFirstShowdown();
    await game.p1.cast("skewer", { answers: ["bf1"] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("recruit");
    }
    await finishShowdown(game);
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.zoneOf("skewer")).toBe("trash");
  });

  test("ruling (465): winning at bf1 a second time in the same turn scores no second point — P1 stays on 1", async () => {
    const game = await afterFirstShowdown();
    await game.p1.cast("skewer", { answers: ["bf1"] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("recruit");
    }
    await finishShowdown(game);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling 36e544a788d7d096 — Grand Duelist (SFD-205 → sfd-205-221) · Legend · Fiora
 *   "When one of your units becomes [Mighty], you may exhaust me to channel 1 rune exhausted.
 *    (A unit is Mighty while it has 5+ [Might].)"
 *   × Shen, Kinkou (OGN-241 → ogn-241-298) · [Reaction] unit · [3][order] · 3 Might · [Shield 2] [Tank]
 *
 * Q: Played at a contested battlefield he is defending, does Shen enter at 3 and then gain 2 from Shield
 *    (triggering "becomes Mighty" effects), or does he simply arrive as a 5?
 * A: He enters at 3. The Cleanup that follows gives him the defender designation, Shield then makes him
 *    a 5, and that 3 → 5 transition IS a unit "becoming Mighty". Nobody can respond in between: cleanups
 *    do not use the chain, so there is no window to burn the 3-Might Shen.
 * Rules: 464.2.c.3 (a late arrival takes its controller's designation at the Cleanup), 803/802 (Shield
 *        applies while a defender), 780 (Mighty = 5+ Might), 323 (Cleanup is not a chain step), 383.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GRAND_DUELIST = "sfd-205-221";
const RELENTLESS_STORM = "ogn-249-298"; // "When you PLAY a [Mighty] unit …" — the contrast legend
const SHEN = "ogn-241-298";

/** P2's turn. P1 holds bf1 with a Holder; P2's Raider attacks it; P1 holds Shen with [3][order]. */
function board(legend: string) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { order: 1 } })
    .legend(P1, legend, "legend")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, SHEN, "shen");
}

/** P2 attacks bf1 and passes focus; P1 answers by playing Shen into the contested battlefield. */
async function shenJoinsTheDefence(legend: string): Promise<Game> {
  const game = await board(legend).build();
  await game.p2.move("raider", "bf1");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.play("shen", { to: "bf1" });
  return game;
}

describe("Ruling 36e544a788d7d096 — Shen enters at 3 and BECOMES Mighty when Shield kicks in", () => {
  test("premise: Shen prints 3 Might with [Shield 2]; on a battlefield he is not defending he is a plain 3", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).hand(P1, SHEN, "shen").build();
    expect(game.state("shen").baseMight).toBe(3);
    await game.p1.play("shen", { to: "base" });
    expect(game.state("shen").might).toBe(3);
  });

  test("ruling 36e544a788d7d096 — played into the contested battlefield he defends: he takes the defender designation, Shield makes him a 5, and he counts as having BECOME Mighty — Fiora's trigger is offered", async () => {
    const game = await shenJoinsTheDefence(GRAND_DUELIST);
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.state("shen")).toMatchObject({ baseMight: 3, combatRole: "defender", might: 5 });
    const asked = game.decision();
    expect(asked).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(asked?.source?.cardId).toBe("legend");
  });

  test("no window in between: the 3-Might Shen is never a state anyone could have acted on — by the time either player may act he is already a 5", async () => {
    const game = await shenJoinsTheDefence(GRAND_DUELIST);
    expect(game.state("shen").might).toBe(5);
    // The only thing pending is Fiora's own optional trigger, not a priority window at 3 Might.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });

  test("paying the cost exhausts the legend and channels a rune (exhausted)", async () => {
    const game = await shenJoinsTheDefence(GRAND_DUELIST);
    await game.p1.yes();
    expect(game.state("legend").isExhausted).toBe(true);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.violations()).toEqual([]);
  });

  test("the flip side of the same timing — 'when you PLAY a Mighty unit' does NOT see him, because he was a 3 as he was played", async () => {
    const game = await shenJoinsTheDefence(RELENTLESS_STORM);
    expect(game.state("shen").might).toBe(5);
    expect(game.chain().some((c) => c.cardId === "legend")).toBe(false);
    expect(game.decision()).not.toMatchObject({ kind: "yes-no", source: { cardId: "legend" } });
    await game.settle();
    expect(game.p1.runes()).toHaveLength(0);
  });
});

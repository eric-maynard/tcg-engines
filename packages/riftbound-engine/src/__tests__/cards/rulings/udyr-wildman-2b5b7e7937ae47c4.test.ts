/**
 * Ruling 2b5b7e7937ae47c4 — Udyr, Wildman (OGN-157 → ogn-157-298) · Body champion · [6][body] · 6 Might
 *   "Spend my buff: Choose one you've not chosen this turn — Deal 2 to a unit at a battlefield. / Stun a unit
 *    at a battlefield. / Ready me. / Give me [Ganking] this turn."
 *
 * Q: Can Udyr's buff be spent to stun a unit at ANOTHER battlefield?
 * A: Yes. The mode says "a unit at a battlefield", not "here", so any unit at any battlefield is a legal
 *    choice. Units in a base are still not legal (they are not "at a battlefield").
 * Rules: 355.8 / target descriptors (location "battlefield" is any battlefield), 410.1 (stun).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UDYR = "ogn-157-298";

/** P1's turn, open main phase. Udyr (buffed) holds bf1; P2 has a Rival at bf2 and a Reserve in their base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", UDYR, "udyr", { buffed: true })
    .unit(P2, "bf2", { might: 4, name: "Rival" }, "rival")
    .unit(P2, "base", { might: 4, name: "Reserve" }, "reserve");
}

const options = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : ["<not a pick>"]);

/** Activate the spend-buff ability and choose the "Stun" mode. */
async function stunMode(): Promise<Game> {
  const game = await board().build();
  expect(game.state("udyr").isBuffed).toBe(true);
  await game.p1.activate("udyr", 0);
  await game.settle({ maxSteps: 4 });
  const mode = game.decision();
  expect(mode).toMatchObject({ kind: "pick", seat: P1 });
  const stun = mode?.kind === "pick" ? mode.options.findIndex((o) => /stun/i.test(o.label)) : -1;
  expect(stun).toBeGreaterThanOrEqual(0);
  await game.p1.chooseMode(stun);
  return game;
}

describe("Ruling 2b5b7e7937ae47c4 — Udyr's stun mode reaches any battlefield, not just his own", () => {
  test("the target prompt offers the enemy at the OTHER battlefield (and Udyr himself, who is also at a battlefield) but never the unit in a base", async () => {
    const game = await stunMode();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(options(d)).toContain("rival"); // at bf2, a different battlefield
    expect(options(d)).not.toContain("reserve"); // in a base — not "at a battlefield"
  });

  test("ruling: the stun lands on the unit at the other battlefield, and the buff is spent", async () => {
    const game = await stunMode();
    await game.p1.pick("rival");
    await game.settle();
    expect(game.state("rival").isStunned).toBe(true);
    expect(game.state("udyr").isBuffed).toBe(false); // spent as the cost
    expect(game.state("reserve").isStunned).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("without a buff the ability cannot be activated at all", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", UDYR, "udyr")
      .unit(P2, "bf2", { might: 4, name: "Rival" }, "rival")
      .build();
    expect(game.state("udyr").isBuffed).toBe(false);
    expect((await game.p1.try((p) => p.activate("udyr", 0))).ok).toBe(false);
  });
});

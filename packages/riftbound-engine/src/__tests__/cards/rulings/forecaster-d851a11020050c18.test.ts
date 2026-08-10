/**
 * Ruling d851a11020050c18 — Forecaster (SFD-065 → sfd-065-221) · Unit · Mind · 2 · 2 Might · Mech
 *     "Your Mechs have [Vision]. (When you play us, look at the top card of your Main Deck. You may recycle it.)"
 *   (Rumble, Hotheaded sfd-026-221 is listed as another "your Mechs have …" card — context only.)
 *
 * Q: Does Forecaster benefit from its own ability?
 * A: Yes. The grant is a passive that includes Forecaster itself (it is a Mech), so playing Forecaster — even alone —
 *    triggers its own Vision: look at the top card, optionally recycle it.
 * Rules: 363 (a passive "your Mechs have …" applies to every Mech you control, including its source), 817 (Vision is a
 *        play trigger: predict — look at the top card, may recycle), 436 (recycle → bottom of the deck).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORECASTER = "sfd-065-221";
const FILLER = "ogn-175-298";

/** P1's turn: Forecaster in hand, exactly 2 energy, no other Mechs anywhere; deck = [top, second, third]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .hand(P1, FORECASTER, "fc")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
    .deck(P1, [FILLER, FILLER, FILLER], ["top", "second", "third"]);
}

/** Play Forecaster and settle to its Vision look (P1's pick over the top card). */
async function playToLook(): Promise<{ game: Game; look: PickDecision }> {
  const game = await board().build();
  await game.p1.play("fc", { to: "base" });
  expect(game.zoneOf("fc")).toBe("base");
  expect(game.p1.energy()).toBe(0);
  const s = await game.settle();
  expect(s.reason).toBe("unanswered");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return { game, look: d as PickDecision };
}

describe("Ruling d851a11020050c18 — Forecaster's own Vision fires when Forecaster itself is played", () => {
  test("Forecaster is a Mech and, once on the board, carries the Vision its own passive grants", async () => {
    const { game } = await playToLook();
    expect(game.state("fc").cardType).toBe("unit");
    expect(game.state("fc").keywords).toContain("Vision");
  });

  test("played ALONE (no other Mech in play) it still triggers: a Vision item for Forecaster hits the chain and P1 is shown exactly the top card of their deck, with the option to decline", async () => {
    const game = await board().build();
    await game.p1.play("fc", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fc", controller: P1, triggered: true })]);
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    const look = game.decision() as PickDecision;
    expect(look).toMatchObject({ kind: "pick", seat: P1 });
    expect(look.options.map((o) => o.card ?? o.key)).toEqual(["top"]);
    expect(look.allowDecline).toBe(true); // "you MAY recycle it"
  });

  test("'you may recycle it' — accepting sends the top card to the bottom (second is now on top); nothing is drawn", async () => {
    const { game, look } = await playToLook();
    await game.p1.pick(look.options[0]?.key as string);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("second");
    expect(game.p1.deck().at(-1)).toBe("top");
    expect(game.p1.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("declining leaves the deck as it was (top still on top)", async () => {
    const { game } = await playToLook();
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck().slice(0, 3)).toEqual(["top", "second", "third"]);
    expect(game.p1.hand()).toEqual([]);
  });
});

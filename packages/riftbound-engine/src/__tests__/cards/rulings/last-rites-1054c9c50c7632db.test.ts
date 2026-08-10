/**
 * Ruling 1054c9c50c7632db — Last Rites (SFD-150 → sfd-150-221) · Equipment · Chaos · +2
 *     "[Equip] — [chaos], Recycle 2 cards from your trash. When I conquer or hold, you may play a unit from your trash. (You still pay its costs.)"
 *   × Teemo, Scout (ogn-197-298) · [2] · 1 Might · "[Hidden] When you play me, give me +3 [Might] this turn." — a hideable unit in the trash
 *
 * Q: If I conquer with Last Rites, can I HIDE a unit directly from my trash?
 * A: No. Hiding (421) requires the card to be in your hand or Champion Zone (421.2.a). Last Rites only grants permission to PLAY a unit from
 *    the trash — a different game action; the trash is a non-board zone and can't source a Hide.
 * Rules: 421 / 421.2.a (Hide: from hand or Champion Zone), 419 (play from a non-hand zone via an effect; costs still paid).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAST_RITES = "sfd-150-221";
const TEEMO_SCOUT = "ogn-197-298";

/** P1's turn. Bearer (3, wearing Last Rites → 5) ready in base; bf1 open; Teemo in P1's trash; P1 has [2] + a spare [rainbow] a Hide would use. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
    .unit(P1, "base", { might: 3, name: "Bearer" }, "bearer", { equippedWith: ["rites"] })
    .card("rites", { def: LAST_RITES, meta: { attachedTo: "bearer" }, owner: P1, zone: "base" })
    .trash(P1, TEEMO_SCOUT, "teemo");
}

const hideOffered = (game: Game) => game.p1.legal().some((o) => o.verb === "hide" || o.moveId === "hideCard");

/** Bearer walks onto the open bf1; both pass focus; P1 conquers. Stops at Last Rites' "you may play a unit from your trash". */
async function conquer(game: Game): Promise<void> {
  await game.p1.move("bearer", "bf1");
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "showdown") {
      break;
    }
    expect(hideOffered(game)).toBe(false);
    await game.seat(d.seat).pass();
  }
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "bearer" } });
}

describe("Ruling 1054c9c50c7632db — Last Rites lets you PLAY from the trash, never Hide from it", () => {
  test("at the conquer trigger (and throughout) no Hide action exists for the trashed Teemo; forcing hide('teemo') is rejected — the trash can't source a Hide (421.2.a)", async () => {
    const game = await board().build();
    expect(hideOffered(game)).toBe(false);
    expect((await game.p1.try((p) => p.hide("teemo", "bf1"))).ok).toBe(false);
    await conquer(game);
    expect(hideOffered(game)).toBe(false);
    expect((await game.p1.try((p) => p.hide("teemo", "bf1"))).ok).toBe(false);
    expect(game.zoneOf("teemo")).toBe("trash");
  });

  test("what it DOES allow: 'yes' plays Teemo from the trash face up, paying his [2]; he never becomes a facedown card and the [rainbow] a Hide would have cost is untouched", async () => {
    const game = await board().build();
    await conquer(game);
    await game.p1.yes();
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      expect(hideOffered(game)).toBe(false);
      if (d.kind === "pick" && d.seat === P1) {
        const teemo = d.options.find((o) => (o.card ?? o.key) === "teemo");
        const base = d.options.find((o) => o.key === "base" || /base/i.test(o.label));
        await game.p1.pick(teemo ? "teemo" : base ? base.key : d.options[0]!.key);
      } else if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.p1.units()).toContain("teemo");
    expect(game.state("teemo")).toMatchObject({ controller: P1, isHidden: false });
    expect(game.zoneOf("teemo")).not.toMatch(/^facedown-/);
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.state("teemo").might).toBe(4); // "When you play me" fired — it was a PLAY
    expect(game.violations()).toEqual([]);
  });

  test("control: the Hide action needs the card in HAND — the same Teemo in hand can be hidden at a controlled battlefield for [rainbow]", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Bearer" }, "bearer")
      .hand(P1, TEEMO_SCOUT, "teemo")
      .build();
    expect(game.p1.can("hide", "teemo")).toBe(true);
    await game.p1.hide("teemo", "bf1");
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.p1.power()).toBe(0);
  });
});

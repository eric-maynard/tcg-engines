/**
 * Ruling 0684ebd33dd980a2 — Last Rites (SFD-150 → sfd-150-221) · Equipment · Chaos · +2
 *     "[Equip] — [chaos], Recycle 2 cards from your trash. When I conquer or hold, you may play a unit from your trash. (You still pay its costs.)"
 *   × Teemo, Scout (OGN-197 → ogn-197-298) · [2] · 1 Might · "[Hidden] When you play me, give me +3 [Might] this turn."
 *
 * Q: When I conquer with Last Rites, can I HIDE Teemo from my trash instead of playing him?
 * A: No. Last Rites lets you PLAY a unit from your trash; Hiding is a different action that needs the card in your hand (or
 *    Champion zone) and a battlefield you control. From the trash Teemo can only be played, face up, paying his cost.
 * Rules: 419 (play from a non-hand zone by effect), 421.2.a (Hide: from hand/champion zone only), Last Rites text ("play").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAST_RITES = "sfd-150-221";
const TEEMO_SCOUT = "ogn-197-298";

/**
 * P1's turn. P1's Bearer (3, wearing Last Rites → 5) ready in base; bf1 open; Teemo, Scout in P1's trash; P1 has [2] (Teemo's cost)
 * plus a [chaos] it could have used to Hide. P2 holds bf2.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
    .unit(P1, "base", { might: 3, name: "Bearer" }, "bearer", { equippedWith: ["rites"] })
    .card("rites", { def: LAST_RITES, meta: { attachedTo: "bearer" }, owner: P1, zone: "base" })
    .trash(P1, TEEMO_SCOUT, "teemo");
}

const hideOffered = (game: Game) => game.p1.legal().some((o) => o.verb === "hide" || o.moveId === "hideCard");

/** Bearer walks onto open bf1 and the showdown closes: P1 conquers; stop at Last Rites' "you may". */
async function conquerBf1(game: Game): Promise<void> {
  expect(game.state("bearer").might).toBe(5);
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
  // 718.3 — the Effect Text ability is appended to the top-most card, so the Bearer is the trigger's source.
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "bearer" } });
}

describe("Ruling 0684ebd33dd980a2 — Last Rites PLAYS a unit from the trash; you can't Hide Teemo from there", () => {
  test("conquering with the Last Rites bearer offers 'you may play a unit from your trash' — a yes/no to PLAY; no Hide action is offered at any point", async () => {
    const game = await board().build();
    expect(hideOffered(game)).toBe(false); // Teemo is in the trash, not in hand: nothing to hide even in the open main phase
    await conquerBf1(game);
    expect(hideOffered(game)).toBe(false);
    expect((await game.p1.try((p) => p.hide("teemo", "bf1"))).ok).toBe(false);
  });

  test("accepting plays Teemo from the trash FACE UP as a unit, paying his [2]; he is never a facedown card and the [chaos] a Hide would cost is untouched", async () => {
    const game = await board().build();
    await conquerBf1(game);
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
    expect(game.p1.trash()).not.toContain("teemo");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 1 } }); // paid [2] to PLAY; the Hide [rainbow] was never an option
    expect(game.state("teemo").might).toBe(4); // his "when you play me" fired: he was PLAYED
    expect(game.violations()).toEqual([]);
  });

  test("control: Hiding is a hand action — the same Teemo in HAND can be hidden at the newly controlled bf1 for a power", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Bearer" }, "bearer")
      .hand(P1, TEEMO_SCOUT, "teemo")
      .build();
    expect(game.p1.can("hide", "teemo")).toBe(true);
    await game.p1.hide("teemo", "bf1");
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.p1.power("chaos")).toBe(0);
  });
});

/**
 * Ruling 7005313c17c6336f — LeBlanc, Everywhere at Once (UNL-090 → unl-090-219) · Champion Unit · Mind · 4 · 4 Might
 *   "[Backline] Your [Temporary] effects at my battlefield don't trigger."
 *   × Sprite token (ogn-274-298) · 3 Might · [Temporary] "(Kill me at the start of my controller's Beginning Phase.)"
 *   (+ an inline [Reaction] "Shadow Step — Move a friendly unit in your base." to bring LeBlanc to the battlefield while
 *    the Temporary trigger is already on the chain — LeBlanc herself has no Reaction/Ambush timing.)
 *
 * Q: Does getting LeBlanc to the battlefield in response to the [Temporary] trigger stop the Temporary units from dying?
 * A: No. Temporary is a triggered ability; once it has triggered at the start of the Beginning Phase and sits on the
 *    chain, LeBlanc's passive (which stops the TRIGGERING) does not remove it — it resolves and kills the unit. She only
 *    helps if she is already at that battlefield before the Beginning Phase starts (then it never triggers).
 * Rules: 816 (Temporary is a triggered kill at start of Beginning Phase), 383 (a pending trigger resolves regardless of
 *        later changes to whether it could trigger), 186.1 (a killed token ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEBLANC_EAO = "unl-090-219";
const SPRITE_TOKEN = "ogn-274-298";

const SHADOW_STEP = {
  abilities: [
    {
      effect: { target: { controller: "friendly", location: "base", type: "unit" }, to: "choose", type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  energyCost: 0,
  name: "Shadow Step",
  rulesText: "[Reaction] Move a friendly unit in your base.",
  timing: "reaction",
};

/** End of P2's turn 2. P1 holds bf1 with a [Temporary] Sprite token + Holder (2); LeBlanc is at `lbAt`; Shadow Step in hand. */
function board(lbAt: "bf1" | "base") {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SPRITE_TOKEN, "sprite")
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, lbAt, LEBLANC_EAO, "lb")
    .hand(P1, SHADOW_STEP, "step");
}

/** P2 ends the turn → P1's Beginning Phase starts. */
async function intoP1Beginning(lbAt: "bf1" | "base"): Promise<Game> {
  const game = await board(lbAt).build();
  expect(game.state("sprite")).toMatchObject({ isToken: true, zone: "battlefield-bf1" });
  expect(game.state("sprite").keywords).toContain("Temporary");
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  return game;
}

describe("Ruling 7005313c17c6336f — LeBlanc stops Temporary from TRIGGERING, not an already-pending Temporary trigger", () => {
  test("LeBlanc already at the battlefield before the Beginning Phase: the Sprite's [Temporary] never triggers — no chain item, the Sprite survives into P1's main phase (and P1 holds bf1)", async () => {
    const game = await intoP1Beginning("bf1");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(1); // held bf1
    expect(game.violations()).toEqual([]);
  });

  test("LeBlanc NOT there (in base) when the Beginning Phase starts: the [Temporary] kill IS triggered and sits on the chain as a pending item, with P1 holding priority", async () => {
    const game = await intoP1Beginning("base");
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("bringing LeBlanc to bf1 in response (Reaction resolves first, LIFO — she is now AT the Sprite's battlefield) does NOT remove the pending trigger: it still resolves and the Sprite dies (token ceases to exist)", async () => {
    const game = await intoP1Beginning("base");
    await game.p1.cast("step", { targets: "lb" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sprite", "step"]);
    // Resolve Shadow Step only.
    for (let i = 0; i < 6 && game.chain().length > 1; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("battlefield-bf1");
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf1");
    }
    expect(game.locationOf("lb")).toBe("bf1"); // LeBlanc is now at the Sprite's battlefield …
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sprite", triggered: true })]); // … but the trigger is still there
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
    await game.settle();
    expect(game.has("sprite") ? game.zoneOf("sprite") : "gone").toBe("gone");
    expect(game.p1.units("bf1").sort()).toEqual(["holder", "lb"]);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });
});

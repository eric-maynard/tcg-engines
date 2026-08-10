/**
 * Ruling 3d7c0453430e84b5 — Fresh Beans (UNL-011 → unl-011-219) · Gear · Fury · [2]
 *   "When you play a unit during a showdown, you may exhaust this to draw 1."
 *   × Void Burrower (sfd-187-221, Rek'Sai legend) "When you conquer, you may exhaust me to reveal the top 2 cards of your
 *     Main Deck. You may banish one, then play it. Recycle the rest."
 *   × Rek'Sai, Swarm Queen (sfd-170-221) "When I attack, you may reveal the top 2 … banish one, then play it …" (contrast).
 *
 * Q: Can I use the Rek'Sai conquer trigger to play a unit and draw from Fresh Beans?
 * A: No. Conquer triggers resolve in the Resolution Step, after the combat showdown has already closed, so the unit is not
 *    "played during a showdown" and Fresh Beans does not trigger.
 * Rules: 463/466–469 (steps of combat: the showdown closes before damage and resolution/conquer), 383 (trigger conditions).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FRESH_BEANS = "unl-011-219";
const VOID_BURROWER = "sfd-187-221";
const REKSAI_SWARM_QUEEN = "sfd-170-221";
const SKULKER = "ogn-175-298"; // vanilla [3] 3-Might unit — the card revealed and played

const showdown = (game: Game) => game.gameState.interaction?.showdownStack ?? [];

/** Walk the reveal-and-play: pick the top Skulker, play it to base; report whether a Fresh Beans prompt was ever seen. */
async function playRevealedSkulker(game: Game): Promise<{ beansAsked: boolean; showdownOpenAtPlay: boolean | undefined }> {
  let beansAsked = false;
  let showdownOpenAtPlay: boolean | undefined;
  for (let i = 0; i < 20; i++) {
    const d: Decision | null = game.decision();
    if (!d || (d.kind === "action" && d.context !== "chain")) {
      break;
    }
    if (d.kind === "yes-no") {
      if (d.source?.cardId === "beans") {
        beansAsked = true;
      }
      await game.seat(d.seat).yes();
    } else if (d.kind === "pick" && d.source?.pendingChoiceType === "reveal-and-pick") {
      expect(d.seat).toBe(P1);
      expect(d.options.map((o) => o.key)).toEqual(["top", "second"]);
      await game.p1.pick("top");
    } else if (d.kind === "pick" && d.source?.pendingChoiceType === "choose-destination") {
      showdownOpenAtPlay = showdown(game).some((s) => s.active);
      await game.p1.pick("base");
    } else if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  return { beansAsked, showdownOpenAtPlay };
}

describe("Ruling 3d7c0453430e84b5 — a unit played by a CONQUER trigger is not played 'during a showdown'", () => {
  test("Void Burrower: the Attacker wins the combat, the showdown closes, THEN the conquer trigger reveals and plays the Skulker — no showdown is open at that moment, Fresh Beans never asks and stays ready, no card drawn", async () => {
    const game = await scenario()
      .legend(P1, VOID_BURROWER, "burrower")
      .gear(P1, FRESH_BEANS, "beans")
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Blocker" }, "blocker")
      .unit(P1, "base", { might: 5, name: "Attacker" }, "attacker")
      .deck(P1, [SKULKER, SKULKER, SKULKER], ["top", "second", "third"])
      .build();
    await game.p1.move("attacker", "bf1");
    const r = await game.settle(); // both pass Focus → combat damage → Blocker dies → conquer
    expect(r.reason).toBe("unanswered");
    // The conquer trigger's opt-in ("exhaust me") is asked with the combat already over.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "burrower", pendingChoiceType: "opt-in" } });
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(showdown(game).some((s) => s.active)).toBe(false); // showdown closed before the Resolution Step
    const seen = await playRevealedSkulker(game);
    expect(game.state("burrower").isExhausted).toBe(true); // cost paid
    expect(game.zoneOf("top")).toBe("base"); // the revealed Skulker was played (full price)
    expect(game.p1.energy()).toBe(0);
    expect(seen.showdownOpenAtPlay).toBe(false);
    expect(seen.beansAsked).toBe(false);
    expect(game.state("beans").isExhausted).toBe(false);
    expect(game.p1.hand()).toEqual([]); // nothing drawn ("second" was recycled)
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Rek'Sai, Swarm Queen's ATTACK trigger plays the Skulker while the combat showdown is still open: Fresh Beans DOES trigger (opt-in for P1), exhausts and draws 1", async () => {
    const game = await scenario()
      .gear(P1, FRESH_BEANS, "beans")
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", REKSAI_SWARM_QUEEN, "reksai")
      .deck(P1, [SKULKER, SKULKER, SKULKER], ["top", "second", "third"])
      .build();
    await game.p1.move("reksai", "bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "reksai", pendingChoiceType: "opt-in" } });
    const seen = await playRevealedSkulker(game);
    expect(seen.showdownOpenAtPlay).toBe(true);
    expect(seen.beansAsked).toBe(true);
    expect(game.zoneOf("top")).toBe("base");
    expect(game.state("beans").isExhausted).toBe(true);
    expect(game.p1.hand()).toEqual(["third"]); // "second" recycled, then Beans drew the next card
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // still in the showdown
  });
});

/**
 * Ruling 05d7e1981d26ef66 — (Miss Fortune, Buccaneer · OGN-193 → ogn-193-298 · Chaos · [4][chaos] · 4 Might
 *     "You may play me to an open battlefield. Friendly units may be played to open battlefields.")
 *   × Void Seeker (ogn-024-298) "[Action] Deal 4 to a unit at a battlefield. Draw 1." as the opponent's removal
 *   × Teemo, Scout (ogn-197-298) "[Hidden] …" for the play-vs-hide nuance.
 *
 * Q: Does Miss Fortune give you a point when you play her to an open battlefield?
 * A: Not immediately. Playing her there applies Contested and starts a showdown (you attack, with Focus and priority). If everyone
 *    passes she is the only unit there → you conquer and score 1. If instead the opponent removes her during the showdown, no
 *    attacking unit remains → no conquer, no point. Nuance: with her out you may PLAY Hidden units to open battlefields as units,
 *    but you still can't HIDE a card at a battlefield you don't control.
 * Rules: 190.3 / 344–345 (Contested → showdown, contester has Focus), 348.2.a (non-combat close: sole occupant conquers), 467/471
 *        (conquer scores), 421.2 (Hide only at a battlefield you control).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MISS_FORTUNE = "ogn-193-298";
const VOID_SEEKER = "ogn-024-298";
const TEEMO_SCOUT = "ogn-197-298";

/** P1's turn with [4][chaos]; bf1 open; P2 holds bf2 with a Watch and has Void Seeker + [3][fury]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .resources(P2, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
    .hand(P1, MISS_FORTUNE, "mf")
    .hand(P2, VOID_SEEKER, "vs");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

async function playMfToBf1(game: Game): Promise<void> {
  const to = game.p1.option("play", "mf")?.fields.find((f) => f.arg === "to")?.options ?? [];
  expect(to).toContain("battlefield-bf1"); // "You may play me to an open battlefield"
  await game.p1.play("mf", { to: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.zoneOf("mf")).toBe("battlefield-bf1");
}

describe("Ruling 05d7e1981d26ef66 — Miss Fortune to an open battlefield scores only by conquering through the showdown", () => {
  test("on the play: NO point yet — bf1 is Contested by P1 and a (non-combat) showdown has begun with P1 as attacker holding Focus and priority", async () => {
    const game = await board().build();
    await playMfToBf1(game);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("everyone passes: at the showdown's close Miss Fortune is the only unit there → P1 conquers bf1 and scores 1", async () => {
    const game = await board().build();
    await playMfToBf1(game);
    await game.p1.passFocus();
    await game.p2.passFocus();
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("if instead P2 (with Focus) Void Seekers her during the showdown: she dies, no attacking unit remains → no conquer, no point, bf1 stays uncontrolled", async () => {
    const game = await board().build();
    await playMfToBf1(game);
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "vs")).toBe(true);
    await game.p2.cast("vs", { targets: "mf" });
    await game.settle();
    expect(game.zoneOf("mf")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: null });
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: with Miss Fortune on the board a Hidden unit (Teemo) may be PLAYED to an open battlefield as a unit — but it can't be HIDDEN there (not a battlefield you control)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", MISS_FORTUNE, "mf")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, TEEMO_SCOUT, "teemo")
      .build();
    const playTo = (game.p1.option("play", "teemo")?.fields.find((f) => f.arg === "to")?.options ?? []) as string[];
    expect(playTo).toContain("battlefield-bf1"); // "Friendly units may be played to open battlefields"
    // Hiding: bf2 (controlled) is fine, open bf1 is not.
    expect((await game.p1.try((p) => p.hide("teemo", "bf1"))).ok).toBe(false);
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p1.can("hide", "teemo")).toBe(true); // …at bf2
    await game.p1.play("teemo", { to: "bf1" });
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.state("teemo").isHidden).toBe(false); // played face up, as a unit
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
  });
});

/**
 * Ruling d06969c7bc59f38c — Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   × Charm (OGN-043 → ogn-043-298) · Spell · Calm · 1 · "Move an enemy unit."
 *   (unl-060-219 Vilemaw the unit is listed by the scrape; the question is about the Lair.)
 *
 * Q: Can a unit WITHOUT Ganking sitting at Vilemaw's Lair be Charmed to another battlefield?
 * A: Yes. Ganking only concerns the Standard Move; Charm's move is an effect. The Lair forbids only moves from it TO BASE —
 *    battlefield-to-battlefield is fine. You may even Charm the unit "to base": the spell is legal to play but that move is
 *    prohibited, so it resolves doing nothing.
 * Rules: 141/144 (Standard Move & Ganking), 446–447 (move effects), 105 ("can't" beats "can").
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VILEMAWS_LAIR = "ogn-295-298";
const CHARM = "ogn-043-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P1's turn with exactly [1][calm] + Charm. P2's Ganking-less Spider (3) sits at Vilemaw's Lair (P2's); bf2 is open. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: false })
    .battlefield("bf2", { controller: null })
    .unit(P2, "lair", { might: 3, name: "Spider" }, "spider")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "homebody")
    .hand(P1, CHARM, "charm");
}

/** Cast Charm on the Spider and settle to the destination prompt. */
async function charmSpider(): Promise<{ game: Game; dest: PickD }> {
  const game = await board().build();
  expect(game.state("spider").keywords).not.toContain("Ganking");
  expect(game.state("spider").keywords).toContain("NoMoveToBase"); // the Lair's restriction is live
  expect(game.p1.can("cast", "charm")).toBe(true);
  await game.p1.cast("charm", { targets: "spider" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  return { dest: d as PickD, game };
}

describe("Ruling d06969c7bc59f38c — a non-Ganking unit at Vilemaw's Lair can be Charmed to another battlefield", () => {
  test("Charm targets the Spider at the Lair and offers the other battlefield as a destination (no Ganking needed for an effect-move)", async () => {
    const { dest } = await charmSpider();
    expect(dest.options.map((o) => o.key)).toContain("battlefield-bf2");
  });

  test("picking bf2: the Spider moves Lair → bf2; Charm to trash", async () => {
    const { game } = await charmSpider();
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("spider")).toBe("bf2");
    expect(game.p2.units("lair")).toEqual([]);
    // Arriving alone at the open bf2 starts a (non-combat) showdown for the Spider's controller; let it close.
    for (let i = 0; i < 3 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context !== "main"; i++) {
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("spider")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("nuance: Charm 'to base' is castable on the Lair unit, but the Lair prohibits that move — the spell resolves with no effect and the Spider stays at the Lair", async () => {
    const { dest, game } = await charmSpider();
    if (dest.options.some((o) => o.key === "base")) {
      await game.p1.pick("base");
      await game.settle();
      expect(game.zoneOf("spider")).toBe("battlefield-lair");
    } else {
      // Equally faithful: the prohibited destination is simply not offered; the spell was still legally played.
      expect(dest.options.map((o) => o.key)).toEqual(["battlefield-bf2"]);
      await game.p1.pick("battlefield-bf2");
      await game.settle();
    }
    expect(game.zoneOf("charm")).toBe("trash"); // played and resolved either way — no refund
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("contrast: the same Spider cannot make that trip by a Standard Move (no Ganking) nor walk home (the Lair) — only effects move it", async () => {
    const game = await board().active(P2).build();
    expect(game.p2.can("gank", "spider")).toBe(false);
    expect(game.p2.legal().some((o) => (o.verb === "move" || o.verb === "gank" || o.verb === "recall") && (o.card === "spider" || JSON.stringify(o.variants).includes("spider")))).toBe(false);
  });
});

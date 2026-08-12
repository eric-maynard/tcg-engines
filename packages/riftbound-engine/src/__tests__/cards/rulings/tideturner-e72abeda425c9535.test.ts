/**
 * Ruling e72abeda425c9535 — Tideturner (OGN-199 → ogn-199-298) · [2] 2 [Might], [Hidden]
 *   "When you play me, you may choose a unit you control at another location. Move me to its location and it to my
 *    original location."
 *
 * Q: Can I play a hidden card at Battlefield 1 while a showdown is happening at Battlefield 2?
 * A: Yes. Playing from hidden is a Reaction, so it works in any priority window regardless of where the showdown
 *    is. The card lands at the battlefield where it was HIDDEN (bf1), and a hidden card that targets is normally
 *    locked to that battlefield — Tideturner's own text is the override that reaches another location.
 * Rules: 811.1.c.3 (playing from hidden opens a chain / is a Reaction), 811.1.d.2 (targets must be where it was
 *        hidden), 355.2.a (permanents arrive at the hiding battlefield), FAQ #2813 / #7354.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";

/** A hidden, non-targeting Reaction — the ruling's "if the card does not target" case. */
const INSIGHT = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  keywords: ["Hidden"],
  name: "Insight",
  timing: "reaction",
} as const;

/**
 * P1's turn. P1 holds bf1 (with a Holder and the facedown Tideturner) and sends a Raider into P2's bf2, opening a
 * showdown THERE.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 1, name: "Reserve" }, "reserve") // a second swap candidate, so the choice is real
    .unit(P2, "bf2", { might: 3, name: "Defender" }, "def")
    .facedown(P1, "bf1", TIDETURNER, "tide");
}

/** Open the bf2 showdown, leaving P1 with Focus and two facedown cards waiting at bf1. */
async function showdownAtBf2(): Promise<Game> {
  const game = await board().build();
  expect(game.zoneOf("tide")).toBe("facedown-bf1");
  await game.p1.move("raider", "bf2");
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
  expect(game.gameState.battlefields.bf2?.contested).toBe(true);
  expect(game.gameState.battlefields.bf1?.contested).toBeFalsy();
  return game;
}

describe("Ruling e72abeda425c9535 — a card hidden at bf1 is playable during a showdown at bf2", () => {
  test("the hidden Tideturner is on P1's menu while the OTHER battlefield is in a showdown", async () => {
    const game = await showdownAtBf2();
    expect(game.p1.can("reveal", "tide")).toBe(true);
    expect(game.p1.legal().map((o) => o.key)).toContain("revealHidden:tide");
  });

  test("it arrives at bf1 — the battlefield it was hidden at — not at the battlefield in combat", async () => {
    const game = await showdownAtBf2();
    await game.p1.reveal("tide");
    expect(game.locationOf("tide")).toBe("bf1");
    expect(game.zoneOf("tide")).toBe("battlefield-bf1");
  });

  test("Tideturner's own text is the override: its swap partner may sit at ANOTHER location, including the showdown", async () => {
    const game = await showdownAtBf2();
    await game.p1.reveal("tide");
    expect(game.decision()).toMatchObject({ seat: P1, timing: "FIN" });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const partners = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(partners).toContain("raider"); // at bf2, the showdown battlefield
    expect(partners).not.toContain("holder"); // same location as Tideturner — "another location" only
    await game.p1.pick("raider");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("tide")).toBe("bf2"); // swapped INTO the showdown battlefield
    expect(game.locationOf("raider")).toBe("bf1"); // and the Raider took Tideturner's place at bf1
    expect(game.violations()).toEqual([]);
  });

  test("a hidden card that does NOT target plays from bf1 during the bf2 showdown with no restriction at all", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
      .unit(P2, "bf2", { might: 3, name: "Defender" }, "def")
      .facedown(P1, "bf1", INSIGHT, "insight")
      .build();
    await game.p1.move("raider", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    const hand0 = game.p1.hand().length;
    await game.p1.reveal("insight");
    await game.settle();
    expect(game.p1.hand().length).toBeGreaterThan(hand0);
    expect(game.zoneOf("insight")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});

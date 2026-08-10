/**
 * Ruling d337f73665e7255d — The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield
 *   "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   × Qiyana, Victorious (OGN-155 → ogn-155-298) · Unit · 4 · [Deflect] — "When I conquer, draw 1 or channel 1 rune exhausted."
 *   (+ Discipline ogn-058-298 "Give a unit +2 [Might] this turn. Draw 1.", Defy ogn-045-298, Ride the Wind ogn-173-298
 *    "Move a friendly unit and ready it." as concrete spells.)
 *
 * Q: When are checks and choices made — when a card/ability is added to the chain, or on resolution?
 * A: Trigger conditions are checked when the ability would be added. NECESSARY choices (targets, movement destinations,
 *    additional costs) are made when the item is finalized onto the chain; a targeting-triggered ability like Dreaming
 *    Tree goes on the chain immediately after the targeting, resolves before the spell, and stands even if the spell is
 *    later countered. NON-necessary choices (e.g. Qiyana's draw-or-channel mode) are made on resolution.
 * Rules: 355 (finalize: targets/destinations/costs), 383 (trigger checks), Qiyana's modal effect at resolution, LIFO.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";
const QIYANA_VICTORIOUS = "ogn-155-298";
const DISCIPLINE = "ogn-058-298";
const DEFY = "ogn-045-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. bf1 IS The Dreaming Tree (live), held by P1 with Dreamer (3). P1: Discipline + [2]. P2: Defy + [1][calm]. */
function treeBoard() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1, def: DREAMING_TREE, inert: false })
    .unit(P1, "bf1", { might: 3, name: "Dreamer" }, "dreamer")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, DEFY, "defy");
}

/** Discipline at the Dreamer: the Tree's draw trigger lands on top; both pass once → the trigger resolves (P1 draws). */
async function disciplineDreamerTreeResolves(): Promise<Game> {
  const game = await treeBoard().build();
  const hand = game.p1.hand().length;
  await game.p1.cast("disc", { targets: "dreamer" });
  expect(game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`)).toEqual(["disc", "bf1*"]); // trigger immediately above the spell
  expect(game.p1.hand()).toHaveLength(hand - 1);
  await game.p1.passPriority();
  await game.p2.passPriority(); // the Tree's trigger resolves first
  expect(game.p1.hand()).toHaveLength(hand); // drew 1
  expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
  expect(game.state("dreamer").might).toBe(3); // Discipline still waiting
  return game;
}

describe("Ruling d337f73665e7255d — what is decided at finalization vs. at resolution", () => {
  test("Dreaming Tree: choosing the friendly Dreamer with Discipline puts the draw trigger on the chain right away, ABOVE the spell, and it resolves (draw 1) before Discipline does", async () => {
    const game = await disciplineDreamerTreeResolves();
    await game.p1.passPriority();
    await game.p2.passPriority(); // now Discipline: +2 and draw 1 more
    expect(game.chain()).toEqual([]);
    expect(game.state("dreamer").might).toBe(5);
    expect(game.zoneOf("disc")).toBe("trash");
  });

  test("…and the draw stands even if the spell is then countered: P2 Defies Discipline after the Tree resolved — Dreamer gets no +2, but P1 keeps the Tree's card", async () => {
    const game = await disciplineDreamerTreeResolves();
    const handAfterTree = game.p1.hand().length;
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "disc" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Defy resolves, countering Discipline
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("dreamer").might).toBe(3);
    expect(game.p1.hand()).toHaveLength(handAfterTree); // Tree draw kept; Discipline's own draw never happened
  });

  test("necessary choices at finalization: Ride the Wind asks BOTH its unit and its destination before anyone gets priority; the item then resolves to exactly that battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 3, name: "Mover" }, "mover", { exhausted: true })
      .hand(P1, RIDE_THE_WIND, "rtw")
      .build();
    await game.p1.cast("rtw", { targets: "mover" });
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" }); // asked now, not on resolution
    expect(dest?.kind === "pick" ? dest.options.map((o) => o.key).toSorted() : []).toEqual(["battlefield-bf1", "battlefield-bf2"]);
    await game.p1.pick("battlefield-bf2");
    // Only after the destination is locked does the priority window open.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", targets: ["mover"] })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind).not.toBe("pick"); // nothing more to choose at resolution
    expect(game.locationOf("mover")).toBe("bf2");
    expect(game.state("mover").isReady).toBe(true);
  });

  // RULING-CONFLICT: riftjudge d337f73665e7255d calls a modal choice like Qiyana's "draw 1 OR channel 1 rune
  // exhausted" a NON-necessary choice made on resolution; CR 402.2 ("Make all choices required for this
  // ability, such as targets, MODES, or other relevant decisions") puts it in step 2 — finalization, before
  // anyone gets Priority — and 402.4.b forbids declining that stage. The engine follows the CR: the mode is
  // asked at finalization (`play/play-time-modes.ts raisePlayTimeModeChoice`, timing FIN) and the item is on
  // the chain with its mode already locked, so a responder can see which half they are answering.
  test("ruling d337f73665e7255d — Qiyana, Victorious's mode is asked at FINALIZATION, before priority (CR 402.2, against the ruling)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Weakling" }, "weak")
      .unit(P1, "base", QIYANA_VICTORIOUS, "qiyana")
      .build();
    await game.p1.move("qiyana", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus(); // combat: Qiyana (4) conquers bf1 → her trigger
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // The mode comes first — no priority window has opened yet.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "mode" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.label) : []).toEqual(["Draw 1", "Channel 1 rune exhausted"]);
    const hand = game.p1.hand().length;
    await game.p1.chooseMode(0);
    // Only then does the chain item become answerable — and it resolves to the chosen half.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "qiyana", triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });
});

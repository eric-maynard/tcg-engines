/**
 * Ruling 211635a4cca0ac5a — Void Burrower (SFD-187 → sfd-187-221, Rek'Sai legend) "When you conquer, you may exhaust me
 *     to reveal the top 2 cards of your Main Deck. You may banish one, then play it. Recycle the rest."
 *   × Sacrifice (UNL-173 → unl-173-219) · Reaction [1] "As an additional cost to play this, kill a friendly [Mighty]
 *     unit. Draw 2 and channel 1 rune exhausted."
 *   × Immortal Phoenix (ogn-037-298) · 3 Might [Assault 2] — the attacking "Phoenix with Assault" of the question.
 *
 * Q: Phoenix conquers thanks to Assault; the Rek'Sai legend triggers. Can I Sacrifice the (Assault-Mighty) Phoenix in
 *    reaction to the legend ability, draw, and then reveal — or is Assault gone before I can?
 * A: Assault lasts until Combat Cleanup, after all chain interactions, so the Phoenix is still Mighty and can pay
 *    Sacrifice's cost while the Rek'Sai item waits on the chain. LIFO: Sacrifice (draw 2, channel 1) resolves first,
 *    then the legend ability reveals 2 / banish-and-play one (paying its full cost) / recycle the rest — the reveal
 *    cannot be paused midway. (Judge's interpretation; no official FAQ for the exact combo.)
 * Rules: 807.1.d.1 (Assault while Attacker), combat cleanup timing, 340 (LIFO), 424.3 (reveal is part of resolution),
 *        419.2.a (played for full cost).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_BURROWER = "sfd-187-221";
const SACRIFICE = "unl-173-219";
const IMMORTAL_PHOENIX = "ogn-037-298";
const SHIPYARD_SKULKER = "ogn-175-298"; // vanilla 3-cost unit — top of deck
const CLEAVE = "ogn-004-298"; // second revealed card

type PickD = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn (Rek'Sai legend). Phoenix (3, Assault 2) in base; P2 holds bf1 with a 1-Might Speedbump. P1 has Sacrifice
 * in hand and [5] + order + fury; deck top = Skulker, Cleave, Skulker, Skulker.
 */
function board() {
  return scenario()
    .legend(P1, VOID_BURROWER, "reksai")
    .resources(P1, { energy: 5, power: { fury: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", IMMORTAL_PHOENIX, "phoenix")
    .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "def")
    .hand(P1, SACRIFICE, "sac")
    .deck(P1, [SHIPYARD_SKULKER, CLEAVE, SHIPYARD_SKULKER, SHIPYARD_SKULKER], ["d1", "d2", "d3", "d4"]);
}

/** Phoenix attacks bf1 and both players pass focus → combat → conquer → the Void Burrower opt-in appears. */
async function conquerWithPhoenix(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("phoenix", "bf1");
  expect(game.state("phoenix")).toMatchObject({ combatRole: "attacker", might: 5 }); // 3 + Assault 2
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.zoneOf("def")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  return game;
}

describe("Ruling 211635a4cca0ac5a — Sacrifice the Assault-Mighty Phoenix in response to Void Burrower's conquer trigger", () => {
  test("the conquer puts Void Burrower's trigger on the chain: P1 is asked whether to exhaust the legend, and after 'yes' both players get priority on it before anything is revealed", async () => {
    const game = await conquerWithPhoenix();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "reksai" } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "reksai", controller: P1, triggered: true })]);
    await game.p1.yes();
    expect(game.state("reksai").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // reaction window
    expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]); // nothing revealed/moved yet
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("the reveal resolves as ONE instruction block: P1 picks from exactly the top 2 (Skulker, Cleave), the pick is banished-then-played for its FULL cost ([3]), the other card is recycled to the bottom", async () => {
    const game = await conquerWithPhoenix();
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority(); // legend ability resolves
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect((d as PickD).options.map((o) => o.key).sort()).toEqual(["d1", "d2"]);
    await game.p1.pick("d1");
    // Destination for the played unit.
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("d1")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1, order: 1 } }); // 5 − Skulker's full 3
    expect(game.p1.deck().at(-1)).toBe("d2"); // Cleave recycled
    expect(game.p1.deck()[0]).toBe("d3");
  });

  // rule 807.1.c / 710 — Assault is real Might while the Attacker role is stamped, so the
  // attacking Phoenix (3 + Assault 2) is [Mighty] and may be named as Sacrifice's kill cost.
  test("during the combat showdown the attacking Phoenix is 5 Might (Mighty), so Sacrifice may name it as its kill cost", async () => {
    const game = await board().build();
    await game.p1.move("phoenix", "bf1");
    expect(game.state("phoenix").might).toBe(5);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    const field = game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice");
    expect(field?.options ?? []).toContain("phoenix");
  });

  // rule 466.7 / 807.1.d.1 — Combat Cleanup is the LAST step of the combat, so while the conquer trigger sits on
  // the chain the Phoenix is still an Attacker and its [Assault 2] is still real Might: 5, i.e. [Mighty].
  test("ruling 211635a4cca0ac5a — with the Void Burrower item on the chain the Phoenix still has Assault (5) and P1 can react with Sacrifice killing it; Sacrifice resolves first (draw 2, channel 1 exhausted), then the reveal", async () => {
    const game = await conquerWithPhoenix();
    await game.p1.yes();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.state("phoenix").might).toBe(5); // Assault not yet expired
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("sac", { sacrifice: "phoenix" });
    expect(game.zoneOf("phoenix")).toBe("trash"); // cost paid on play
    // rule 428.5 — the cost kill is attributed to Sacrifice, so the Phoenix's own "when you kill a unit with a
    // spell, you may pay [1][fury] to play me from your trash" triggers on top (the printed Sacrifice synergy).
    expect(game.chain().map((c) => c.cardId)).toEqual(["reksai", "sac", "phoenix"]);
    await game.p1.no(); // decline the recursion — the ruling's line is about Sacrifice itself
    expect(game.chain().map((c) => c.cardId)).toEqual(["reksai", "sac"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sacrifice resolves first
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["reksai"]);
    // Then the legend ability: reveal the NEW top 2 (d3, d4).
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect((d as PickD).options.map((o) => o.key).sort()).toEqual(["d3", "d4"]);
  });
});

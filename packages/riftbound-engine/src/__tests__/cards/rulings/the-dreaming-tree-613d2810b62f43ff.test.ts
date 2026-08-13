/**
 * Ruling 613d2810b62f43ff — The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield
 *     "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   × Cruel Patron (OGN-208 → ogn-208-298) · Unit · Order · [4] · 6 Might "As an additional cost to play me, kill a
 *     friendly unit."   (Cull the Weak / Divine Judgment / Meditation cited as further non-targeting examples.)
 *
 * Q: Does the Dreaming Tree trigger when I kill my unit at the Tree to play Cruel Patron?
 * A: No. The Tree only triggers on a SPELL choosing (targeting) a friendly unit there; Cruel Patron is a unit and its kill
 *    is an additional COST, which never targets. Nuance: if that unit was your only one at the Tree you can't play Patron
 *    to the Tree (you no longer control it once the cost is paid).
 * Rules: 355.5 (choosing/targeting), 356.2 (additional costs are not targeting), 341.2 / 323.6 (play destinations need
 *        control), Dreaming Tree "with a spell".
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";
const CRUEL_PATRON = "ogn-208-298";
const DISCIPLINE = "ogn-058-298"; // [2] Reaction "Give a unit +2 [Might] this turn. Draw 1." — a targeting spell for the control

/**
 * P1's turn. P1 controls the live Dreaming Tree with a 2-Might Dreamer (and, unless `alone`, a 3-Might Sleeper) on it.
 * P1: Cruel Patron + Discipline in hand, [6]. Deck top known: d1..d4.
 */
function board(alone = false) {
  const s = scenario()
    .resources(P1, { energy: 6 })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "tree", { might: 2, name: "Dreamer" }, "dreamer")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, CRUEL_PATRON, "patron")
    .hand(P1, DISCIPLINE, "disc")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4"]);
  if (!alone) {
    s.unit(P1, "tree", { might: 3, name: "Sleeper" }, "sleeper");
  }
  return s;
}

describe("Ruling 613d2810b62f43ff — killing a unit at the Dreaming Tree for Cruel Patron's cost draws nothing", () => {
  test("control: a SPELL choosing my Dreamer at the Tree (Discipline) does trigger it — Tree item on the chain, and I draw the Tree's card plus Discipline's", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "dreamer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "tree"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    await game.settle();
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2", "patron"]); // Tree draw + Discipline draw
    expect(game.state("dreamer").might).toBe(4);
  });

  test("ruling: playing Cruel Patron (a unit) by killing the Dreamer at the Tree as its additional cost — the Dreamer dies, Patron enters, and the Tree does NOT trigger: no chain item, no draw", async () => {
    const game = await board().build();
    const sac = game.p1.option("play", "patron")?.fields.find((f) => f.arg === "sacrifice");
    expect((sac?.options ?? []).map(String).toSorted()).toEqual(["dreamer", "sleeper"]);
    await game.p1.play("patron", { sacrifice: "dreamer", to: "base" });
    expect(game.zoneOf("dreamer")).toBe("trash"); // paid up front as a cost
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    await game.settle();
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.p1.energy()).toBe(2);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["disc"]); // nothing drawn
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.violations()).toEqual([]);
  });

  test("…and the Tree's 'first time each turn' is still unused afterwards: Discipline on the surviving Sleeper now draws the Tree card (the cost-kill did not consume it)", async () => {
    const game = await board().build();
    await game.p1.play("patron", { sacrifice: "dreamer", to: "base" });
    await game.settle();
    await game.p1.cast("disc", { targets: "sleeper" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc", "tree"]);
    await game.settle();
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2"]);
  });

  // RULING-CONFLICT: riftjudge 613d2810b62f43ff (nuance, and 81bdefc55681da4a) says killing your ONLY unit at the Tree as
  // Cruel Patron's cost costs you control of the Tree before the destination is checked, so "to the Tree" would be illegal;
  // CR 190.4 / 323.6 (+ the official clarification 9a32c2cc829f221a) say control is only re-examined at a Cleanup run in an
  // OPEN State, and the play sitting on the Chain is a Closed State — engine follows CR (see
  // core-rules/battlefield-control-timing.test.ts). The just-emptied Tree is therefore still "a battlefield you control"
  // and a legal destination; control lapses only at the first Open Cleanup after the chain empties — which never comes
  // here, because Patron himself arrives at the Tree.
  test("613d2810b62f43ff (per CR) — Cruel Patron MAY be played to the Tree while killing my only unit there: control persists across the play, and the Tree still draws nothing", async () => {
    const game = await board(true).build();
    const variants = game.p1.option("play", "patron")?.variants ?? [];
    const toTreeKillingDreamer = variants.filter(
      (v) => String(v.params.location ?? "").includes("tree") && v.params.sacrificeId === "dreamer",
    );
    expect(toTreeKillingDreamer.length).toBe(1);
    await game.p1.play("patron", { sacrifice: "dreamer", to: "tree" });
    await game.settle();
    expect(game.zoneOf("dreamer")).toBe("trash");
    expect(game.zoneOf("patron")).toBe("battlefield-tree");
    expect(game.gameState.battlefields.tree?.controller).toBe(P1);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["disc"]); // the cost-kill is not a spell choosing: no Tree draw
    expect(game.violations()).toEqual([]);
  });

  // The other half of the ruling's nuance IS the CR: once the chain empties with nobody there, the Tree does lapse.
  test("323.6 — but with the Dreamer killed for a Patron played to BASE, the first Open Cleanup does drop P1's control of the Tree", async () => {
    const toBase = await board(true).build();
    await toBase.p1.play("patron", { sacrifice: "dreamer", to: "base" });
    await toBase.settle();
    expect(toBase.gameState.battlefields.tree?.controller ?? null).toBeNull();
  });

  test("nuance (legal line): with the Dreamer alone at the Tree, Patron is played to BASE killing the Dreamer — P1 has nothing left at the Tree and, again, nothing is drawn", async () => {
    const g2 = await board(true).build();
    const sac = g2.p1.option("play", "patron")?.fields.find((f) => f.arg === "sacrifice");
    expect((sac?.options ?? []).map(String)).toEqual(["dreamer"]);
    await g2.p1.play("patron", { sacrifice: "dreamer", to: "base" });
    await g2.settle();
    expect(g2.zoneOf("dreamer")).toBe("trash");
    expect(g2.zoneOf("patron")).toBe("base");
    expect(g2.p1.units("tree")).toEqual([]);
    expect(g2.p1.hand()).toEqual(["disc"]); // and still no Tree draw
    expect(g2.chain()).toEqual([]);
  });
});

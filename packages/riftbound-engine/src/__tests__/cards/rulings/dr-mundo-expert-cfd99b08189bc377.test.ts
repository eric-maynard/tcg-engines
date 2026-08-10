/**
 * Ruling cfd99b08189bc377 — Dr. Mundo, Expert (OGN-109 → ogn-109-298) · 6 Might
 *     "My Might is increased by the number of cards in your trash. At the start of your Beginning Phase, recycle 3 from your trash."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Stupefy (OGN-095 → ogn-095-298) · Reaction · 1 "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *
 * Q: Mundo (6, empty trash) is attacked by Yasuo, Remorseful; two Stupefies are played in response to the attack trigger.
 *    Does Mundo get +2 from the Stupefies hitting the trash before Yasuo's ability resolves?
 * A: Yes. LIFO: each Stupefy resolves and goes to the trash first (Mundo 7, then 8); only then does Yasuo's "when I
 *    attack" ability resolve, dealing damage off Yasuo's CURRENT Might — Mundo, now 8, survives it.
 * Rules: 336/340 (LIFO, one item at a time), 354 (a resolved spell goes to trash), Mundo's passive tracks the trash continuously.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DR_MUNDO_EXPERT = "ogn-109-298";
const YASUO_REMORSEFUL = "ogn-076-298";
const STUPEFY = "ogn-095-298";
const FILLER = "ogn-175-298";

/** P2's turn. P1 holds bf1 with Dr. Mundo (6, EMPTY trash), two Stupefies in hand and exactly [2]. P2's Yasuo (6) attacks from base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", DR_MUNDO_EXPERT, "mundo")
    .unit(P2, "base", YASUO_REMORSEFUL, "yasuo")
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
    .hand(P1, STUPEFY, "s1")
    .hand(P1, STUPEFY, "s2");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** Yasuo attacks bf1 → his trigger (aimed at Mundo, the only enemy there) is on the chain; P2 passes; P1 answers with both Stupefies on Yasuo. */
async function attackAndDoubleStupefy(): Promise<Game> {
  const game = await board().build();
  expect(game.state("mundo").might).toBe(6);
  expect(game.p1.trash()).toEqual([]);
  await game.p2.move("yasuo", "bf1");
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("mundo");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P2, triggered: true })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.cast("s1", { targets: "yasuo" });
  await game.p1.cast("s2", { targets: "yasuo" });
  expect(game.p1.energy()).toBe(0);
  expect(chainIds(game)).toEqual(["yasuo", "s1", "s2"]);
  return game;
}

describe("Ruling cfd99b08189bc377 — Stupefies hit the trash (Mundo +1 each) before Yasuo's attack trigger resolves", () => {
  test("both players pass: the SECOND Stupefy resolves first and lands in P1's trash → Mundo 7; Yasuo's ability still waiting", async () => {
    const game = await attackAndDoubleStupefy();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("s2")).toBe("trash");
    expect(game.p1.trash()).toEqual(["s2"]);
    expect(game.state("mundo").might).toBe(7);
    expect(game.state("yasuo").might).toBe(5);
    expect(chainIds(game)).toEqual(["yasuo", "s1"]);
    expect(game.state("mundo").damage).toBe(0); // nothing dealt yet
    expect(game.p1.hand()).toEqual(["d1"]); // Stupefy's draw
  });

  test("then the first Stupefy resolves → trash has 2, Mundo 8, Yasuo 4 — and Yasuo's trigger is STILL on the chain, unresolved", async () => {
    const game = await attackAndDoubleStupefy();
    await game.p1.passPriority();
    await game.p2.passPriority(); // s2
    await game.p1.passPriority();
    await game.p2.passPriority(); // s1
    expect(game.p1.trash().toSorted()).toEqual(["s1", "s2"]);
    expect(game.state("mundo")).toMatchObject({ damage: 0, might: 8 });
    expect(game.state("yasuo").might).toBe(4);
    expect(chainIds(game)).toEqual(["yasuo"]);
    expect(game.p1.hand().toSorted()).toEqual(["d1", "d2"]);
  });

  test("finally Yasuo's ability resolves off his CURRENT Might: Mundo (8) takes that much and survives on the battlefield into the showdown", async () => {
    const game = await attackAndDoubleStupefy();
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("mundo")).toMatchObject({ damage: game.state("yasuo").might, might: 8, zone: "battlefield-bf1" });
    expect(game.state("mundo").damage).toBe(4);
    expect(game.state("mundo").damage).toBeLessThan(game.state("mundo").might);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });

  test("control — no Stupefies: Yasuo's ability deals 6 to a 6-Might Mundo and kills him before combat", async () => {
    const game = await board().build();
    await game.p2.move("yasuo", "bf1");
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("mundo");
    }
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("mundo")).toBe("trash");
    expect(game.p1.trash()).toEqual(["mundo"]);
  });
});

/**
 * Interaction: Unsung Hero (sfd-167-221) · Unit · Order · 2 · 2 Might
 *     "[Deathknell] — If I was [Mighty], draw 2. (When I die, get the effect. I'm Mighty while I have 5+ [Might].)"
 *   × B.F. Sword (sfd-161-221) · Equipment · Order · 4 · Might Bonus +3
 *   × Sacrifice (unl-173-219) · Spell · Order · 1 · Reaction
 *     "As an additional cost to play this, kill a friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   (+ Jaull-Fish sfd-103-221 "I cost [2] less for each of your [Mighty] units."; Doran's Shield sfd-033-221 +1)
 *
 * Question: P1's Unsung Hero (printed 2) wears B.F. Sword (+3) in base → shows 5.
 *   (a) Is a printed-2 unit 'Mighty' via an Equipment bonus, i.e. a legal kill for Sacrifice's cost?
 *   (b) If so, does the Deathknell draw 2 (in the trash it is a printed-2 card)? Where does the Sword go?
 *   (c) After it dies, is the card in the trash Mighty for anything looking there? Does Jaull-Fish in hand still
 *       get a discount from it?
 *   (d) Doran's Shield (+1 → 3) or a +2 this-turn pump (→ 4): can it be Sacrificed; dying to damage, does it draw?
 *
 * Rules: 708 (Mighty = Might ≥ 5), 710 (on the board: CURRENT Might), 711 (non-board zones: PRINTED Might),
 * 477.3.d / 434.1.d (attached Might Bonus is part of current Might), 435.1.e / 137.3.a (bonus stops when detached;
 * Equipment of a unit leaving the board is detached and stays on the board), 143.2 (Might), 808.1.d.3-style
 * look-back ("was Mighty" read from the unit as it died).
 *
 * Expected: (a) yes — 2+3 = 5, legal sacrifice. (b) cost kills it; Sword detaches to P1's base unattached;
 * Deathknell draws 2 (was Mighty at 5 as it died), then Sacrifice: draw 2 + channel 1 exhausted → 4 cards.
 * (c) in the trash it is a printed-2, non-Mighty card; Jaull-Fish's discount from it is gone. (d) at 3 or 4 it is
 * not a legal sacrifice; dying in combat at that Might its Deathknell draws nothing.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const UNSUNG_HERO = "sfd-167-221";
const BF_SWORD = "sfd-161-221";
const SACRIFICE = "unl-173-219";
const JAULL_FISH = "sfd-103-221";
const DORANS_SHIELD = "sfd-033-221";

/** P1's turn. Hero wearing B.F. Sword in base (5), Sacrifice + Jaull-Fish (7 + [body][body]) in hand, 6 energy + 2 body; P2 holds bf1 with a 5-Might wall. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", UNSUNG_HERO, "hero", { equippedWith: ["sword"] })
    .gear(P1, BF_SWORD, "sword", { attachedTo: "hero" })
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .hand(P1, SACRIFICE, "sac")
    .hand(P1, JAULL_FISH, "jaull");
}

/** 'No' side: Hero wearing Doran's Shield (3) or carrying a +2 this-turn pump (4). */
function weakBoard(kind: "shield" | "pump") {
  const s = scenario().resources(P1, { energy: 6 }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 5, name: "Wall" }, "wall").hand(P1, SACRIFICE, "sac");
  return kind === "shield"
    ? s.unit(P1, "base", UNSUNG_HERO, "hero", { equippedWith: ["shield"] }).gear(P1, DORANS_SHIELD, "shield", { attachedTo: "hero" })
    : s.unit(P1, "base", UNSUNG_HERO, "hero", { mightModifier: 2 });
}

const sacrificeChoices = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  [...((game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice")?.options as string[] | undefined) ?? [])].sort();

describe("Unsung Hero + B.F. Sword × Sacrifice — Mighty on the board (current Might) vs in the trash (printed Might)", () => {
  test("setup: printed 2 + Sword bonus 3 = 5 current Might on the board (434.1.d, 477.3.d); Sword attached", async () => {
    const game = await board().build();
    expect(game.state("hero")).toMatchObject({ baseMight: 2, might: 5, zone: "base" });
    expect(game.state("hero").attachments).toEqual(["sword"]);
    expect(game.state("sword").attachedTo).toBe("hero");
  });

  test("(a) the equipped Hero IS Mighty (708, 710) → offered as Sacrifice's kill and the spell is castable", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "sac")).toBe(true);
    expect(sacrificeChoices(game)).toEqual(["hero"]);
  });

  test("(b) paying the cost kills the Hero at once (in P1's trash while Sacrifice is on the chain); B.F. Sword detaches and stays on the board, unattached, in P1's base (435.1.e, 137.3.a)", async () => {
    const game = await board().build();
    await game.p1.play("sac", { sacrifice: "hero" });
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.p1.trash()).toContain("hero");
    expect(game.chain().map((c) => c.cardId)).toContain("sac");
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.state("sword")).toMatchObject({ attachedTo: undefined, controller: P1 });
    expect(game.p1.energy()).toBe(5);
  });

  test("(b) the Deathknell trigger lands on the chain above Sacrifice", async () => {
    const game = await board().build();
    await game.p1.play("sac", { sacrifice: "hero" });
    expect(game.chain().map((c) => [c.cardId, c.triggered])).toEqual([
      ["sac", false],
      ["hero", true],
    ]);
  });

  test("(b) 'If I was Mighty' reads the unit as it died on the board (5) → Deathknell draws 2; then Sacrifice draws 2 and channels 1 rune exhausted → hand 1 (Jaull-Fish) + 4", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await game.p1.play("sac", { sacrifice: "hero" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(1 + 4);
    expect(game.p1.hand()).toContain("jaull");
    expect(game.p1.deck()).toHaveLength(deck0 - 4);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(c) in the trash the Hero is a printed-2, non-Mighty card (711) — nothing is attached to it any more", async () => {
    const game = await board().build();
    await game.p1.play("sac", { sacrifice: "hero" });
    await game.settle();
    const s = game.state("hero");
    expect(s.zone).toBe("trash");
    expect(s.might).toBe(2);
    expect(s.might).toBeLessThan(5);
    expect(s.attachments).toEqual([]);
  });

  test("(c) Jaull-Fish counts Mighty units you control ON THE BOARD: with the 5-Might Hero out it costs 7−2 = 5 (playable on 6); once the Hero is in the trash the discount is gone (7 > 5 energy left → not playable)", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "jaull")).toBe(true); // 5 ≤ 6
    await game.p1.play("sac", { sacrifice: "hero" });
    await game.settle();
    expect(game.p1.energy()).toBe(5);
    expect(game.p1.can("play", "jaull")).toBe(false); // full 7 now — the trash card gives no discount

    // Control: with the discount still live, 5 energy WOULD be enough.
    const control = await board().resources(P1, { energy: 5, power: { body: 2 } }).build();
    expect(control.p1.can("play", "jaull")).toBe(true);
  });

  test("(d) Doran's Shield (+1 → 3) or a +2 pump (→ 4): not Mighty on the board (710) → not a legal Sacrifice kill; the spell is not castable at all", async () => {
    const shield = await weakBoard("shield").build();
    expect(shield.state("hero").might).toBe(3);
    expect(sacrificeChoices(shield)).toEqual([]);
    expect(shield.p1.can("cast", "sac")).toBe(false);
    expect((await shield.p1.try((p) => p.play("sac", { sacrifice: "hero" }))).ok).toBe(false);
    expect(shield.zoneOf("hero")).toBe("base");

    const pump = await weakBoard("pump").build();
    expect(pump.state("hero").might).toBe(4);
    expect(sacrificeChoices(pump)).toEqual([]);
    expect(pump.p1.can("cast", "sac")).toBe(false);
  });

  test("(d) dying to combat damage at 3 (Shield) — Deathknell resolves but 'was Mighty' is false → draws nothing; the Shield detaches to base", async () => {
    const game = await weakBoard("shield").build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("hero", "bf1"); // 3 (Tank, irrelevant alone) into a 5-Might defender
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.zoneOf("shield")).toBe("base");
    expect(game.state("shield").attachedTo).toBeUndefined();
  });

  test("(d) dying to combat damage at 4 (+2 pump) — Deathknell draws nothing either", async () => {
    const game = await weakBoard("pump").build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("hero", "bf1");
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("asymmetry: the same physical card is Mighty in play at 5 current Might and simultaneously a non-Mighty printed-2 card once in the trash — contrast with a combat death at 5 which DOES draw 2", async () => {
    const game = await board().build();
    expect(game.state("hero").might).toBeGreaterThanOrEqual(5); // Mighty on the board
    const hand0 = game.p1.hand().length;
    await game.p1.move("hero", "bf1"); // 5 vs 5: both die
    await game.settle();
    expect(game.zoneOf("hero")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 2); // was Mighty as it died
    expect(game.state("hero").might).toBe(2); // …and is a 2-Might card in the trash
    expect(game.zoneOf("sword")).toBe("base");
  });
});

/**
 * Master Bingwen — sfd-127-221 · Unit · Chaos · 6 energy (no power) · 6 might
 *
 *   [Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow]
 *   less, even if it's already attached.)
 *
 * Rules: 821 Weaponmaster (a Play-Effect trigger: choose an Equipment YOU control, pay its Equip
 * cost reduced by [A] — one power of any domain — and attach it; 821.1.c.3 no [A] in the cost → no
 * reduction; 821.1.c.5 unpayable → it stays where it is; 821.2 no function while on the board),
 * 434.1.f / 718.4 (re-attaching detaches from the old wearer, who loses the bonus), 719.3 (the
 * Equipment is wherever its Top-Most card is), 719.5 + 435.4 (when the wearer leaves the board the
 * Equipment detaches and stays on the board at that location), 143.4 (units enter exhausted).
 *
 * Head-judge corner cases for THIS card:
 *   1. Doran's Ring ([Equip] [chaos]) is free after the [rainbow] discount → 6+1 = 7.
 *   2. Off-domain Equipment you control still qualifies: Skyfall of Areion ([1][fury]) — the
 *      discount eats the [fury] pip, the [1] must still be paid: 7 energy attaches, exactly 6 does
 *      not even offer it (821.1.c.5) and energy never goes negative.
 *   3. Last Rites ([chaos] + Recycle 2 from trash): the discount only removes the power; with an
 *      EMPTY trash the recycle part is unpayable → not attachable; with 2 cards in trash it attaches
 *      and both cards leave the trash.
 *   4. Bingwen played directly to a battlefield I control: the Ring in my base attaches and is now
 *      "at" that battlefield with him (719.3) — base gear list no longer shows it… but it is still
 *      P1's card and attached.
 *   5. "even if it's already attached": Ring migrates off a friendly wearer (3→2) onto Bingwen.
 *   6. Arcane Shift (sfd-200) on an equipped Bingwen: banish → Ring detaches and stays on the board;
 *      the owner re-PLAYS Bingwen ignoring cost → Weaponmaster triggers AGAIN and may re-equip the
 *      Ring for free.
 *   7. Negative space: no Equipment → no prompt; enemy Equipment never offered; a Bingwen that was
 *      merely moved gets no prompt; declining spends nothing.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-127-221";
const RING = "sfd-124-221"; // Doran's Ring — Equipment, [Equip] [chaos], +1
const SKYFALL = "sfd-030-221"; // Skyfall of Areion — Equipment, [Equip] [1][fury], +2
const LAST_RITES = "sfd-150-221"; // Equipment, [Equip] — [chaos], Recycle 2 cards from your trash, +2
const ARCANE_SHIFT = "sfd-200-221"; // Action spell 3+[rainbow]: banish friendly unit, owner replays it free; 3 dmg; banish this
const FILLER = "ogn-175-298"; // vanilla 3-might unit

describe("Master Bingwen (sfd-127-221)", () => {
  test("registry payload: a 6-cost / 6-might Chaos unit with no power cost whose only ability is the Weaponmaster keyword", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 6, might: 6, name: "Master Bingwen" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([{ keyword: "Weaponmaster", type: "keyword" }]);
  });

  test("cost: exactly 6 energy is deducted; enters the base exhausted at 6 Might; 5 energy (+ any power) is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "bw").build();
    await game.p1.play("bw");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.decision()?.kind).toBe("action"); // no Equipment anywhere → no Weaponmaster prompt
    await game.settle();
    expect(game.zoneOf("bw")).toBe("base");
    expect(game.state("bw")).toMatchObject({ baseMight: 6, isExhausted: true, might: 6 });
    expect(game.state("bw").keywords).toContain("Weaponmaster");
    const poor = await scenario().resources(P1, { energy: 5, power: { chaos: 3 } }).hand(P1, CARD, "bw").build();
    expect(poor.p1.can("play", "bw")).toBe(false);
  });

  test("Weaponmaster + Doran's Ring ([chaos]): the [rainbow] discount makes it free — optional pick, attach, 6→7, pool untouched", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).gear(P1, RING, "ring").hand(P1, CARD, "bw").build();
    await game.p1.play("bw");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", max: 1, seat: P1, semantics: "equip" });
    await game.p1.pick("ring");
    await game.settle();
    expect(game.state("ring").attachedTo).toBe("bw");
    expect(game.state("bw").attachments).toEqual(["ring"]);
    expect(game.state("bw").might).toBe(7);
    expect(game.state("bw").isExhausted).toBe(true); // attaching does not ready him
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.violations()).toEqual([]);
  });

  test("off-domain Skyfall ([1][fury]): discount covers the [fury] pip, the [1] is still paid — 7 energy → attached, 0 left, 6→8", async () => {
    const game = await scenario().resources(P1, { energy: 7 }).gear(P1, SKYFALL, "sky").hand(P1, CARD, "bw").build();
    await game.p1.play("bw", { answers: ["sky"] });
    await game.settle();
    expect(game.state("sky").attachedTo).toBe("bw");
    expect(game.state("bw").might).toBe(8);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("821.1.c.5: with exactly 6 energy Skyfall's leftover [1] is unpayable — not offered, pick refused, energy never negative; the free Ring still is", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).gear(P1, SKYFALL, "sky").gear(P1, RING, "ring").hand(P1, CARD, "bw").build();
    await game.p1.play("bw");
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(offered).toContain("ring");
    expect(offered).not.toContain("sky");
    const r = await game.p1.try((p) => p.pick("sky"));
    expect(r.ok).toBe(false);
    await game.p1.decline();
    await game.settle();
    expect(game.state("sky").attachedTo).toBeUndefined();
    expect(game.state("ring").attachedTo).toBeUndefined();
    expect(game.state("bw").might).toBe(6);
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Last Rites' 'Recycle 2 cards from your trash' Equip cost: with an EMPTY trash it is not attachable (821.1.c.5)", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).gear(P1, LAST_RITES, "rites").hand(P1, CARD, "bw").build();
    expect(game.p1.trash()).toEqual([]);
    await game.p1.play("bw");
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(offered).not.toContain("rites");
    const r = await game.p1.try((p) => p.pick("rites"));
    expect(r.ok).toBe(false);
    await game.settle();
    expect(game.state("rites").attachedTo).toBeUndefined();
    expect(game.state("bw").might).toBe(6);
  });

  test("Last Rites via Weaponmaster with 2 cards in trash recycles those 2 cards as payment (821.1.c: pay the Equip cost reduced by [A])", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .gear(P1, LAST_RITES, "rites")
      .trash(P1, FILLER, "t1")
      .trash(P1, FILLER, "t2")
      .hand(P1, CARD, "bw")
      .build();
    await game.p1.play("bw", { answers: ["rites", ["t1", "t2"]] });
    await game.settle({ policy: "first" });
    expect(game.state("rites").attachedTo).toBe("bw");
    expect(game.state("bw").might).toBe(8);
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("t1")).toBe("mainDeck");
    expect(game.zoneOf("t2")).toBe("mainDeck");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("only YOUR Equipment: an enemy Ring is never offered and cannot be picked", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).gear(P1, RING, "mine").gear(P2, RING, "theirs").hand(P1, CARD, "bw").build();
    await game.p1.play("bw");
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["mine"]);
    const r = await game.p1.try((p) => p.pick("theirs"));
    expect(r.ok).toBe(false);
    expect(game.state("theirs").attachedTo).toBeUndefined();
  });

  test("'even if it's already attached': the Ring migrates from a friendly Squire (2+1=3 → 2) onto Bingwen (6 → 7)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["ring"] })
      .gear(P1, RING, "ring", { attachedTo: "squire" })
      .hand(P1, CARD, "bw")
      .build();
    expect(game.state("squire").might).toBe(3);
    await game.p1.play("bw", { answers: ["ring"] });
    await game.settle();
    expect(game.state("ring").attachedTo).toBe("bw");
    expect(game.state("bw").might).toBe(7);
    expect(game.state("squire")).toMatchObject({ attachments: [], might: 2 });
  });

  test("played straight to a battlefield I control: Weaponmaster still fires there and the Ring from my base attaches (6→7 at bf1)", async () => {
    // Note: the engine keeps an attached Equipment's raw zone as "base" and derives its location from
    // its holder (719.3), so we assert the link and the Might, not the Equipment's raw zone.
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P1 })
      .gear(P1, RING, "ring")
      .hand(P1, CARD, "bw")
      .build();
    await game.p1.play("bw", { answers: ["ring"], to: "bf1" });
    await game.settle();
    expect(game.zoneOf("bw")).toBe("battlefield-bf1");
    expect(game.state("ring").attachedTo).toBe("bw");
    expect(game.state("bw").might).toBe(7);
    expect(game.state("bw").isExhausted).toBe(true);
  });

  test("821.2 — only on PLAY: a Bingwen already on board that moves out and back gets no prompt and no free attach", async () => {
    const game = await scenario().battlefield("bf1", { controller: null }).unit(P1, "base", CARD, "bw").gear(P1, RING, "ring").build();
    await game.p1.move("bw", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("ring").attachedTo).toBeUndefined();
    expect(game.state("bw").might).toBe(6);
  });

  test("combat trade with the Ring on (7 into a 7): both die, the Ring DETACHES and ends up unattached in my base — not in the trash (719.5, 435.4.a)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "bw", { equippedWith: ["ring"] })
      .gear(P1, RING, "ring", { attachedTo: "bw" })
      .build();
    expect(game.state("bw").might).toBe(7);
    await game.p1.move("bw", "bf1");
    await game.settle();
    expect(game.zoneOf("bw")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("ring")).toBe("base");
    expect(game.state("ring").attachedTo).toBeUndefined();
    expect(game.p1.points()).toBe(0);
  });

  test("Arcane Shift re-PLAYS Bingwen, so Weaponmaster ('When you play me') must trigger again and let him re-equip the detached Ring (821.1.c, 356.1.b)", async () => {
    // Expected: banish → Ring detaches and stays on the board (719.5); the owner plays Bingwen again
    // ignoring cost → a fresh Weaponmaster equip prompt → Ring re-attached for free (7 Might).
    // Actual: the replay lands him in base exhausted, deals the 3 and banishes the spell correctly, but
    // no Weaponmaster prompt is ever offered on the choose-destination completion path.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Victim" }, "victim")
      .unit(P1, "base", CARD, "bw", { equippedWith: ["ring"] })
      .gear(P1, RING, "ring", { attachedTo: "bw" })
      .hand(P1, ARCANE_SHIFT, "shift")
      .build();
    await game.p1.cast("shift", { targets: ["bw", "victim"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    // Resolve: banish bw → replay (destination base is forced/first) → Weaponmaster pick → ring.
    game.script(P1, ["base", "ring"]);
    await game.settle({ policy: "first" });
    expect(game.zoneOf("bw")).toBe("base");
    expect(game.state("bw").isExhausted).toBe(true); // freshly played again (143.4)
    expect(game.state("ring").attachedTo).toBe("bw");
    expect(game.state("bw").might).toBe(7);
    expect(game.p1.energy()).toBe(0); // "ignoring its cost" + free Ring
    expect(game.state("victim").damage).toBe(3);
    expect(game.zoneOf("shift")).toBe("banishment");
  });
});

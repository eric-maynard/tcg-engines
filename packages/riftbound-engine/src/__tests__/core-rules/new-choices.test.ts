/**
 * Core rules — NEW CHOICES for a finalized chain item (rules 751–755).
 *
 *   751   Some effects instruct a player to make new choices for a finalized item on the chain.
 *   751.1 …choosing Game Objects, players, zones or modes that were previously NOT chosen by the item.
 *   752.1 Re-makeable: locations to be played to, modes, destinations, targets. 752.2 not "as you play"
 *         choices / Optional Additional Costs.
 *   753   Any subset may be remade; 753.1 never into an illegal state; 753.2 no legal choice ⇒ no new choice.
 *   754   An object newly targeted this way has its Targeting Effects trigger at that time.
 *   755   Costs "to play" incurred by new choices are IGNORED (755.1 — already played and paid).
 *   340.4 Afterwards Priority goes to the controller of the NEWEST remaining chain item.
 *
 * Engine: `abilities/new-choices.ts offerNewChoices` raises ONE `new-choices` prompt that walks the
 * item's choice slots (modes → targets / source / sets → destinations); the harness shows each slot as a
 * `pick` (semantics by slot kind) carrying `newChoices {slot, slots}` and answers with pick / decline
 * (= keep) or `seat.rechoose({...})` / `seat.keepChoices()`.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const MYSTIC_REVERSAL = "ogn-080-298"; // Reaction · 4 + [calm]×3 — "Gain control of a spell. You may make new choices for it."
const REBUTTAL = "ven-152-166"; // Reaction · 1 + [C] — "…You may pay [rainbow]. If you do, gain control of it and you may make new choices for it. Otherwise, counter it."
const JAE_MEDARDA = "sfd-142-221"; // 5 Might — "When you choose me with a spell, draw 1."
const POUTY_PORO = "ogn-013-298"; // 2 Might, [Deflect]
const ALPHA_STRIKE = "unl-192-219"; // "Choose a friendly unit. It deals damage equal to its Might split among enemy units at battlefields. …"
const RIDE_THE_WIND = "ogn-173-298"; // "Move a friendly unit and ready it."

/** Inline spell: "Deal 3 to an enemy unit." (Reaction so it fits any window). */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { controller: "enemy", type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt (inline: Deal 3 to an enemy unit)",
  timing: "reaction",
};

/** Inline modal spell: "Choose one — Deal 2 to an enemy unit. · Ready a friendly unit." */
const FORK = {
  abilities: [
    {
      effect: {
        options: [
          { effect: { amount: 2, target: { controller: "enemy", type: "unit" }, type: "damage" }, label: "Deal 2 to an enemy unit" },
          { effect: { target: { controller: "friendly", type: "unit" }, type: "ready" }, label: "Ready a friendly unit" },
        ],
        type: "choice",
      },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Fork (inline modal spell)",
  timing: "reaction",
};

/** Inline spell: "Move a unit." — any unit, destination chosen by the controller (355.4). */
const SHOVE = {
  abilities: [{ effect: { target: { type: "unit" }, to: "choose", type: "move" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Shove (inline: Move a unit)",
  timing: "action",
};

/** P1 casts `alias` with `opts`, passes; P2 Mystic Reversals it; both pass → Reversal resolves and P2 owns the item. */
async function reverse(game: Game, alias: string, opts: Parameters<Game["p1"]["cast"]>[1]): Promise<void> {
  await game.p1.cast(alias, opts);
  await game.p1.passPriority();
  await game.p2.cast("mr", { targets: alias });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.chain().find((c) => c.cardId === alias)?.controller).toBe(P2);
  expect(game.zoneOf("mr")).toBe("trash"); // the granting spell has finished (359.3.d)
}

function base() {
  return scenario().resources(P2, { energy: 4, power: { calm: 3 } }).hand(P2, MYSTIC_REVERSAL, "mr");
}

const cards = (d: ReturnType<Game["decision"]>): string[] => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

describe("751 / 752.1 / 753.1 — a single-target spell stolen: re-aim from the NEW controller's seat", () => {
  async function stolenBolt(): Promise<Game> {
    const game = await base()
      .unit(P1, "base", { might: 4, name: "P1 Alpha" }, "a1")
      .unit(P1, "base", { might: 4, name: "P1 Bravo" }, "b1")
      .unit(P2, "base", { might: 4, name: "P2 X-ray" }, "x2")
      .unit(P2, "base", { might: 4, name: "P2 Yankee" }, "y2")
      .hand(P1, BOLT, "bolt")
      .build();
    await reverse(game, "bolt", { targets: "x2" });
    return game;
  }

  test("the prompt is ONE new-choices decision for P2 on the stolen item: kind pick, semantics target, declinable ('you may'), timing RES — not a FIN/PAY step", async () => {
    const game = await stolenBolt();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P2, semantics: "target", source: { cardId: "bolt", pendingChoiceType: "new-choices" }, timing: "RES" });
    expect(d.newChoices?.slot).toMatchObject({ current: ["x2"], key: "target:0", kind: "target" });
    expect(d.newChoices?.slots.map((s) => s.key)).toEqual(["target:0"]);
    expect(game.gameState.pendingChoice).toMatchObject({ itemId: game.chain()[0]!.id, type: "new-choices" });
  });

  test("'enemy' is re-read for P2 (753.1): P1's units are offered, P2's own X-ray (the current, now-illegal target) and Yankee are not; the spell itself never is (355.9.c)", async () => {
    const game = await stolenBolt();
    expect(cards(game.decision()).sort()).toEqual(["a1", "b1"]);
    expect((await game.p2.try((p) => p.pick("y2"))).ok).toBe(false);
    expect((await game.p2.try((p) => p.answer({ keys: ["bolt"], kind: "pick" }))).ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 }); // refusals consumed nothing
  });

  test("re-aiming at P1's Alpha rebinds the item's target; it resolves for 3 on Alpha, X-ray untouched, and the card still lands in its OWNER P1's trash", async () => {
    const game = await stolenBolt();
    await game.p2.pick("a1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bolt", controller: P2, targets: ["a1"] })]);
    await game.settle();
    expect(game.state("a1").damage).toBe(3);
    expect(game.state("x2").damage).toBe(0);
    expect(game.p1.trash()).toContain("bolt");
  });

  test("keeping (decline) is legal even though the kept target mistargets for P2: X-ray is not 'enemy' at resolution → nothing is dealt (359.3.e.4/5)", async () => {
    const game = await stolenBolt();
    await game.p2.decline();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bolt", targets: ["x2"] })]);
    await game.settle();
    expect(game.state("x2").damage + game.state("a1").damage + game.state("b1").damage).toBe(0);
  });

  test("the item stays FINALIZED throughout: no chain item is added or re-pended, and after the answer play returns to an ordinary priority window (both must pass before it resolves)", async () => {
    const game = await stolenBolt();
    const before = game.chain();
    expect(before).toHaveLength(1);
    const rawStatus = () => game.gameState.interaction?.chain?.items?.[0]?.status;
    expect(rawStatus()).not.toBe("pending"); // a played spell is finalized as it is played
    await game.p2.pick("b1");
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]!.id).toBe(before[0]!.id);
    expect(rawStatus()).not.toBe("pending"); // …and re-choosing never re-pends it
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", timing: "ACT" });
    await game.acting().passPriority();
    expect(game.zoneOf("bolt")).toBe("chain");
    await game.acting().passPriority();
    expect(game.zoneOf("bolt")).toBe("trash");
  });
});

describe("340.4 — after the granting spell resolves, Priority goes to the controller of the NEWEST remaining item", () => {
  test("Discipline stolen on P1's turn: once P2 answers (keep), P2 — the item's new controller — holds priority, then P1", async () => {
    const game = await base().unit(P1, "base", { might: 3 }, "a1").unit(P2, "base", { might: 3 }, "x2").hand(P1, "ogn-058-298", "disc").resources(P1, { energy: 2 }).build();
    await reverse(game, "disc", { targets: "a1" });
    await game.p2.keepChoices();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });
});

describe("754 — a NEWLY targeted object's Targeting Effects trigger; re-naming the current one does not (751.1)", () => {
  function board() {
    return base().unit(P1, "base", { might: 3, name: "P1 Alpha" }, "a1").unit(P2, "base", JAE_MEDARDA, "jae").hand(P1, "ogn-058-298", "disc").resources(P1, { energy: 2 });
  }

  test("Discipline (on Alpha) stolen and re-aimed at P2's Jae: Jae's 'when you choose me with a spell' goes on the chain above Discipline, controlled by the chooser P2", async () => {
    const game = await board().build();
    await reverse(game, "disc", { targets: "a1" });
    const d = game.decision() as PickDecision;
    expect(cards(d).sort()).toEqual(["a1", "jae"]); // "a unit": both legal; a1 is the current value
    expect(d.options.find((o) => o.card === "a1")?.current).toBe(true);
    await game.p2.pick("jae");
    expect(game.chain().map((c) => ({ card: c.cardId, ctl: c.controller }))).toEqual([
      { card: "disc", ctl: P2 },
      { card: "jae", ctl: P2 },
    ]);
  });

  test("Discipline already ON Jae, stolen, and Jae named again: not a new choice — no trigger item, no extra card", async () => {
    const game = await board().build();
    await reverse(game, "disc", { targets: "jae" });
    const hand = game.p2.hand().length;
    await game.p2.pick("jae"); // re-selecting the current value = keep
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
    expect(game.p2.hand()).toHaveLength(hand);
  });
});

describe("755 — a [Deflect] surcharge the new choice incurs is IGNORED: offered regardless of pool, nothing charged, nothing refunded", () => {
  function board() {
    return scenario()
      .resources(P1, { energy: 0 })
      .resources(P2, { energy: 1, power: { chaos: 1, rainbow: 1 } }) // exactly Rebuttal + its optional [rainbow]
      .unit(P1, "base", POUTY_PORO, "poro")
      .unit(P1, "base", { might: 2, name: "P1 Grunt" }, "grunt")
      .unit(P2, "base", { might: 2, name: "P2 X-ray" }, "x2")
      .hand(P1, BOLT, "bolt")
      .hand(P2, REBUTTAL, "reb");
  }

  async function rebutted(): Promise<Game> {
    const game = await board().build();
    await game.p1.cast("bolt", { targets: "x2" });
    await game.p1.passPriority();
    await game.p2.cast("reb", { targets: "bolt" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    await game.p2.yes(); // pay [rainbow] → gain control
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    return game;
  }

  test("with 0 power left P2 is still offered Pouty Poro; the option reports the surcharge it WOULD incur as `deflectIgnored`", async () => {
    const game = await rebutted();
    const d = game.decision() as PickDecision;
    expect(cards(d).sort()).toEqual(["grunt", "poro"]);
    expect(d.options.find((o) => o.card === "poro")).toMatchObject({ deflectIgnored: 1 });
    expect(d.options.find((o) => o.card === "grunt")?.deflectIgnored).toBeUndefined();
  });

  test("picking Poro is legal and free: no pay prompt, pool unchanged, the item now targets Poro and resolves for 3 (Poro dies)", async () => {
    const game = await rebutted();
    await game.p2.pick("poro");
    expect(game.decision()?.kind).toBe("action");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bolt", controller: P2, targets: ["poro"] })]);
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
  });
});

describe("752.1 modes — a stolen modal spell re-chooses its MODE, then that mode's own target (mandatory once the mode changed)", () => {
  async function stolenFork(): Promise<Game> {
    const game = await base()
      .unit(P1, "base", { might: 5, name: "P1 Alpha" }, "a1", { exhausted: true })
      .unit(P2, "base", { might: 5, name: "P2 X-ray" }, "x2", { exhausted: true })
      .unit(P2, "base", { might: 5, name: "P2 Yankee" }, "y2", { exhausted: true })
      .hand(P1, FORK, "fork")
      .build();
    await reverse(game, "fork", { mode: 0, targets: "x2" }); // P1: "Deal 2 to an enemy unit" → X-ray
    return game;
  }

  test("slot order: MODE first (both bullets offered, current = 0), and its target rides under it as a dependent slot", async () => {
    const game = await stolenFork();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P2, semantics: "mode" });
    expect(d.options.map((o) => o.label)).toEqual(["Deal 2 to an enemy unit", "Ready a friendly unit"]);
    expect(d.newChoices?.slots.map((s) => [s.key, s.parent ?? null])).toEqual([
      ["mode:0", null],
      ["mode-target:0", "mode:0"],
    ]);
  });

  test("declining the mode keeps the WHOLE modal choice (mode 0 on X-ray): no target prompt follows; X-ray is friendly to P2 at resolution → nothing happens", async () => {
    const game = await stolenFork();
    await game.p2.decline();
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    expect(game.state("x2").damage).toBe(0);
    expect(game.state("a1").damage).toBe(0);
  });

  test("naming the SAME mode again is not a new choice but opens its target: P1's Alpha is the only enemy → offered (current X-ray is not); picking Alpha deals it 2", async () => {
    const game = await stolenFork();
    await game.p2.chooseMode(0);
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", semantics: "target" });
    expect(cards(d)).toEqual(["a1"]);
    await game.p2.pick("a1");
    await game.settle();
    expect(game.state("a1").damage).toBe(2);
  });

  test("switching to mode 1 ('Ready a friendly unit') REPLACES mode + target: the target slot is now mandatory (no keep — 753.1) and offers P2's own X-ray / Yankee; the readied unit is the one picked", async () => {
    const game = await stolenFork();
    await game.p2.chooseMode(1);
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", min: 1, semantics: "target" });
    expect(cards(d).sort()).toEqual(["x2", "y2"]);
    expect((await game.p2.try((p) => p.decline())).ok).toBe(false);
    await game.p2.pick("y2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fork", mode: 1, targets: ["y2"] })]);
    await game.settle();
    expect(game.state("y2").isReady).toBe(true);
    expect(game.state("x2").isReady).toBe(false);
  });
});

describe("752.1 destinations — a stolen Move re-chooses its DESTINATION (355.4) as well as its mover", () => {
  async function stolenShove(): Promise<Game> {
    const game = await base()
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 2, name: "P1 Alpha" }, "a1")
      .unit(P2, "base", { might: 2, name: "P2 X-ray" }, "x2")
      .hand(P1, SHOVE, "shove")
      .build();
    await game.p1.cast("shove", { targets: "a1" });
    expect(game.decision()).toMatchObject({ kind: "pick", semantics: "destination", timing: "FIN" });
    await game.p1.pick("battlefield-bf1");
    await game.p1.passPriority();
    await game.p2.cast("mr", { targets: "shove" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    return game;
  }

  test("the dialog lists two slots — the mover (target:0) and, under it, its move destination (dest:0, current bf1)", async () => {
    const game = await stolenShove();
    const d = game.decision() as PickDecision;
    expect(d.newChoices?.slots.map((s) => [s.key, s.kind, s.parent ?? null, s.current])).toEqual([
      ["target:0", "target", null, ["a1"]],
      ["dest:0", "destination", "target:0", ["battlefield-bf1"]],
    ]);
  });

  test("rechoose({destination}) keeps the mover (re-named, so its destination is still asked) and re-routes it to bf2: Alpha ends at bf2", async () => {
    const game = await stolenShove();
    const slots = await game.p2.rechoose({ destination: "bf2" });
    expect(slots.map((s) => [s.key, s.status])).toEqual([
      ["target:0", "renamed"],
      ["dest:0", "open"], // reported as it stood when its own prompt was shown
    ]);
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    await game.settle();
    expect(game.locationOf("a1")).toBe("bf2");
  });

  test("changing the mover to P2's X-ray re-asks the destination for X-ray (locations other than its base — 355.4.a); declining the mover instead skips the destination entirely", async () => {
    const game = await stolenShove();
    await game.p2.pick("x2");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", semantics: "destination" });
    expect(d.options.map((o) => o.zone ?? o.key).sort()).toEqual(["battlefield-bf1", "battlefield-bf2"]);
    await game.p2.pick("bf2");
    await game.settle();
    await game.settle();
    expect(game.locationOf("x2")).toBe("bf2");
    expect(game.locationOf("a1")).toBe("base");

    const other = await stolenShove();
    await other.p2.decline();
    expect(other.decision()?.kind).toBe("action"); // dest:0 skipped with its kept parent
  });
});

describe("752.1 + 355.14 — a Might-reference SOURCE and its split-target SET are both slots; the cap is re-applied against the NEW source (355.14.c)", () => {
  async function stolenAlpha(): Promise<Game> {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .resources(P2, { energy: 4, power: { calm: 3 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { might: 4, name: "P1 Fatty" }, "f")
      .unit(P1, "bf1", { might: 1, name: "P1 Grunt" }, "g")
      .unit(P1, "bf1", { might: 1, name: "P1 Grunt 2" }, "h")
      .unit(P2, "bf2", { might: 1, name: "P2 Solo" }, "s")
      .unit(P2, "bf2", { might: 1, name: "P2 X" }, "x")
      .hand(P1, ALPHA_STRIKE, "alpha")
      .hand(P2, MYSTIC_REVERSAL, "mr")
      .build();
    await reverse(game, "alpha", { targets: ["f", "s", "x"] });
    return game;
  }

  test("slots = [source, split(parent source)]; the source offers P2's own units only, never F", async () => {
    const game = await stolenAlpha();
    const d = game.decision() as PickDecision;
    expect(d.newChoices?.slots.map((s) => [s.key, s.kind, s.parent ?? null])).toEqual([
      ["source", "source", null],
      ["split", "targets", "source"],
    ]);
    expect(cards(d).sort()).toEqual(["s", "x"]);
  });

  test("rechoose({source, split}): new source Solo (1 Might) caps the set at ONE recipient — naming both P1 grunts is refused, one is fine; the item reads [s, g] and resolves for 1 on g", async () => {
    const game = await stolenAlpha();
    await game.p2.pick("s");
    const set = game.decision() as PickDecision;
    expect(set).toMatchObject({ kind: "pick", max: 1, targeting: "split-targets" });
    expect(set.allowDecline).toBe(false); // the old recipients (P2's own units) no longer fit → must re-name (753.1)
    expect(cards(set).sort()).toEqual(["g", "h"]);
    expect((await game.p2.try((p) => p.pick("g", "h"))).ok).toBe(false); // 2 > Solo's 1 Might (355.14.c)
    await game.p2.pick("g");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "alpha", controller: P2, targets: ["s", "g"] })]);
    await game.settle();
    expect(game.state("g").damage + (game.zoneOf("g") === "trash" ? 1 : 0)).toBeGreaterThanOrEqual(1);
    expect(game.state("h").damage).toBe(0);
  });
});

describe("753.2 / 355.10 — nothing to re-choose ⇒ no prompt; objects an instruction merely mentions are not slots", () => {
  test("Cull the Weak ('each player kills one of their units' — 355.10.e, not targeting) stolen: no new-choices prompt at all, straight to P2's priority", async () => {
    const game = await base()
      .unit(P1, "base", { might: 1 }, "a1")
      .unit(P2, "base", { might: 1 }, "x2")
      .hand(P1, "ogn-209-298", "cull")
      .resources(P1, { energy: 2, power: { order: 1 } })
      .build();
    await reverse(game, "cull", { targets: [] });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.gameState.pendingChoice).toBeUndefined();
  });

  test("a single-target spell whose only legal object is the one it already holds: nothing new can be chosen (751.1) ⇒ no prompt", async () => {
    const game = await base().unit(P1, "base", { might: 4, name: "Only enemy" }, "a1").hand(P1, { ...BOLT, abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }], name: "Zap (inline: Deal 3 to a unit)" }, "zap").build();
    await reverse(game, "zap", { targets: "a1" });
    expect(game.decision()).toMatchObject({ kind: "action", seat: P2 });
  });
});

describe("harness — rechoose() / keepChoices() drive the whole dialog from one call", () => {
  test("Ride the Wind stolen: rechoose({target: 'y', destination: 'bf2'}) re-aims AND re-routes; keepChoices() on a fresh copy leaves [a → bf1]", async () => {
    const mk = () =>
      scenario()
        .resources(P1, { energy: 2, power: { chaos: 1 } })
        .resources(P2, { energy: 4, power: { calm: 3 } })
        .battlefield("bf1", { controller: P2 })
        .battlefield("bf2", { controller: null })
        .unit(P1, "base", { might: 3, name: "Unit A" }, "a", { exhausted: true })
        .unit(P2, "base", { might: 2, name: "Unit Y" }, "y", { exhausted: true })
        .hand(P1, RIDE_THE_WIND, "rtw")
        .hand(P2, MYSTIC_REVERSAL, "mr")
        .build();
    const game = await mk();
    await game.p1.cast("rtw", { targets: "a" });
    await game.p1.pick("battlefield-bf1");
    await game.p1.passPriority();
    await game.p2.cast("mr", { targets: "rtw" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    const slots = await game.p2.rechoose({ destination: "bf2", target: "y" });
    expect(slots.map((s) => s.key)).toEqual(["target:0", "dest:0"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P2, targets: ["y"] })]);
    await game.settle();
    expect(game.locationOf("y")).toBe("bf2");
    expect(game.state("y").isReady).toBe(true);

    const kept = await mk();
    await kept.p1.cast("rtw", { targets: "a" });
    await kept.p1.pick("battlefield-bf1");
    await kept.p1.passPriority();
    await kept.p2.cast("mr", { targets: "rtw" });
    await kept.p2.passPriority();
    await kept.p1.passPriority();
    await kept.p2.keepChoices();
    expect(kept.decision()).toMatchObject({ kind: "action", seat: P2 });
    expect(kept.chain()).toEqual([expect.objectContaining({ cardId: "rtw", targets: ["a"] })]);
  });
});

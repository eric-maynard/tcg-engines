/**
 * Interaction: Fallen Feline (ven-132-166) naming a spell — does the prohibition reach every ORIGIN a spell can
 *              be played from: hand, TRASH via [Flow] (Dragon Form, ven-116-166) and FACEDOWN via [Hidden]
 *              (Hidden Blade, ogn-213-298)? And does a refused facedown flip stay private?
 *
 *   Fallen Feline — Unit · Order · 2+[order] · 3 Might
 *     "When you play me, name a spell. While I'm at a battlefield, opponents can't play spells with that name."
 *   Dragon Form — Spell · Order · 3
 *     "Choose a unit. Its base Might becomes 5 this turn. [Flow] [3] (You may play this from your trash for its
 *      Flow cost. Then banish it.)"
 *   Hidden Blade — Spell · Order · 2+[order] · [Hidden] [Action]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   (d) helper: Resonating Strike (ven-034-166) — [Reaction] "Choose a battlefield you control and a unit you
 *     control at a different location. Move that unit to that battlefield and give it +2 [Might] this turn."
 *
 * Question. P2 plays Feline and puts it at bf2.
 *  (a) Feline named "Dragon Form". P1 (own turn, Neutral Open, 6 energy) has Dragon Form in HAND and another in
 *      TRASH ([Flow] [3]). Which are in P1's legal plays while Feline is at bf2? Once Feline is in a base / dead?
 *      Does the name bind P2's own Dragon Form?
 *  (b) Feline named "Hidden Blade". P1 hid a Hidden Blade facedown at bf1 LAST turn and holds a second copy with a
 *      [rainbow] available. Showdown at bf1 on P2's turn, P1 holding Focus: is the flip offered? On P1's own turn:
 *      may P1 HIDE the second copy? Play it normally?
 *  (c) Raw {playSpell dfTrash viaFlow} on board (a) and raw {revealHidden hbDown} on board (b): state afterwards,
 *      and what does P2 learn?
 *  (d) A Dragon Form already finalized on the chain when Feline arrives at a battlefield (moved in by Resonating
 *      Strike in response) — affected?
 *
 * Rules: 054.1 (can't beats can) over every permission — 419.1.a (hand), 829.1.b / 829.1.b.2 (Flow changes only
 * the ZONE a spell may be played from, not its permissions), 811.1.b / 811.6 / 811.1.c.3 (playing from facedown
 * IS playing the card); 811.1.c.1 (Hide is not Play); 829.1.b.1 (a Flow-played spell is banished as it leaves the
 * chain); 358.4 / 358.5 (a play that fails its permission check is undone — nothing happened); 128.4 / 811.6.a
 * (a facedown card is private; its properties are not publicly known); 419.1 (to play = to put on the chain — a
 * spell already there is not being "played" any more; riftjudge 6bfd7130).
 *
 * Expected. (a) Feline at bf2: BOTH the hand copy and the Flow-from-trash copy are ABSENT from P1's legal plays;
 * with Feline in a base or dead both are legal (hand: 3 energy; trash: Flow [3], banished after resolving). P2's
 * own Dragon Form is never restricted. (b) The facedown flip is ABSENT while Feline is at a battlefield; hiding
 * the hand copy IS allowed (it just can't be flipped later); casting the hand copy is forbidden. (c) Both raw
 * moves are refused with zero side effects: trash copy still in trash (not banished, not on the chain), 6 energy
 * intact; the facedown Hidden Blade still facedown at bf1 and P2's view of that slot unchanged (still an
 * anonymous facedown card); chain / Focus / showdown untouched; no kill, no draw. (d) Not affected — the finalized
 * Dragon Form resolves normally; only FURTHER plays are locked once Feline stands at bf2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const FALLEN_FELINE = "ven-132-166";
const DRAGON_FORM = "ven-116-166";
const HIDDEN_BLADE = "ogn-213-298";
const RESONATING_STRIKE = "ven-034-166";

// ── board (a): Feline names "Dragon Form" ─────────────────────────────────────────────────────

/**
 * Turn 2, P2 active with exactly 2 energy + [order] for Feline. bf1 is P1's (holder h1), bf2 is P2's (holder h2).
 * P1: vanilla V (3) in base, Dragon Form in hand AND in trash, Hidden Blade in hand. P2: its own Dragon Form in hand.
 */
function boardA() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "h1")
    .unit(P2, "bf2", { might: 2, name: "P2 Holder" }, "h2")
    .unit(P1, "base", { might: 3, name: "Vanilla V" }, "v")
    .hand(P2, FALLEN_FELINE, "feline")
    .hand(P2, DRAGON_FORM, "dfP2")
    .hand(P1, DRAGON_FORM, "dfHand")
    .trash(P1, DRAGON_FORM, "dfTrash")
    .hand(P1, HIDDEN_BLADE, "hb");
}

/** P2 plays Feline to `to`, its play trigger resolves and P2 names `name`. Still P2's turn afterwards. */
async function felinePlayed(builder: ReturnType<typeof scenario>, to: "bf2" | "base", name: string): Promise<Game> {
  const game = await builder.build();
  await game.p2.play("feline", { to });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "name", seat: P2 });
  await game.p2.name(name);
  expect(game.state("feline").meta.namedCard).toBe(name);
  expect(game.locationOf("feline")).toBe(to);
  return game;
}

/** Board (a) advanced to P1's turn 3 (Neutral Open) with 6 energy + [order] for P1. */
async function p1TurnA(felineAt: "bf2" | "base"): Promise<Game> {
  const game = await felinePlayed(boardA(), felineAt, "Dragon Form");
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 6, power: { order: 1 } });
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

// ── board (b): Feline names "Hidden Blade" ────────────────────────────────────────────────────

/**
 * Turn 2, P2 active. bf1 (P1, holder h1) has P1's Hidden Blade FACEDOWN since an earlier turn; bf3 is also P1's
 * (holder h3, no facedown card); bf2 is P2's. P2 has attacker A (4) in base. P1 holds a second Hidden Blade and
 * has 2 energy + [order] + [rainbow].
 */
function boardB() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { energy: 2, power: { order: 1 } })
    .resources(P1, { energy: 2, power: { order: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "h1")
    .unit(P1, "bf3", { might: 2, name: "P1 Holder 3" }, "h3")
    .unit(P2, "bf2", { might: 2, name: "P2 Holder" }, "h2")
    .unit(P2, "base", { might: 4, name: "Attacker A" }, "a")
    .facedown(P1, "bf1", HIDDEN_BLADE, "hbDown")
    .hand(P2, FALLEN_FELINE, "feline")
    .hand(P1, HIDDEN_BLADE, "hbHand");
}

/** Board (b), Feline at `felineAt`; P2 attacks bf1 with A and passes Focus → P1 holds Focus in the showdown at bf1. */
async function showdownAtBf1(felineAt: "bf2" | "base"): Promise<Game> {
  const game = await felinePlayed(boardB(), felineAt, "Hidden Blade");
  await game.p2.move("a", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Fallen Feline's named-spell lock vs hand, Flow-from-trash and facedown origins", () => {
  // ── (a) Dragon Form: hand + Flow ─────────────────────────────────────────────────────────────

  test("(a) while Feline (naming Dragon Form) is at bf2, NEITHER the hand copy NOR the Flow-from-trash copy is in P1's legal plays (054.1 over 419.1.a and 829.1.b)", async () => {
    const game = await p1TurnA("bf2");
    expect(game.p1.can("cast", "dfHand")).toBe(false);
    expect(game.p1.can("cast", "dfTrash")).toBe(false);
    expect(game.p1.legal().filter((o) => o.card === "dfHand" || o.card === "dfTrash")).toEqual([]);
    await expect(game.p1.cast("dfHand", { targets: "v" })).rejects.toThrow();
    await expect(game.p1.cast("dfTrash", { flow: true, targets: "v" })).rejects.toThrow();
    // a differently-named spell is untouched by the lock
    expect(game.p1.can("cast", "hb")).toBe(true);
  });

  test("(a) control — Feline played to P2's BASE instead: both copies are legal; the hand copy costs 3 energy and resolves (V → 5 Might)", async () => {
    const game = await p1TurnA("base");
    expect(game.p1.can("cast", "dfHand")).toBe(true);
    expect(game.p1.can("cast", "dfTrash")).toBe(true);
    await game.p1.cast("dfHand", { targets: "v" });
    expect(game.p1.energy()).toBe(3);
    await game.settle();
    expect(game.state("v").might).toBe(5);
    expect(game.zoneOf("dfHand")).toBe("trash");
  });

  test("(a) control — with Feline in base the TRASH copy plays via Flow for exactly [3] and is BANISHED after it leaves the chain (829.1.b.1)", async () => {
    const game = await p1TurnA("base");
    const flow = game.p1.option("cast", "dfTrash")?.fields.find((f) => f.name === "viaFlow");
    expect(flow?.options).toEqual([true]); // from trash it is ONLY playable via Flow
    await game.p1.cast("dfTrash", { flow: true, targets: "v" });
    expect(game.p1.energy()).toBe(3);
    expect(game.zoneOf("dfTrash")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("dfTrash")).toBe("banishment");
    expect(game.state("v").might).toBe(5);
  });

  test("(a) the moment Feline DIES (P1's differently-named Hidden Blade kills it; P2 draws 2) both Dragon Forms reappear, and the Flow copy plays for [3] and is banished", async () => {
    const game = await p1TurnA("bf2");
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("hb", { targets: "feline" });
    await game.settle();
    expect(game.zoneOf("feline")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("cast", "dfHand")).toBe(true);
    expect(game.p1.can("cast", "dfTrash")).toBe(true);
    await game.p1.cast("dfTrash", { flow: true, targets: "v" });
    expect(game.p1.energy()).toBe(1);
    await game.settle();
    expect(game.zoneOf("dfTrash")).toBe("banishment");
    expect(game.state("v").might).toBe(5);
  });

  test("(a) 'opponents' — P2's OWN Dragon Form is castable on P2's turn while its Feline sits at bf2", async () => {
    const game = await felinePlayed(boardA(), "bf2", "Dragon Form");
    await game.p2.do("addResources", { energy: 3 });
    expect(game.p2.can("cast", "dfP2")).toBe(true);
    await game.p2.cast("dfP2", { targets: "h2" });
    await game.settle();
    expect(game.state("h2").might).toBe(5);
    expect(game.zoneOf("dfP2")).toBe("trash");
  });

  // ── (b) Hidden Blade: facedown flip / hide / hand ────────────────────────────────────────────

  test("(b) showdown at bf1 on P2's turn, P1 holding Focus: the facedown Hidden Blade flip is NOT offered while Feline (naming it) is at bf2 (811.1.c.3 — the flip is a play)", async () => {
    const game = await showdownAtBf1("bf2");
    expect(game.p1.can("reveal", "hbDown")).toBe(false);
    expect(game.p1.legal().filter((o) => o.card === "hbDown")).toEqual([]);
    await expect(game.p1.reveal("hbDown", { answers: ["a"] })).rejects.toThrow();
    // the hand copy ([Action] → legal timing in a showdown) is name-locked too
    expect(game.p1.can("cast", "hbHand")).toBe(false);
  });

  test("(b) control — same showdown with Feline in P2's BASE: the flip IS offered (and so is the hand copy via [Action])", async () => {
    const game = await showdownAtBf1("base");
    expect(game.p1.can("reveal", "hbDown")).toBe(true);
    expect(game.p1.can("cast", "hbHand")).toBe(true);
    await game.p1.reveal("hbDown", { answers: ["a"] }); // its target (a unit at bf1) is asked as it is played
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hbDown", controller: P1, targets: ["a"] })]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1, rainbow: 1 } }); // the flip itself is free here
  });

  test("(b) on P1's OWN turn HIDING the second copy is allowed — Hide is not Play (811.1.c.1) — for the [rainbow]; playing it normally and flipping the old one stay forbidden", async () => {
    const game = await felinePlayed(boardB(), "bf2", "Hidden Blade");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 2, power: { order: 1, rainbow: 1 } });
    expect(game.p1.can("cast", "hbHand")).toBe(false);
    expect(game.p1.can("reveal", "hbDown")).toBe(false);
    expect(game.p1.can("hide", "hbHand")).toBe(true);
    await game.p1.hide("hbHand", "bf3");
    expect(game.zoneOf("hbHand")).toBe("facedown-bf3");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.power()).toBe(1); // exactly one power (any domain) paid for the Hide
    expect(game.chain()).toEqual([]); // 811.1.c.2 — hiding opens no chain
  });

  // ── (c) rollback / privacy of the refused plays ──────────────────────────────────────────────

  test("(c) raw playSpell{dfTrash, viaFlow} while locked is refused with NO side effects: still in trash (not banished, not on the chain), 6 energy intact, same open decision (358.5)", async () => {
    const game = await p1TurnA("bf2");
    const before = game.decision();
    const r = await game.p1.try((p) => p.do("playSpell", { cardId: "dfTrash", targets: ["v"], viaFlow: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("dfTrash")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 6, power: { order: 1 } });
    expect(game.state("v").might).toBe(3);
    expect(game.decision()).toMatchObject({ context: "main", id: before?.id, kind: "action", seat: P1 });
    // the hand copy likewise
    const r2 = await game.p1.try((p) => p.do("playSpell", { cardId: "dfHand", targets: ["v"] }));
    expect(r2.ok).toBe(false);
    expect(game.zoneOf("dfHand")).toBe("hand");
    expect(game.p1.energy()).toBe(6);
  });

  test("(c) raw revealHidden{hbDown} while locked is refused with NO side effects: still facedown at bf1, chain empty, P1 still holds Focus, pool intact, nobody killed, nobody drew", async () => {
    const game = await showdownAtBf1("bf2");
    const before = game.decision();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const r = await game.p1.try((p) => p.do("revealHidden", { cardId: "hbDown", targets: ["a"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("hbDown")).toBe("facedown-bf1");
    expect(game.state("hbDown").isHidden).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", id: before?.id, kind: "action", seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1, rainbow: 1 } });
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  });

  test("(c) privacy — the refusal reveals nothing to P2: its view of the bf1 facedown slot is the same anonymous facedown card before and after (128.4, 811.6.a)", async () => {
    const game = await showdownAtBf1("bf2");
    const slotBefore = game.p2.view().zones["facedown-bf1"] ?? [];
    expect(slotBefore).toHaveLength(1);
    expect(isHiddenView(slotBefore[0]!)).toBe(true);
    const bfBefore = game.p2.view().battlefields.find((b) => b.id === "bf1");
    await game.p1.try((p) => p.do("revealHidden", { cardId: "hbDown", targets: ["a"] }));
    const slotAfter = game.p2.view().zones["facedown-bf1"] ?? [];
    expect(slotAfter).toEqual(slotBefore);
    expect(JSON.stringify(slotAfter)).not.toContain("hbDown");
    expect(JSON.stringify(slotAfter)).not.toContain("Hidden Blade");
    expect(game.p2.view().battlefields.find((b) => b.id === "bf1")).toEqual(bfBefore);
    expect(game.p2.view().chain).toEqual([]);
  });

  // ── (d) a Dragon Form already on the chain ───────────────────────────────────────────────────

  test("(d) a Dragon Form FINALIZED on the chain before Feline reaches a battlefield (Resonating Strike moves it to bf2 in response) still resolves normally — Feline only stops further PLAYS (419.1; riftjudge 6bfd7130)", async () => {
    const game = await felinePlayed(
      scenario()
        .turn(2)
        .active(P2)
        .resources(P2, { energy: 2, power: { order: 1 } })
        .battlefield("bf1", { controller: P1 })
        .battlefield("bf2", { controller: P2 })
        .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "h1")
        .unit(P2, "bf2", { might: 2, name: "P2 Holder" }, "h2")
        .unit(P1, "base", { might: 3, name: "Vanilla V" }, "v")
        .hand(P2, FALLEN_FELINE, "feline")
        .hand(P2, RESONATING_STRIKE, "strike")
        .hand(P1, DRAGON_FORM, "dfHand")
        .trash(P1, DRAGON_FORM, "dfTrash"),
      "base",
      "Dragon Form",
    );
    await game.advanceTurn();
    await game.p1.do("addResources", { energy: 6 });
    await game.p2.do("addResources", { energy: 2, power: { calm: 1 } });
    await game.p1.cast("dfHand", { targets: "v" });
    await game.p1.passPriority();
    await game.p2.cast("strike", { targets: "feline" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dfHand", "strike"]);
    // Strike resolves first (LIFO): Feline now stands at bf2 while Dragon Form is still on the chain.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["dfHand"]);
    expect(game.locationOf("feline")).toBe("bf2");
    // Dragon Form resolves untouched.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dfHand")).toBe("trash");
    expect(game.state("v").might).toBe(5);
    // …but from now on the lock is live: the Flow copy in trash is no longer a legal play.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.can("cast", "dfTrash")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Interaction: Last Rites (sfd-150-221) Equipment · Chaos · 3 energy · +2
 *     "[Equip] — [chaos], Recycle 2 cards from your trash"
 *     Effect Text: "When I conquer or hold, you may play a unit from your trash. (You still pay its costs.)"
 *   × Veteran Poro (sfd-099-221) Unit · Body · 2 energy · 2 Might · [Weaponmaster]
 *
 * Rules: 818.1.b / 818.1.c.3 (Equip is an activated ability whose cost — resource AND non-resource
 * halves — must be payable in full to activate), 821.1.c / 821.1.c.2 / 821.1.c.3 (Weaponmaster pays the
 * Equip cost "reduced by [A]": only a power pip is shaved, the Recycle-2 half is owed in full),
 * 821.1.c.5 (if the reduced cost can't be paid the Equipment stays where it is — nothing is partially
 * paid), 821.1.c.6 (the Equip ability is not activated this way), 718.3 / 718.4 / 724 (while attached
 * the +2 bonus applies and the Effect Text trigger is appended to the bearer; loose, it is Inactive).
 *
 * Question / expected:
 *  (a) Poro played with exactly 2 cards in trash and NO chaos → Weaponmaster attaches Last Rites: the
 *      [chaos] pip is waived, the 2 cards are recycled (trash → bottom of main deck), Poro 2+2 = 4.
 *  (b) Only 1 card in trash (plenty of chaos) → cost unpayable: Last Rites is not offered, stays loose,
 *      no chaos spent, the lone card is not recycled, Poro is 2.
 *  (c) Plain [Equip]: chaos + 1 trash → not enumerated; 2 trash + no chaos → not enumerated; both →
 *      legal: pay [chaos] + recycle 2, ability on the chain, attaches on resolution (+2, trigger live).
 *  (d) After (a) the recycled cards are under the deck, not in the trash — the conquer/hold trigger can
 *      only offer units still in the trash.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAST_RITES = "sfd-150-221";
const VETERAN_PORO = "sfd-099-221";
/** A free 1-Might unit for the trash — playable "from your trash" without any resources. */
const GHOUL = { cardType: "unit", energyCost: 0, might: 1, name: "Ghoul" };

/** P1's turn: Last Rites loose in base, Poro in hand (2 energy for it), `trash` Ghouls t1..tn in P1's trash, P1 holds bf1. */
function poroBoard(trash: number, power: Record<string, number> = {}) {
  const b = scenario()
    .resources(P1, { energy: 2, power })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, LAST_RITES, "rites")
    .hand(P1, VETERAN_PORO, "poro");
  for (let i = 1; i <= trash; i++) {
    b.trash(P1, GHOUL, `t${i}`);
  }
  return b;
}

/** P1's turn, no Weaponmaster: Last Rites loose, a 2-Might Squire in base, P2's 3-Might Guard on bf1, `trash` Ghouls, `power` floating. */
function equipBoard(trash: number, power: Record<string, number>) {
  const b = scenario()
    .resources(P1, { power })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .gear(P1, LAST_RITES, "rites");
  for (let i = 1; i <= trash; i++) {
    b.trash(P1, GHOUL, `t${i}`);
  }
  return b;
}

const equipOption = (game: Game) => game.p1.legal().find((o) => o.moveId === "equipCard");
const pickOptions = (game: Game) => {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
};

/** Answer the "pick cards to recycle" cost prompt(s) with `keys` (the engine may ask one at a time). */
async function recycle(game: Game, keys: string[]): Promise<void> {
  const left = [...keys];
  for (let i = 0; i < 4 && left.length > 0; i++) {
    // rule 383.3.b / 204.3.b: on the [Weaponmaster] path the pick only finalizes
    // the trigger — "Pay the cost of its Equip ability … to attach it" is a cost
    // in a LATER instruction, so the Recycle-2 prompt opens when that trigger
    // resolves off the chain. Settle first, then answer it.
    if (game.decision()?.kind !== "pick") {
      await game.settle();
    }
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1 || d.semantics === "equip") {
      return;
    }
    const take = left.splice(0, Math.max(1, Math.min(d.max, left.length)));
    await game.p1.pick(...take);
  }
}

/** Cards offered by a "you may play a unit from your trash" prompt, walking through a yes/no gate if the engine uses one. */
async function trashPlayOffer(game: Game): Promise<string[]> {
  const d = game.decision();
  if (d?.kind === "yes-no" && d.seat === P1) {
    // opt-in is answered at finalization; the offer itself comes when the item resolves
    await game.p1.yes();
    await game.settle();
  }
  return pickOptions(game);
}

describe("(a) Weaponmaster + exactly 2 in trash + NO chaos: the pip is waived, Recycle 2 is still paid, Last Rites attaches", () => {
  test("Last Rites is offered by the Weaponmaster prompt even though P1 has no power at all", async () => {
    const game = await poroBoard(2).build();
    await game.p1.play("poro", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "equip" });
    expect(pickOptions(game)).toEqual(["rites"]);
  });

  test("choosing it asks for the 2 cards to recycle (the non-resource half is not discounted, 821.1.c.3) — both trash cards go to the BOTTOM of the main deck", async () => {
    const game = await poroBoard(2).build();
    const deckBefore = game.p1.deck().length;
    await game.p1.play("poro", { to: "base" });
    await game.p1.pick("rites");
    // rule 383.3.b / 204.3.b: the Recycle-2 half is part of "Pay … to attach it",
    // a later instruction — it is asked for when the trigger resolves, not now.
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(pickOptions(game).sort()).toEqual(["t1", "t2"]);
    await recycle(game, ["t1", "t2"]);
    await game.settle();
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(deckBefore + 2);
    expect(game.p1.deck().slice(-2).sort()).toEqual(["t1", "t2"]);
    expect(game.zoneOf("t1")).toBe("mainDeck");
  });

  test("on resolution Last Rites is attached: Poro 2 + 2 = 4, no power spent, no [Equip] chain item (821.1.c.6)", async () => {
    const game = await poroBoard(2).build();
    await game.p1.play("poro", { to: "base" });
    await game.p1.pick("rites");
    await recycle(game, ["t1", "t2"]);
    await game.settle();
    expect(game.state("rites").attachedTo).toBe("poro");
    expect(game.state("poro")).toMatchObject({ attachments: ["rites"], baseMight: 2, might: 4 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Weaponmaster + only 1 in trash (chaos to spare): the cost can't be paid — nothing attaches, nothing is partially paid (821.1.c.5)", () => {
  test("Last Rites is not offered; Poro stays 2, both chaos untouched, the lone trash card is not recycled", async () => {
    const game = await poroBoard(1, { chaos: 2 }).build();
    await game.p1.play("poro", { to: "base" });
    expect(pickOptions(game)).not.toContain("rites"); // at most an empty, declinable "you may"
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ allowDecline: true });
    }
    await game.settle();
    expect(game.state("rites")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.state("poro")).toMatchObject({ attachments: [], might: 2 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 2 } });
    expect(game.p1.trash()).toEqual(["t1"]);
    expect(game.zoneOf("t1")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("control: the same board with a SECOND trash card flips it — Last Rites is offered (the trash count, not the chaos, was the gate)", async () => {
    const game = await poroBoard(2, { chaos: 2 }).build();
    await game.p1.play("poro", { to: "base" });
    expect(pickOptions(game)).toEqual(["rites"]);
    await game.p1.pick("rites");
    await recycle(game, ["t1", "t2"]);
    await game.settle();
    expect(game.state("poro").might).toBe(4);
    expect(game.p1.power("chaos")).toBe(2); // Weaponmaster still waives the pip even when it could be paid
  });
});

describe("(c) plain [Equip] without Weaponmaster: the WHOLE cost ([chaos] AND recycle 2) gates activation (818.1.b / 818.1.c.3)", () => {
  test("[chaos] floating but only 1 card in trash → not a legal activation: not enumerated, and a forced attempt is rejected", async () => {
    const game = await equipBoard(1, { chaos: 1 }).build();
    expect(equipOption(game)).toBeUndefined();
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "rites", unitId: "squire" }))).ok).toBe(false);
    expect(game.p1.power("chaos")).toBe(1);
    expect(game.p1.trash()).toEqual(["t1"]);
    expect(game.state("rites").attachedTo).toBeUndefined();
  });

  test("2 cards in trash but no chaos (only off-domain power) → not a legal activation either", async () => {
    const game = await equipBoard(2, { fury: 2 }).build();
    expect(equipOption(game)).toBeUndefined();
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "rites", unitId: "squire" }))).ok).toBe(false);
    expect(game.p1.trash().sort()).toEqual(["t1", "t2"]);
    const none = await equipBoard(2, {}).build();
    expect(equipOption(none)).toBeUndefined();
  });

  test("both → legal: [chaos] is spent and 2 cards are recycled at activation, the ability sits on the chain, and on resolution Last Rites attaches for +2 (Squire 4)", async () => {
    const game = await equipBoard(3, { chaos: 1 }).build();
    const opt = equipOption(game);
    expect(opt).toBeDefined();
    expect(opt?.fields.find((f) => f.name === "unitId")?.options).toEqual(["squire"]);
    await game.p1.do("equipCard", { equipmentId: "rites", unitId: "squire" });
    expect(pickOptions(game).sort()).toEqual(["t1", "t2", "t3"]); // the payer chooses which two
    await recycle(game, ["t1", "t2"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p1.trash()).toEqual(["t3"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rites", controller: P1, triggered: false })]);
    expect(game.state("rites").attachedTo).toBeUndefined(); // not yet — attaches on resolution
    await game.settle();
    expect(game.state("rites").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ attachments: ["rites"], baseMight: 2, might: 4 });
    expect(game.p1.deck().slice(-2).sort()).toEqual(["t1", "t2"]);
  });

  test("once attached, the Effect Text is live on the bearer (718.3 / 724) — the equipped Squire conquering bf1 must ask 'you may play a unit from your trash' and offer the Ghoul still there", async () => {
    // Expected: Squire (4) kills the 3-Might Guard, conquers bf1, and Last Rites' appended "When I conquer…"
    // trigger prompts P1 (yes/no or a pick) offering t3 — accepting plays the free Ghoul out of the trash.
    // Actual: the Effect Text is not parsed into an ability at all; the conquer scores with no prompt.
    const game = await equipBoard(3, { chaos: 1 }).build();
    await game.p1.do("equipCard", { equipmentId: "rites", unitId: "squire" });
    await recycle(game, ["t1", "t2"]);
    await game.settle();
    expect(game.state("squire").might).toBe(4);
    await game.p1.move("squire", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(["yes-no", "pick"]).toContain(game.decision()?.kind);
    expect(game.decision()?.seat).toBe(P1);
    expect(await trashPlayOffer(game)).toEqual(["t3"]);
    await game.p1.pick("t3");
    // rule 355.2: the performer picks where the played unit lands
    if (game.decision()?.semantics === "destination") {
      await game.p1.pick("base");
    }
    await game.settle();
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("t3"));
    expect(game.p1.trash()).not.toContain("t3");
  });

  test("negative space (724): with Last Rites LOOSE in base its Effect Text is Inactive — a bare Squire conquering asks nothing", async () => {
    const game = await equipBoard(3, { chaos: 1 }).unit(P1, "base", { might: 4, name: "Brute" }, "brute").build();
    await game.p1.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.trash().sort()).toEqual(["t1", "t2", "t3"]);
  });
});

describe("(d) after the Weaponmaster equip the recycled cards are under the deck — only units STILL in the trash can be played off the conquer/hold trigger", () => {
  test("state check: t1/t2 are in the main deck (bottom), t3 alone remains in the trash, Poro (4) sits on bf1 wearing Last Rites", async () => {
    const game = await poroBoard(3).build();
    await game.p1.play("poro", { to: "bf1" });
    await game.p1.pick("rites");
    await recycle(game, ["t1", "t2"]);
    await game.settle();
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("poro")).toMatchObject({ attachments: ["rites"], might: 4 });
    expect(game.p1.trash()).toEqual(["t3"]);
    expect(game.zoneOf("t1")).toBe("mainDeck");
    expect(game.zoneOf("t2")).toBe("mainDeck");
    expect(game.p1.deck().slice(-2).sort()).toEqual(["t1", "t2"]);
  });

  test("at P1's next Beginning Phase the equipped Poro HOLDS bf1 → 'you may play a unit from your trash' offers exactly t3 (t1/t2 left the trash and are not eligible)", async () => {
    // Expected: after P2's turn, P1 holds bf1 (1 point) and Last Rites' appended hold trigger prompts P1; the
    // offer is [t3] only — the two recycled Ghouls are on the bottom of the deck, not in the trash.
    // Actual: the hold scores but no trigger exists (Effect Text unparsed), so P1 lands straight in main phase.
    const game = await poroBoard(3).build();
    await game.p1.play("poro", { to: "bf1" });
    await game.p1.pick("rites");
    await recycle(game, ["t1", "t2"]);
    await game.settle();
    await game.advanceTurn(); // → P2's main phase
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.endTurn(); // → P1's Beginning Phase: hold
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(["yes-no", "pick"]).toContain(game.decision()?.kind);
    expect(game.decision()?.seat).toBe(P1);
    const offered = await trashPlayOffer(game);
    expect(offered).toEqual(["t3"]);
    expect(offered).not.toContain("t1");
    expect(offered).not.toContain("t2");
  });
});

/**
 * Interaction: Last Rites (sfd-150-221) · Equipment · Chaos · 3 · +2
 *     Effect Text: "When I conquer or hold, you may play a unit from your trash. (You still pay its costs.)"
 *   × Rhasa the Sunderer (ogn-195-298) · Unit · Chaos · 10+[chaos] · 6 Might
 *     "I cost [1] less for each card in your trash."
 *   × Disposal Order (unl-103-219) · Spell · Body · 2 · [Reaction]
 *     "Choose one — Choose up to 3 cards from opponents' trashes. Their owners recycle them. / Draw 1."
 *
 * Question: P1's Bearer (wearing Last Rites) conquers the empty bf1 → the Last Rites trigger goes on the chain,
 * P2 gets a reaction window, it resolves. P1's trash = Rhasa + exactly 8 non-unit cards (9 total); P1 has 1 chaos.
 *   (a) YES — P1 has 2 energy: is Rhasa offered? Does it cost 1 (10−9, counting itself) or 2 (10−8)? Where may
 *       it be played and how does it enter?
 *   (b) NO — P1 has 1 energy: is Rhasa offered at all? Any prompt if Rhasa is the only unit in the trash?
 *   (c) NO-2 — 2 energy but P2 REACTS with Disposal Order recycling 3 fillers: offered? at what cost?
 *   (d) Rollback probe: if P1 somehow names Rhasa when it is unaffordable — where is Rhasa, what happened to
 *       P1's energy/chaos and to the trigger?
 *
 * Rules: 419.3.a/419.3.b (a play by effect follows every normal step; no timing keyword needed), 354.2 (step 1:
 * the card moves trash → Chain BEFORE …), 356.4 (… step 3 applies discounts — Rhasa no longer counts itself),
 * 357.1 (pay), 355.2.a (a unit is played to your base or a battlefield you control — including the one just
 * conquered), 359.2.c (units enter exhausted), 419.3.c (no eligible card → nothing happens, no prompt),
 * 337.2 / LIFO (Disposal Order resolves before the trigger; cost is computed when the card is actually played),
 * 358.2/358.5 (an unpaid play is undone: the card returns to its origin zone, nothing spent).
 * Rulings 1ad7a1b2991b4424 / ec501eef3dd89d2b / ba826062bc0141d7.
 *
 * Expected: (a) offered; costs 2 + [chaos] (pool 2/1 → 0/0); destinations = P1 base | bf1 (never P2's bf2);
 * enters exhausted. (b) true cost 2 > 1 → NOT offered; with no other unit nothing is asked at all — the trigger
 * just leaves the chain; Rhasa in trash, 1 energy + chaos untouched. (c) Disposal Order resolves first, trash =
 * Rhasa + 5 → Rhasa would cost 5 > 2 → not offered; resources untouched. (d) The engine filters up front, so
 * naming Rhasa is rejected; either way the invariant holds: Rhasa in the TRASH (not hand/banish/board), energy
 * and chaos intact, no chain item left, no swap to Rhasa possible.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAST_RITES = "sfd-150-221";
const RHASA = "ogn-195-298";
const DISPOSAL_ORDER = "unl-103-219";
/** Non-unit trash filler (a 1-cost Action spell) — counts for Rhasa, never playable off Last Rites. */
const FILLER_SPELL = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Filler Spell",
  timing: "action",
};
/** A free 1-Might unit — an always-affordable alternative for the offer-set contrast. */
const GHOUL = { cardType: "unit", energyCost: 0, might: 1, name: "Ghoul" };

interface BoardOpts {
  readonly energy: number;
  /** Replace filler f8 with a free Ghoul unit (trash count stays 9). */
  readonly ghoul?: boolean;
}

/**
 * P1's turn, Neutral Open. P1: `energy` + 1 chaos; Bearer (3, wearing Last Rites → 5) in base; bf1 empty and
 * uncontrolled (conquerable by just walking in); trash = Rhasa + f1..f8 (or f1..f7 + Ghoul). P2: 2 energy +
 * Disposal Order in hand, a Guard holding bf2 (a battlefield P1 does NOT control).
 */
function board({ energy, ghoul = false }: BoardOpts) {
  const s = scenario()
    .resources(P1, { energy, power: { chaos: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Bearer" }, "bearer", { equippedWith: ["rites"] })
    .card("rites", { def: LAST_RITES, meta: { attachedTo: "bearer" }, owner: P1, zone: "base" })
    .trash(P1, RHASA, "rhasa")
    .hand(P2, DISPOSAL_ORDER, "disposal");
  for (let i = 1; i <= (ghoul ? 7 : 8); i++) {
    s.trash(P1, FILLER_SPELL, `f${i}`);
  }
  return ghoul ? s.trash(P1, GHOUL, "ghoul") : s;
}

/** Bearer walks into bf1; the (auto-begun) showdown passes; P1 conquers → Last Rites' "you may" opt-in is asked. */
async function conquer(opts: BoardOpts): Promise<Game> {
  const game = await board(opts).build();
  expect(game.state("bearer")).toMatchObject({ attachments: ["rites"], might: 5 });
  expect(game.p1.trash()).toHaveLength(9);
  await game.p1.move("bearer", "bf1");
  await game.settle();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  return game;
}

/** Opt in, then P1 and P2 pass so the Last Rites trigger resolves (nobody reacts). */
async function optInAndResolve(game: Game): Promise<void> {
  await game.p1.yes();
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bearer", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's reaction window
  await game.p2.passPriority();
}

const pickOffer = (game: Game): string[] => {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
};

describe("the trigger itself", () => {
  test("conquering with the equipped Bearer puts Last Rites' triggered item on the chain (after the opt-in) and P2 gets a reaction window where Disposal Order is castable", async () => {
    const game = await conquer({ energy: 2 });
    await game.p1.yes();
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "bearer", controller: P1, triggered: true });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disposal")).toBe(true);
    // Nothing has been offered / paid yet — the play happens on RESOLUTION.
    expect(game.zoneOf("rhasa")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
  });
});

describe("(a) YES — 2 energy + chaos: Rhasa costs 10 − 8 = 2 (it does not count itself)", () => {
  test("on resolution Rhasa IS offered by the 'play a unit from your trash' pick (the 8 spells are not units and are never offered)", async () => {
    const game = await conquer({ energy: 2 });
    await optInAndResolve(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed" });
    expect(pickOffer(game)).toEqual(["rhasa"]);
  });

  test("picking Rhasa moves it to the chain first (354.2), then asks WHERE: P1's base or bf1 (just conquered, 355.2.a) — never P2's bf2", async () => {
    const game = await conquer({ energy: 2 });
    await optInAndResolve(game);
    await game.p1.pick("rhasa");
    expect(game.zoneOf("rhasa")).toBe("chain");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const dests = (d?.kind === "pick" ? d.options.map((o) => o.key) : []).sort();
    expect(dests).toEqual(["base", "battlefield-bf1"]);
  });

  test("played to bf1: P1 pays exactly 2 energy + the chaos (pool 2/1 → 0/0 — NOT 1 energy), Rhasa enters EXHAUSTED at bf1, trash drops to the 8 spells (359.2.c)", async () => {
    const game = await conquer({ energy: 2 });
    await optInAndResolve(game);
    await game.p1.pick("rhasa");
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.state("rhasa")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    expect(game.p1.trash().sort()).toEqual(["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("discriminates the self-count: with 3 energy the same play leaves exactly 1 energy (cost 2), not 2 (cost 1)", async () => {
    const game = await conquer({ energy: 3 });
    await optInAndResolve(game);
    await game.p1.pick("rhasa");
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("rhasa")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 0 } });
  });
});

describe("(b) NO — 1 energy: true cost 2 is unaffordable, so Rhasa is not an eligible choice", () => {
  test("Rhasa the only unit in trash → NO prompt at all (419.3.c): after both passes the trigger simply leaves the chain and P1 is back in its open main phase", async () => {
    const game = await conquer({ energy: 1 });
    await optInAndResolve(game);
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
  });

  test("nothing moved, nothing spent: Rhasa still in the TRASH (not hand / banishment / board), 1 energy + chaos intact, trash still 9", async () => {
    const game = await conquer({ energy: 1 });
    await optInAndResolve(game);
    await game.settle();
    expect(game.zoneOf("rhasa")).toBe("trash");
    expect(game.p1.hand()).not.toContain("rhasa");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.units()).toEqual(["bearer"]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 1 } });
    expect(game.p1.trash()).toHaveLength(9);
    expect(game.violations()).toEqual([]);
  });

  test("offer-set contrast: with a free Ghoul also in the trash (still 9 cards → Rhasa would cost 2) and 1 energy, the pick offers ONLY the Ghoul — a self-counting engine (10−9=1) would wrongly list Rhasa too", async () => {
    const game = await conquer({ energy: 1, ghoul: true });
    await optInAndResolve(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickOffer(game)).toEqual(["ghoul"]);
    expect(pickOffer(game)).not.toContain("rhasa");
  });

  test("(d) rollback probe: naming Rhasa anyway is REJECTED; afterwards Rhasa is still in the trash, energy/chaos untouched, and the same prompt (Ghoul only) is still open — no partial play, no swap to Rhasa", async () => {
    const game = await conquer({ energy: 1, ghoul: true });
    await optInAndResolve(game);
    const r = await game.p1.try((p) => p.pick("rhasa"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rhasa")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 1 } });
    expect(pickOffer(game)).toEqual(["ghoul"]);
    // Taking the legal Ghoul completes the trigger normally.
    await game.p1.pick("ghoul");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("base");
    }
    await game.settle();
    expect(["base", "battlefield-bf1"]).toContain(game.zoneOf("ghoul"));
    expect(game.zoneOf("rhasa")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { chaos: 1 } }); // the Ghoul is free
    expect(game.chain()).toEqual([]);
  });
});

describe("(c) NO-2 — 2 energy, but P2 reacts with Disposal Order recycling 3 fillers", () => {
  /** Opt in, P1 passes, P2 casts Disposal Order (mode 0: recycle f1,f2,f3) in the reaction window. */
  async function p2Reacts(): Promise<Game> {
    const game = await conquer({ energy: 2 });
    await game.p1.yes();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("disposal", { mode: 0, targets: ["f1", "f2", "f3"] });
    return game;
  }

  test("Disposal Order lands ABOVE the Last Rites trigger (chain bottom→top = [trigger, Disposal Order]) and P2 paid 2 energy", async () => {
    const game = await p2Reacts();
    expect(game.chain().map((i) => i.cardId)).toEqual(["bearer", "disposal"]);
    expect(game.chain()[1]).toMatchObject({ controller: P2, mode: 0, targets: ["f1", "f2", "f3"], triggered: false });
    expect(game.p2.energy()).toBe(0);
  });

  test("LIFO (337.2): Disposal Order resolves first — f1..f3 go to the bottom of P1's deck, trash = Rhasa + 5 — while the trigger still waits", async () => {
    const game = await p2Reacts();
    await game.p2.passPriority();
    await game.p1.passPriority(); // → Disposal Order resolves
    expect(game.zoneOf("disposal")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["f4", "f5", "f6", "f7", "f8", "rhasa"]);
    expect(game.zoneOf("f1")).toBe("mainDeck");
    expect(game.chain().map((i) => i.cardId)).toEqual(["bearer"]);
  });

  test("when the trigger then resolves Rhasa would cost 10 − 5 = 5 > 2 → it is NOT offered, no prompt appears, and P1 keeps 2 energy + chaos with Rhasa still in the trash", async () => {
    const game = await p2Reacts();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Disposal Order resolves
    await game.p1.passPriority();
    await game.p2.passPriority(); // Last Rites trigger resolves
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("rhasa")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1 } });
    expect(game.p1.units()).toEqual(["bearer"]);
    expect(game.violations()).toEqual([]);
  });

  test("control: the same line WITHOUT the reaction (P2 just passes) does offer Rhasa — the cost is fixed at resolution, not when the trigger was put on the chain", async () => {
    const game = await conquer({ energy: 2 });
    await optInAndResolve(game);
    expect(pickOffer(game)).toEqual(["rhasa"]);
  });
});

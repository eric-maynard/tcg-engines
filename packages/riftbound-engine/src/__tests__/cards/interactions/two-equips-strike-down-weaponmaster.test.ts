/**
 * Interaction: Strike Down (sfd-107-221) · Spell · Body · 3 + [body]
 *     "Choose an equipped friendly unit. It deals damage equal to its Might to an enemy unit. Then detach an
 *      Equipment from it."
 *   × Doran's Shield (sfd-033-221) · Equipment · Calm · +1 · "[Equip] [calm]" / Effect Text "[Tank]"
 *   × Boots of Swiftness (sfd-133-221) · Equipment · Chaos · +2 · "[Equip] [chaos]" / Effect Text "[Ganking]"
 *   (+ Vanguard Sergeant ogn-219-298 (4, vanilla) as wearer A, Veteran Poro sfd-099-221 (2, [Weaponmaster]),
 *    Mega-Mech ogn-088-298 (8) as the enemy, and a REACTION-timed stand-in for Detonate sfd-005-221 "Kill a gear. Its
 *    controller draws 2." — the printed Detonate has no [Reaction], so the 'in response' facet uses an inline copy.)
 *
 * Rules: 718.5.d / 719 / 434.1.b.1 (a Top-Most card may carry several attachments; order irrelevant), 719.1 / 434.1.d
 * (each Effect Text is appended to the Top-Most card; each bonus applies), 718.2 (an attached Equipment's own Rules
 * Text is Inactive), 719.3 (attachments share the Top-Most card's location), 435.1.c-e / 435.4 / 435.4.a / 457.1
 * (Detach: Effect Text and bonus leave with it; the loose gear sits at that location and is Recalled at the next
 * Cleanup), 818.3.b / 719.2 (a unit is Equipped / Top-Most only while something is attached), 359.3.e.12 (a target
 * that stopped being legal makes that instruction do nothing), 821.1.b-c / 821.1.c.6 (Weaponmaster chooses one of your
 * Equipment 'even if it's already attached'; neither unit is 'chosen'), 434.1.f / 434.4 (attaching elsewhere detaches
 * it first; its location becomes the new Top-Most card's — not a Move), 725.3 (the Inactive Equip cost is still read).
 *
 * Question: A (4) at bf1 wears BOTH Shield (+1, Tank) and Boots (+2, Ganking); Poro in hand; Mega-Mech (8) at bf2.
 *   (a) tree / derived Might+text?   (b) Strike Down on A: damage, who detaches what, A afterwards, where do the
 *   Boots go?   (c) P2 kills the Shield in response: does Strike Down still resolve, for how much, what is detached?
 *   vs. the one-Equipment case.   (d) Poro's Weaponmaster on the Shield STILL ON A: cost, result for A / Poro / a
 *   second Strike Down; or on the loose Boots.
 *
 * Expected: (a) A ← {Shield, Boots}: 7 Might, Tank + Ganking, all three at bf1. (b) 7 to Mega-Mech (survives); P1
 * picks which Equipment at resolution; Boots off → A = 5 with Tank only, still equipped; Boots loose → recalled to
 * base. (c) LIFO: Shield dies (P1 draws 2), A = 6/Ganking; Strike Down still legal → 6 damage, then Boots (the only
 * one) comes off → A = 4 bare. One-Equipment contrast: no longer 'equipped' → nothing happens. (d) Shield's [calm] −
 * [rainbow] = free; Shield hops A → Poro (base): Poro 3/Tank, A loses it; with the Boots already gone A is bare and no
 * longer a legal Strike Down reference. Loose Boots instead: [chaos] − [rainbow] = free → Poro 4/Ganking in base.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STRIKE_DOWN = "sfd-107-221";
const SHIELD = "sfd-033-221";
const BOOTS = "sfd-133-221";
const SERGEANT = "ogn-219-298";
const PORO = "sfd-099-221";
const MEGA_MECH = "ogn-088-298";

/** Detonate's exact effect ("Kill a gear. Its controller draws 2.") at [Reaction] speed so P2 can answer on the chain. */
const DETONATE_RX = {
  abilities: [
    {
      effect: {
        effects: [
          { target: { type: "gear" }, type: "kill" },
          { amount: 2, player: "target-controller", type: "draw" },
        ],
        type: "sequence",
      },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Detonate (Reaction stand-in)",
  powerCost: ["fury"],
  rulesText: "[Reaction] Kill a gear. Its controller draws 2.",
  timing: "reaction",
} as const;

/**
 * P1's turn. A = Vanguard Sergeant at bf1 (P1's) wearing Shield + Boots (`equipment` lists what A wears); Mega-Mech at
 * bf2 (P2's). P1: two Strike Downs (3+[body] each) and the Poro (2) in hand, 12 energy / body 2 / rainbow 2 (the
 * rainbow is Weaponmaster's [A] budget — it should never be touched). P2: the Detonate stand-in with exactly 1+[fury].
 */
function board(equipment: readonly ("shield" | "boots")[] = ["shield", "boots"]) {
  const s = scenario()
    .resources(P1, { energy: 12, power: { body: 2, rainbow: 2 } })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SERGEANT, "a", { equippedWith: [...equipment] })
    .unit(P2, "bf2", MEGA_MECH, "mech")
    .hand(P1, STRIKE_DOWN, "sd")
    .hand(P1, STRIKE_DOWN, "sd2")
    .hand(P1, PORO, "poro")
    .hand(P2, DETONATE_RX, "det");
  if (equipment.includes("shield")) {
    s.card("shield", { def: SHIELD, meta: { attachedTo: "a" }, owner: P1, zone: "bf1" });
  }
  if (equipment.includes("boots")) {
    s.card("boots", { def: BOOTS, meta: { attachedTo: "a" }, owner: P1, zone: "bf1" });
  } else {
    s.gear(P1, BOOTS, "boots"); // (d) alt: the Boots lying loose in base
  }
  return s;
}

/** The [reference, enemy] pairs Strike Down may be cast with right now. */
const strikeDownPairs = (game: Game, card = "sd"): string[][] =>
  (game.p1.option("cast", card)?.fields.find((f) => f.name === "targets")?.options ?? []).map((v) => v as string[]);

/** Cast Strike Down [A → Mega-Mech], both pass, and return the "detach which Equipment?" prompt (or whatever is pending). */
async function strikeDownToDetachPrompt(game: Game): Promise<Decision | null> {
  await game.p1.cast("sd", { targets: ["a", "mech"] });
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game.decision();
}

/** Play the Poro to base and return the Weaponmaster offer. */
async function playPoro(game: Game): Promise<Decision | null> {
  await game.p1.play("poro", { to: "base" });
  return game.decision();
}

/** Unit ids the ordinary [Equip] activation of `equipment` is currently offered for (empty = not activatable). */
const equipTargets = (game: Game, equipment: string): string[] =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants)
    .filter((v) => v.params.equipmentId === equipment)
    .map((v) => String(v.params.unitId));

const equipOffer = (d: Decision | null): string[] => (d?.kind === "pick" && d.semantics === "equip" ? d.options.map((o) => String(o.card ?? o.key)).sort() : []);

describe("Two Equipment on one unit × Strike Down × Weaponmaster", () => {
  // ── (a) the attachment tree ───────────────────────────────────────────────────────────────────────

  test("(a) one Top-Most card, two attachments: A lists {Shield, Boots}, each Equipment points at A, all three are at bf1; A = 4+1+2 = 7 with Tank AND Ganking appended; the Equipment keep only their (inactive) [Equip] as own text", async () => {
    const game = await board().build();
    expect([...game.state("a").attachments].sort()).toEqual(["boots", "shield"]);
    expect(game.state("shield")).toMatchObject({ attachedTo: "a", zone: "battlefield-bf1" });
    expect(game.state("boots")).toMatchObject({ attachedTo: "a", zone: "battlefield-bf1" });
    expect(game.state("a")).toMatchObject({ baseMight: 4, might: 7, zone: "battlefield-bf1" });
    expect([...game.state("a").keywords].sort()).toEqual(["Ganking", "Tank"]);
    expect(game.state("shield").keywords).toEqual(["Equip"]);
    expect(game.state("boots").keywords).toEqual(["Equip"]);
    // 718.2: attached → their own [Equip] is inactive, even with the right power in the pool (rainbow pays any pip)
    expect(equipTargets(game, "shield")).toEqual([]);
    expect(equipTargets(game, "boots")).toEqual([]);
  });

  test("(a) stacking order is irrelevant (434.1.b.1): declaring Boots before Shield yields the identical 7-Might Tank+Ganking unit", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SERGEANT, "a", { equippedWith: ["boots", "shield"] })
      .card("boots", { def: BOOTS, meta: { attachedTo: "a" }, owner: P1, zone: "bf1" })
      .card("shield", { def: SHIELD, meta: { attachedTo: "a" }, owner: P1, zone: "bf1" })
      .build();
    expect(game.state("a").might).toBe(7);
    expect([...game.state("a").keywords].sort()).toEqual(["Ganking", "Tank"]);
  });

  // ── (b) Strike Down on the doubly-equipped A ─────────────────────────────────────────────────────

  test("(b) Strike Down offers exactly [A → Mega-Mech] (equipped friendly × enemy), costs 3+[body], and on resolution A deals its full 7 to Mega-Mech (8) — not lethal", async () => {
    const game = await board().build();
    expect(strikeDownPairs(game)).toEqual([["a", "mech"]]);
    const d = await strikeDownToDetachPrompt(game);
    expect(game.p1.resources()).toEqual({ energy: 9, power: { body: 1, rainbow: 2 } });
    expect(game.state("mech")).toMatchObject({ damage: 7, zone: "battlefield-bf2" });
    expect(d).toMatchObject({ kind: "pick", seat: P1 }); // …and now the detach choice (below)
  });

  test("(b) 'Then detach an Equipment from it': Strike Down's controller (P1) picks WHICH ONE at resolution — both Shield and Boots are offered, nothing was locked at cast time (the chain item's targets are just the two units)", async () => {
    const game = await board().build();
    await game.p1.cast("sd", { targets: ["a", "mech"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sd", controller: P1, targets: ["a", "mech"] })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["boots", "shield"]);
  });

  test("(b) Boots chosen: A = 5, keeps Tank, loses Ganking, is STILL equipped (Shield remains) and still a legal Strike Down reference; the loose Boots are recalled to P1's base by the Cleanup with their [Equip] active again", async () => {
    const game = await board().build();
    await strikeDownToDetachPrompt(game);
    await game.p1.pick("boots");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.state("a")).toMatchObject({ attachments: ["shield"], might: 5, zone: "battlefield-bf1" });
    expect(game.state("a").keywords).toEqual(["Tank"]);
    expect(game.state("boots")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.p1.gear()).toEqual(["boots"]);
    expect(equipTargets(game, "boots")).toEqual(["a"]); // its own [Equip] is active again (435.1.c) — the pooled [rainbow] covers the [chaos] pip
    expect(strikeDownPairs(game, "sd2")).toEqual([["a", "mech"]]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) Shield chosen instead: A = 6 with Ganking only; the Shield is the one recalled to base", async () => {
    const game = await board().build();
    await strikeDownToDetachPrompt(game);
    await game.p1.pick("shield");
    await game.settle();
    expect(game.state("a")).toMatchObject({ attachments: ["boots"], might: 6 });
    expect(game.state("a").keywords).toEqual(["Ganking"]);
    expect(game.state("shield")).toMatchObject({ attachedTo: undefined, zone: "base" });
  });

  // ── (c) the Shield is killed in response ─────────────────────────────────────────────────────────

  test("(c) P2 answers Strike Down with the Detonate stand-in on the Shield: LIFO — the Shield dies first (→ P1's trash, P1 draws 2), A = 6 with Ganking only while Strike Down still waits", async () => {
    const game = await board().build();
    await game.p1.cast("sd", { targets: ["a", "mech"] });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "det")).toBe(true);
    const hand0 = game.p1.hand().length;
    await game.p2.cast("det", { targets: "shield" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sd", "det"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Detonate resolves
    expect(game.zoneOf("shield")).toBe("trash");
    expect(game.p1.trash()).toEqual(["shield"]);
    expect(game.p1.hand()).toHaveLength(hand0 + 2); // "its controller draws 2" = P1
    expect(game.state("a")).toMatchObject({ attachments: ["boots"], might: 6 });
    expect(game.state("a").keywords).toEqual(["Ganking"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["sd"]);
  });

  test("(c) …Strike Down then resolves normally — A is still 'an equipped unit' (Boots) → 6 damage to Mega-Mech, and the only remaining Equipment (Boots) is detached (forced) → A = 4, bare, no longer equipped / no longer a Strike Down reference", async () => {
    const game = await board().build();
    await game.p1.cast("sd", { targets: ["a", "mech"] });
    await game.p1.passPriority();
    await game.p2.cast("det", { targets: "shield" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.state("mech")).toMatchObject({ damage: 6, zone: "battlefield-bf2" });
    expect(game.state("a")).toMatchObject({ attachments: [], might: 4, zone: "battlefield-bf1" });
    expect(game.state("a").keywords).toEqual([]);
    expect(game.state("boots")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(strikeDownPairs(game, "sd2")).toEqual([]); // no equipped friendly unit left
    expect(game.p1.can("cast", "sd2")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(c) contrast (359.3.e.12's own example): had A worn ONLY the Shield, killing it in response leaves A un-equipped → Strike Down resolves doing NOTHING — Mega-Mech takes 0, nothing to detach", async () => {
    const game = await board(["shield"]).build();
    expect(game.state("a")).toMatchObject({ attachments: ["shield"], might: 5 });
    await game.p1.cast("sd", { targets: ["a", "mech"] });
    await game.p1.passPriority();
    await game.p2.cast("det", { targets: "shield" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("sd")).toBe("trash");
    expect(game.state("mech").damage).toBe(0);
    expect(game.state("a")).toMatchObject({ attachments: [], might: 4 });
  });

  // ── (d) Weaponmaster re-homes an Equipment ───────────────────────────────────────────────────────

  test("(d) after (b) [Boots detached], playing Veteran Poro to base: Weaponmaster offers BOTH of P1's Equipment — the loose Boots AND the Shield still attached to A at bf1 ('even if it's already attached', 821.1.b/c)", async () => {
    const game = await board().build();
    await strikeDownToDetachPrompt(game);
    await game.p1.pick("boots");
    await game.settle();
    const d = await playPoro(game);
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "equip" });
    expect(equipOffer(d)).toEqual(["boots", "shield"]);
    expect(game.p1.energy()).toBe(7); // 12 − Strike Down 3 − Poro 2; nothing charged for the offer itself
  });

  test("(d) choosing the ATTACHED Shield: cost [calm] − [rainbow] = nothing (rainbow untouched); on resolution the Shield detaches from A (434.1.f) and its location becomes P1's BASE with the Poro (434.4) → Poro = 3 with Tank; A = 4, bare, no longer Top-Most/equipped → the second Strike Down now offers only [Poro → Mega-Mech]", async () => {
    const game = await board().build();
    await strikeDownToDetachPrompt(game);
    await game.p1.pick("boots");
    await game.settle();
    await playPoro(game);
    await game.p1.pick("shield");
    // the trigger is on the chain; nothing has moved yet
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "poro", controller: P1, triggered: true })]);
    expect(game.state("shield").attachedTo).toBe("a");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("shield")).toMatchObject({ attachedTo: "poro", zone: "base" });
    expect(game.state("poro")).toMatchObject({ attachments: ["shield"], isExhausted: true, might: 3, zone: "base" });
    expect([...game.state("poro").keywords].sort()).toEqual(["Tank", "Weaponmaster"]);
    expect(game.state("a")).toMatchObject({ attachments: [], might: 4, zone: "battlefield-bf1" });
    expect(game.state("a").keywords).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 7, power: { body: 1, rainbow: 2 } }); // 12 − 3 (Strike Down) − 2 (Poro); the Equip was free
    expect(strikeDownPairs(game, "sd2")).toEqual([["poro", "mech"]]);
    expect(game.p1.units("bf1")).toEqual(["a"]); // A itself never moved; neither unit was "chosen"
    expect(game.violations()).toEqual([]);
  });

  test("(d) alternatively choosing the LOOSE Boots in base: [chaos] − [rainbow] = free → Poro = 4 with Ganking (in base, where Ganking does nothing yet); A keeps its Shield (5, Tank) and stays a legal Strike Down reference alongside the Poro", async () => {
    const game = await board().build();
    await strikeDownToDetachPrompt(game);
    await game.p1.pick("boots");
    await game.settle();
    await playPoro(game);
    await game.p1.pick("boots");
    await game.settle();
    expect(game.state("boots")).toMatchObject({ attachedTo: "poro", zone: "base" });
    expect(game.state("poro")).toMatchObject({ attachments: ["boots"], might: 4, zone: "base" });
    expect([...game.state("poro").keywords].sort()).toEqual(["Ganking", "Weaponmaster"]);
    expect(game.state("a")).toMatchObject({ attachments: ["shield"], might: 5 });
    expect(game.p1.resources()).toEqual({ energy: 7, power: { body: 1, rainbow: 2 } });
    expect(strikeDownPairs(game, "sd2").map((p) => p.join("→")).sort()).toEqual(["a→mech", "poro→mech"]);
    expect(game.p1.can("gank", "poro")).toBe(false); // Ganking from base is not a thing — it moves battlefield → battlefield
  });

  test("(d) Weaponmaster straight onto the fully-loaded A (no Strike Down first): taking the Shield off A leaves A STILL equipped with the Boots (6, Ganking) — Top-Most status survives as long as one attachment remains (719.2 / 818.3.b)", async () => {
    const game = await board().build();
    const d = await playPoro(game);
    expect(equipOffer(d)).toEqual(["boots", "shield"]); // both currently attached to A — both eligible
    await game.p1.pick("shield");
    await game.settle();
    expect(game.state("poro")).toMatchObject({ attachments: ["shield"], might: 3 });
    expect(game.state("a")).toMatchObject({ attachments: ["boots"], might: 6, zone: "battlefield-bf1" });
    expect(game.state("a").keywords).toEqual(["Ganking"]);
    expect(strikeDownPairs(game).map((p) => p.join("→")).sort()).toEqual(["a→mech", "poro→mech"]);
  });
});

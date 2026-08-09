/**
 * Hunter's Machete — unl-096-219 · Gear (Equipment) · Body · 3 energy (no power) · +2 Might bonus
 *
 *   [Equip] [body] ([body]: Attach this to a unit you control.)
 *
 * Rules: 818 (Equip = "[Cost]: Attach this to a unit you control", an activated ability; the unit is a
 * target, 818.1.b.1), 151.2 (gear abilities: your Main Phase, Open State, no showdown), 377.3 (chain),
 * 434.1.d/718.4 (Might Bonus modulates the holder while attached — it is Might, not a buff and not a
 * "this turn" modifier, so it never expires), 143.2.a (lethal = damage ≥ Might, so +2 raises the bar),
 * 740.1.a ("you control" is CONTROL, not ownership), 821 (Weaponmaster: pay the Equip cost minus one
 * power of any domain at play time, "even if it's already attached" → it migrates, 434.1.f).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. PLAY is 3 energy flat (body power never substitutes); EQUIP is one [body] flat (mind can't pay,
 *     universal power can).
 *  2. Lethal arithmetic: a 2-Might holder wearing the Machete (4) survives 3 damage that would kill it
 *     bare — and the damage heals at end of turn while the Machete stays on, turn after turn.
 *  3. Controller ≠ owner: a unit P1 CONTROLS but P2 OWNS is "a unit you control" and must be equippable.
 *  4. Weaponmaster (Veteran Poro, Body): Equip [body] minus [rainbow] = free; and it can pull the
 *     Machete off another friendly unit, which immediately drops back to its base Might.
 *  5. Purifier (Fury/Body legend: "Your Equipment each give [Assault]"): the EQUIPPED UNIT swings at
 *     +1 as an attacker (2 + 2 + 1 = 5) — the keyword must land on the holder, not sit on the gear.
 *  6. Enemy units are never legal holders; no friendly unit → no ability offered.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-096-219";
const VETERAN_PORO = "sfd-099-221"; // 2 energy · 2 Might · Weaponmaster
const PURIFIER = "sfd-183-221"; // Legend · Your Equipment each give [Assault]
const BOLT3 = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Reaction Bolt",
  rulesText: "[Reaction] Deal 3 to a unit.",
  timing: "reaction",
};

/** P1's turn: Machete unattached in base, 2-Might Squire, enemy 4-Might Guard on P2's bf1, `power` floating. */
function board(power: Record<string, number> = { body: 1 }) {
  return scenario()
    .resources(P1, { power })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .gear(P1, CARD, "machete");
}

const equipOption = (game: Game) => game.p1.legal().find((o) => o.moveId === "equipCard");
const equipUnits = (game: Game) => (equipOption(game)?.fields.find((f) => f.name === "unitId")?.options ?? []) as string[];
const equip = (game: Game, unitId: string) => game.p1.choose("equipCard:-", { params: { equipmentId: "machete", unitId } });

describe("Hunter's Machete (unl-096-219)", () => {
  test("registry payload: 3-cost Body equipment, +2 bonus, no power to play, exactly one ability — [Equip] costed one [body] pip", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "body", energyCost: 3, mightBonus: 2, name: "Hunter's Machete" });
    expect(def?.powerCost ?? []).toEqual([]);
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "[Hunt] (When I conquer or hold, gain 1 XP.)" —
    // conferred on the equipped unit while attached, hence the `effectText: true` entries.
    expect(def?.abilities).toEqual([
      { cost: { power: ["body"] }, keyword: "Equip", type: "keyword" },
      { effect: { amount: 1, type: "gain-xp" }, effectText: true, name: "Hunt", trigger: { event: "conquer", on: "self" }, type: "triggered" },
      { effect: { amount: 1, type: "gain-xp" }, effectText: true, name: "Hunt", trigger: { event: "hold", on: "self" }, type: "triggered" },
    ] as never);
  });

  test("PLAY: exactly 3 energy (body power untouched), lands in base unattached; 2 energy + body power is not enough; not on the opponent's turn", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { body: 2 } }).hand(P1, CARD, "machete").build();
    await game.p1.play("machete");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 2 } });
    await game.settle();
    expect(game.state("machete")).toMatchObject({ attachedTo: undefined, cardType: "equipment", zone: "base" });
    expect(game.state("machete").keywords).toContain("Equip");
    expect((await scenario().resources(P1, { energy: 2, power: { body: 3 } }).hand(P1, CARD, "machete").build()).p1.can("play", "machete")).toBe(false);
    expect((await scenario().active(P2).resources(P1, { energy: 3 }).hand(P1, CARD, "machete").build()).p1.can("play", "machete")).toBe(false);
  });

  test("EQUIP: spends one [body] and no energy, sits on the chain unattached while P2 has priority, then attaches — Squire 2 → 4 (baseMight still 2, not a buff)", async () => {
    const game = await board({ body: 1 }).resources(P1, { energy: 2 }).build();
    await equip(game, "squire");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "machete", controller: P1 })]);
    expect(game.state("squire").might).toBe(2);
    await game.p1.pass();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.pass();
    expect(game.state("machete").attachedTo).toBe("squire");
    expect(game.state("squire")).toMatchObject({ attachments: ["machete"], baseMight: 2, isBuffed: false, might: 4, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("the [body] pip: mind power cannot pay it and neither can energy alone; a universal [rainbow] power can", async () => {
    expect(equipOption(await board({ mind: 2 }).build())).toBeUndefined();
    expect(equipOption(await board({}).resources(P1, { energy: 9 }).build())).toBeUndefined();
    const rainbow = await board({ rainbow: 1 }).build();
    await equip(rainbow, "squire");
    expect(rainbow.p1.power()).toBe(0);
    await rainbow.settle();
    expect(rainbow.state("squire").might).toBe(4);
  });

  test("holders: only units P1 controls — the enemy Guard is not offered and forcing it is rejected; no friendly unit → no ability at all", async () => {
    const game = await board().build();
    expect(equipUnits(game)).toEqual(["squire"]);
    expect((await game.p1.try(() => equip(game, "guard"))).ok).toBe(false);
    expect(game.state("machete").attachedTo).toBeUndefined();
    const none = await scenario().resources(P1, { power: { body: 1 } }).unit(P2, "base", { might: 1 }, "guard").gear(P1, CARD, "machete").build();
    expect(equipOption(none)).toBeUndefined();
  });

  // 818.1.c.2 "a unit you CONTROL" / 740.1.a: the borrowed unit is a legal holder.
  test("740.1.a controller ≠ owner — a unit P1 CONTROLS but P2 OWNS is equippable", async () => {
    const game = await scenario()
      .resources(P1, { power: { body: 1 } })
      .card("borrowed", { controller: P1, def: { cardType: "unit", might: 2, name: "Borrowed" }, owner: P2, zone: "base" })
      .gear(P1, CARD, "machete")
      .build();
    expect(game.state("borrowed")).toMatchObject({ controller: P1, owner: P2 });
    expect(equipUnits(game)).toEqual(["borrowed"]);
    await equip(game, "borrowed");
    await game.settle();
    expect(game.state("machete").attachedTo).toBe("borrowed");
    expect(game.state("borrowed").might).toBe(4);
  });

  test("timing (151.2): absent on the opponent's turn, inside a showdown, and while a spell waits on the chain", async () => {
    expect(equipOption(await board().active(P2).build())).toBeUndefined();
    const sd = await board().battlefield("open", { controller: null }).unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await sd.p1.move("scout", "open");
    expect(sd.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(equipOption(sd)).toBeUndefined();
    const busy = await board().resources(P1, { energy: 1 }).hand(P1, BOLT3, "bolt").build();
    await busy.p1.cast("bolt", { targets: "guard" });
    expect(equipOption(busy)).toBeUndefined();
    await busy.settle();
    expect(equipOption(busy)).toBeDefined();
  });

  test("lethal arithmetic (143.2.a): P2's 3-damage Reaction kills a bare 2-Might Squire but only wounds the equipped one (3 < 4); the damage heals at end of turn and the Machete is still on next turn", async () => {
    const bare = await board().active(P2).resources(P2, { energy: 1 }).hand(P2, BOLT3, "bolt").build();
    await bare.p2.cast("bolt", { targets: "squire" });
    await bare.settle();
    expect(bare.zoneOf("squire")).toBe("trash");
    const armed = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["machete"] })
      .gear(P1, CARD, "machete", { attachedTo: "squire" })
      .hand(P2, BOLT3, "bolt")
      .build();
    await armed.p2.cast("bolt", { targets: "squire" });
    await armed.settle();
    expect(armed.state("squire")).toMatchObject({ damage: 3, might: 4, zone: "base" });
    await armed.advanceTurn(); // → P1
    expect(armed.state("squire")).toMatchObject({ attachments: ["machete"], damage: 0, might: 4 });
    await armed.advanceTurn(); // → P2: still no expiry — a Might Bonus has no duration
    expect(armed.state("squire").might).toBe(4);
  });

  test("partner — Veteran Poro's Weaponmaster: Equip [body] minus [rainbow] = free; accepting attaches (Poro 2 → 4) with zero power spent, declining leaves both untouched", async () => {
    const yes = await scenario().resources(P1, { energy: 2 }).gear(P1, CARD, "machete").hand(P1, VETERAN_PORO, "poro").build();
    await yes.p1.play("poro");
    expect(yes.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await yes.p1.pick("machete");
    await yes.settle();
    expect(yes.state("poro")).toMatchObject({ attachments: ["machete"], might: 4 });
    expect(yes.p1.resources()).toEqual({ energy: 0, power: {} });
    const no = await scenario().resources(P1, { energy: 2 }).gear(P1, CARD, "machete").hand(P1, VETERAN_PORO, "poro").build();
    await no.p1.play("poro");
    await no.p1.decline();
    await no.settle();
    expect(no.state("machete").attachedTo).toBeUndefined();
    expect(no.state("poro").might).toBe(2);
  });

  test("Weaponmaster 'even if it's already attached' (434.1.f): the Poro pulls the Machete off the Squire — Poro 4, Squire back to 2, one Machete, one holder", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["machete"] })
      .gear(P1, CARD, "machete", { attachedTo: "squire" })
      .hand(P1, VETERAN_PORO, "poro")
      .build();
    expect(game.state("squire").might).toBe(4);
    await game.p1.play("poro");
    await game.p1.pick("machete");
    await game.settle();
    expect(game.state("machete").attachedTo).toBe("poro");
    expect(game.state("poro")).toMatchObject({ attachments: ["machete"], might: 4 });
    expect(game.state("squire")).toMatchObject({ attachments: [], might: 2 });
  });

  test("real combat: the equipped Squire (4) attacking the 4-Might Guard trades — both die, the Machete drops off and is recalled to P1's base unattached (457.1), bf1 ends uncontrolled", async () => {
    const game = await board().build();
    await equip(game, "squire");
    await game.settle();
    await game.p1.move("squire", "bf1");
    expect(game.locationOf("machete")).toBe("bf1");
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("machete")).toMatchObject({ attachedTo: undefined, controller: P1, zone: "base" });
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });

  // BUG — expected (Purifier: "Your Equipment each give [Assault]"; 807.1.c Assault raises the ATTACKER's
  // Might): the Machete-wearing Squire attacks at 2 + 2 + 1 = 5, kills the 4-Might Guard, takes 4 < 5 and
  // survives to conquer. Actual: the Assault keyword is parked on the gear itself, the Squire attacks at 4,
  // trades with the Guard and nobody conquers.
  test("partner — Purifier should make the EQUIPPED UNIT an Assault attacker (5 vs 4: Guard dies, Squire lives, P1 conquers); the grant lands on the gear instead", async () => {
    const game = await board().legend(P1, PURIFIER, "lucian").build();
    await equip(game, "squire");
    await game.settle();
    expect(game.state("squire").keywords).toContain("Assault");
    await game.p1.move("squire", "bf1");
    expect(game.state("squire").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.state("squire")).toMatchObject({ might: 4, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});

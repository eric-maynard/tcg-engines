/**
 * Interaction: Morgana, Vindictive (ven-017-166) × Janna, Savior (sfd-053-221) × Annie, Fiery (ogs-001-024)
 *
 *   Morgana, Vindictive — Champion Unit · Fury · 5 + [fury] · 5 Might
 *     "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *      When you play me, deal damage to a unit equal to the damage marked on it."
 *   Janna, Savior — Champion Unit · Calm · 3 + [calm] · 3 Might
 *     "[Reaction] (Play any time, even before spells and abilities resolve, including to a battlefield you control.)
 *      When you play me, heal your units here, then move up to one enemy unit from here to its base."
 *   Annie, Fiery — Champion Unit · Fury · 5 · 4 Might
 *     "Your spells and abilities deal 1 Bonus Damage."
 *
 * Rules: 417.6.b.2.a (an ability that says "deal" is the source, together with its card), 715.1 (Bonus
 * Damage adds to a single-target Deal), 417.1.e / 417.1.e.1 (only Valid Damage ≥ 1 is dealt — a Deal of 0
 * is not performed), 715.4 (no Deal → Bonus Damage does not apply), 418.1 / 418.1.a (clearing damage for
 * any reason is Healing), 428.5.c / 428.5.c.1 / 428.5.d (a Cleanup kill is attributed to the ability that
 * just dealt the damage, and to its card, with its controller responsible).
 *
 * Question: P1's turn. P2's X (6 Might) holds bf1 with 3 damage marked. P1 controls Annie, Fiery, attacks
 * bf1 with a unit and — holding Focus — Ambushes Morgana into bf1 choosing X.
 *  (a) No response: how much does the trigger deal (3 or 4)? source? does X die, credited to whom?
 *  (b) P2 responds to the pending trigger by playing Janna, Savior to bf1, healing X first. When Morgana's
 *      trigger then resolves with 0 marked: is a Deal performed? Does Annie turn 0 into 1?
 *
 * Expected: (a) 3 (marked) + 1 (Annie) = 4 from Morgana's ability / Morgana, P1 responsible; 3 + 4 = 7 ≥ 6
 * → X dies in the Cleanup, kill attributed to Morgana's ability with P1 responsible. (b) Janna is legal in
 * that window; her heal clears the 3 (that IS healing); Morgana's trigger then reads 0 → no Deal at all,
 * so no Bonus Damage: X takes 0, keeps 0 marked, survives, and registers no "was dealt damage".
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MORGANA = "ven-017-166";
const JANNA = "sfd-053-221";
const ANNIE = "ogs-001-024";

type DamageRecord = {
  amount: number;
  original: number;
  combat: boolean;
  source: { cardId?: string; kind: string; player?: string };
  modifiedBy: { kind: string; before: number; after: number; sourceCardId?: string }[];
};
const lastDamage = (game: Game, card: string) => game.state(card).meta.lastDamage as DamageRecord | undefined;

/**
 * P1's turn. P2 holds bf1 with X (`xMight`, 3 marked). P1: Annie (base) unless `annie:false`, a 2-Might
 * Buddy in base, Morgana in hand with exactly 5 + [fury]. P2: Janna in hand with exactly 3 + [calm].
 */
function board(opts: { xMight?: number; annie?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 5, power: { fury: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: opts.xMight ?? 6, name: "X" }, "x", { damage: 3 })
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .hand(P1, MORGANA, "morgana")
    .hand(P2, JANNA, "janna");
  return opts.annie === false ? s : s.unit(P1, "base", ANNIE, "annie");
}

/** Buddy attacks bf1 (showdown, P1 Focus); P1 Ambushes Morgana into bf1 and names X for her play trigger. */
async function ambushMorganaOnX(game: Game): Promise<void> {
  await game.p1.move("buddy", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.play("morgana", { to: "bf1" });
  // The trigger's single target is chosen as the item is finalized (FIN), before anyone gets priority.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
  await game.p1.pick("x");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "morgana", controller: P1, triggered: true })]);
  expect(game.state("x").damage).toBe(3); // nothing dealt yet
}

/** Pass priority around until the chain is empty (stays inside the showdown — no combat resolution). */
async function resolveChainOnly(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Morgana, Vindictive × Janna, Savior × Annie, Fiery — heal in response makes the Deal 0, and 0 + Bonus is still nothing", () => {
  // ── (a) no response ────────────────────────────────────────────────────────────────────────

  test("(a) no response: the trigger deals 3 (marked) + 1 (Annie's Bonus Damage, 715.1) = 4 in ONE instance whose source is Morgana's ABILITY with P1 responsible (417.6.b.2.a)", async () => {
    const game = await board().build();
    await ambushMorganaOnX(game);
    await resolveChainOnly(game);
    const rec = lastDamage(game, "x");
    expect(rec).toMatchObject({ amount: 4, combat: false, original: 3, source: { cardId: "morgana", kind: "ability", player: P1 } });
    expect(rec?.modifiedBy).toEqual([expect.objectContaining({ after: 4, before: 3, kind: "bonus" })]);
  });

  test("(a) 3 already marked + 4 dealt = 7 ≥ 6: X dies in the Cleanup right after the trigger resolves (still mid-showdown, before any combat) — the lethal Deal on record is Morgana's ability, P1's (428.5.c / .c.1 / .d)", async () => {
    const game = await board().build();
    await ambushMorganaOnX(game);
    await resolveChainOnly(game);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p2.trash()).toContain("x");
    // still in the showdown: combat has not been resolved, so this was not a combat kill
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(lastDamage(game, "x")?.source).toEqual({ cardId: "morgana", kind: "ability", player: P1 });
    expect(lastDamage(game, "x")?.combat).toBe(false);
    // and with no defender left the showdown closes into a conquer for P1
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(a) Annie's +1 is load-bearing: a 7-Might X with 3 marked survives Morgana alone (3 + 3 = 6 < 7) but dies with Annie out (3 + 4 = 7)", async () => {
    const noAnnie = await board({ annie: false, xMight: 7 }).build();
    await ambushMorganaOnX(noAnnie);
    await resolveChainOnly(noAnnie);
    expect(noAnnie.state("x")).toMatchObject({ damage: 6, zone: "battlefield-bf1" });
    expect(lastDamage(noAnnie, "x")).toMatchObject({ amount: 3, modifiedBy: [] });

    const withAnnie = await board({ xMight: 7 }).build();
    await ambushMorganaOnX(withAnnie);
    await resolveChainOnly(withAnnie);
    expect(withAnnie.zoneOf("x")).toBe("trash");
    expect(lastDamage(withAnnie, "x")?.amount).toBe(4);
  });

  // ── (b) Janna in response ──────────────────────────────────────────────────────────────────

  test("(b) Janna is a [Reaction] unit: while Morgana's trigger is pending and P2 holds priority, P2 may play her — to base or to bf1 (a battlefield P2 controls) — for exactly 3 + [calm]; her own play trigger lands ABOVE Morgana's", async () => {
    const game = await board().build();
    await ambushMorganaOnX(game);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("play", "janna")).toBe(true);
    const to = (game.p2.option("playUnit", "janna")?.fields.find((f) => f.arg === "to")?.options ?? []).map(String);
    expect(new Set(to)).toEqual(new Set(["base", "battlefield-bf1"]));
    await game.p2.play("janna", { to: "bf1" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("janna")).toBe("battlefield-bf1");
    // "move up to one enemy unit from here" is an up-to-1 target set chosen at finalization — P2 names none.
    expect(game.decision()).toMatchObject({ kind: "pick", min: 0, max: 1, seat: P2, targeting: "up-to", timing: "FIN" });
    await game.p2.decline();
    expect(game.chain().map((c) => c.cardId)).toEqual(["morgana", "janna"]);
    expect(game.state("x").damage).toBe(3); // Janna's heal is a trigger too — nothing healed yet
  });

  test("(b) LIFO: Janna's trigger resolves first and HEALS X — the 3 marked damage is cleared (418.1 / 418.1.a) while Morgana's trigger is still on the chain", async () => {
    const game = await board().build();
    await ambushMorganaOnX(game);
    await game.p1.passPriority();
    await game.p2.play("janna", { to: "bf1" });
    await game.p2.decline();
    await game.p2.passPriority();
    await game.p1.passPriority(); // → Janna's trigger resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["morgana"]);
    expect(game.state("x")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("(b) Morgana's trigger then resolves reading 0 marked: 0 is not Valid Damage so NO Deal is performed (417.1.e.1) and Annie's Bonus Damage has nothing to attach to (715.4) — X takes 0 (not 1), has 0 marked, survives, and carries no 'was dealt damage' record at all", async () => {
    const game = await board().build();
    await ambushMorganaOnX(game);
    await game.p1.passPriority();
    await game.p2.play("janna", { to: "bf1" });
    await game.p2.decline();
    await resolveChainOnly(game);
    expect(game.state("x")).toMatchObject({ damage: 0, might: 6, zone: "battlefield-bf1" });
    expect(lastDamage(game, "x")).toBeUndefined(); // no Deal event was ever recorded against X
    expect(game.state("x").meta.dealtDamageThisTurn).not.toBe(true);
    // Annie is still out and still granting the bonus — it simply had no Deal to ride on
    expect(game.zoneOf("annie")).toBe("base");
    // we are back in the showdown with everything alive: X + Janna defend, Buddy + Morgana attack
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("x").combatRole).toBe("defender");
    expect(game.state("janna").combatRole).toBe("defender");
    expect(game.state("morgana")).toMatchObject({ combatRole: "attacker", zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("(b) control — Janna played to P2's BASE instead heals nothing 'here' at bf1: Morgana's trigger still finds 3 marked and kills X exactly as in (a)", async () => {
    const game = await board().build();
    await ambushMorganaOnX(game);
    await game.p1.passPriority();
    await game.p2.play("janna", { to: "base" });
    if (game.decision()?.kind === "pick") {
      await game.p2.decline();
    }
    await resolveChainOnly(game);
    expect(game.zoneOf("janna")).toBe("base");
    expect(game.zoneOf("x")).toBe("trash");
    expect(lastDamage(game, "x")).toMatchObject({ amount: 4, source: { cardId: "morgana", kind: "ability", player: P1 } });
  });
});

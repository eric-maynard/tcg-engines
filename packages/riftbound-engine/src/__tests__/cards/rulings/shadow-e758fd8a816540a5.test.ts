/**
 * Ruling e758fd8a816540a5 — (scraped under "Shadow" UNL-194; the cards meant are)
 *   Shadow Clone token (rule 187.11) · 0 Might · "When I attack, you may banish a unit from your trash. If you do, give me
 *     [Assault 4] this turn." — minted here by Death Mark (ven-144-166) "[Burn 3]. Play a 0 [Might] Shadow Clone unit token."
 *   × Zed, Without a Sound (VEN-112a → ven-112a-166) · 5 Might · "[Action] [1][chaos]: Move me and a Shadow Clone you control to
 *     each other's locations."
 *
 * Q: A Shadow Clone got Assault 4 from attacking; Zed swaps it out and later back into (another) combat. Assault 8, or still 4?
 * A: It stacks to Assault 8. "When I attack" fires once per combat; a second combat is a new Attacker designation, so the trigger
 *    fires again (a second banish from trash is needed) and the two "this turn" Assault 4 grants sum (807.2).
 * Rules: 807.2 (multiple Assault sum), 383.4.e (designation triggers once per combat), 446 (swap is a move by effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZED = "ven-112a-166";
const DEATH_MARK = "ven-144-166";
const SKULKER = "ogn-175-298";

/**
 * P1's turn 2. Zed in P1's base; P2 holds bf2 with a 1-Might Wall and bf3 with a 7-Might Guard. P1's deck top: four Skulkers
 * (Death Mark's Burn 3 puts three units in the trash). P1: Death Mark + [2][rainbow]; two chaos runes for Zed's [1][chaos] later.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .runes(P1, "chaos", 2)
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: P2 })
    .unit(P1, "base", ZED, "zed")
    .unit(P2, "bf2", { might: 1, name: "Wall" }, "wall")
    .unit(P2, "bf3", { might: 7, name: "Guard" }, "guard")
    .deck(P1, [SKULKER, SKULKER, SKULKER, SKULKER], ["u1", "u2", "u3", "u4"])
    .hand(P1, DEATH_MARK, "dm");
}

/** Death Mark → a Shadow Clone token in base; come back round to P1's turn so it is ready. */
async function readyClone(): Promise<{ game: Game; clone: string }> {
  const game = await board().build();
  await game.p1.cast("dm");
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  if (d?.kind === "pick" && d.semantics === "destination") {
    await game.p1.pick("base");
  }
  const clone = game.p1.units().find((u) => game.state(u).isToken) as string;
  expect(clone).toBeDefined();
  expect(game.state(clone)).toMatchObject({ isToken: true, might: 0, name: "Shadow Clone" });
  expect(game.p1.trash()).toEqual(expect.arrayContaining(["u1", "u2", "u3"]));
  await game.advanceToTurnOf(P2);
  await game.advanceToTurnOf(P1);
  expect(game.state(clone).isReady).toBe(true);
  return { clone, game };
}

/** Answer the clone's "When I attack, you may banish a unit from your trash": yes, banish `unit`; then drain the chain. */
async function takeAssault(game: Game, clone: string, unit: string): Promise<void> {
  const d = game.decision();
  expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
  expect(d?.prompt ?? "").toContain(clone);
  await game.p1.yes();
  const pick = game.decision();
  expect(pick).toMatchObject({ kind: "pick", seat: P1 });
  expect(pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key) : []).toContain(unit);
  await game.p1.pick(unit);
  for (let i = 0; i < 6 && game.chain().length > 0; i++) {
    const x = game.decision();
    if (x?.kind !== "action" || x.context !== "chain") {
      break;
    }
    await game.seat(x.seat).passPriority();
  }
}

/** First combat: the clone attacks bf2, takes Assault 4 (banishing u1), kills the Wall and conquers. */
async function firstCombat(): Promise<{ game: Game; clone: string }> {
  const { game, clone } = await readyClone();
  await game.p1.move(clone, "bf2");
  await takeAssault(game, clone, "u1");
  expect(game.state(clone).combatRole).toBe("attacker");
  expect(game.state(clone).grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
  expect(game.zoneOf("u1")).toBe("banishment");
  await game.settle();
  expect(game.zoneOf("wall")).toBe("trash"); // fought as 0 + 4
  expect(game.zoneOf(clone)).toBe("battlefield-bf2");
  expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  expect(game.state(clone).combatRole).toBeNull();
  return { clone, game };
}

/** Zed attacks bf3, then (with Focus) activates his swap naming the clone; resolve it. */
async function zedSwapsCloneIntoBf3(game: Game, clone: string): Promise<void> {
  await game.p1.tapRune();
  await game.p1.recycleRune(undefined, "chaos");
  await game.p1.move("zed", "bf3");
  expect(game.state("zed").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("activate", "zed")).toBe(true);
  await game.p1.activate("zed");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d.options.map((o) => o.card ?? o.key)).toContain(clone);
    await game.p1.pick(clone);
  }
  for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "zed"); i++) {
    const x = game.decision();
    if (x?.kind !== "action" || x.context !== "chain") {
      break;
    }
    await game.seat(x.seat).passPriority();
  }
  expect(game.locationOf("zed")).toBe("bf2");
  expect(game.locationOf(clone)).toBe("bf3");
}

describe("Ruling e758fd8a816540a5 — a Shadow Clone's Assault 4 stacks to 8 when it attacks in a second combat the same turn", () => {
  test("first combat: attacking bf2 fires 'When I attack' — banish u1 → [Assault 4] this turn; the clone wins as a 4 and the grant PERSISTS after combat (still one Assault 4 entry, no longer an attacker)", async () => {
    const { game, clone } = await firstCombat();
    expect(game.state(clone).grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["u2", "u3"])); // more fuel for a second trigger
  });

  test("Zed's swap drops the clone into Zed's combat at bf3: it gains the Attacker designation in this NEW combat, so 'When I attack' fires AGAIN (P1 asked again; a second unit must be banished)", async () => {
    const { game, clone } = await firstCombat();
    await zedSwapsCloneIntoBf3(game, clone);
    expect(game.state(clone).combatRole).toBe("attacker");
    expect(game.state("zed").combatRole).not.toBe("attacker");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.prompt ?? "").toContain(clone);
    await takeAssault(game, clone, "u2");
    expect(game.zoneOf("u2")).toBe("banishment");
    // 807.2 — two separate Assault 4 grants, summing to Assault 8 while attacking.
    expect(game.state(clone).grantedKeywords).toEqual([
      { duration: "turn", keyword: "Assault", value: 4 },
      { duration: "turn", keyword: "Assault", value: 4 },
    ]);
  });

  test("…and it fights as 0 + 4 + 4 = 8: alone against the 7-Might Guard the clone kills it and survives (7 < 8) — P1 conquers bf3 (with only Assault 4 it would have died)", async () => {
    const { game, clone } = await firstCombat();
    await zedSwapsCloneIntoBf3(game, clone);
    await takeAssault(game, clone, "u2");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf(clone)).toBe("battlefield-bf3");
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control: declining the second banish leaves a single Assault 4 — the clone (4) dies to the Guard (7), who survives", async () => {
    const { game, clone } = await firstCombat();
    await zedSwapsCloneIntoBf3(game, clone);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    expect(game.state(clone).grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
    await game.settle();
    expect(game.zoneOf(clone)).toBe("gone");
    expect(game.zoneOf("guard")).toBe("battlefield-bf3");
    expect(game.gameState.battlefields.bf3?.controller).toBe(P2);
  });
});

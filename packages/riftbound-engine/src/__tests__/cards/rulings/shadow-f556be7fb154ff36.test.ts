/**
 * Ruling f556be7fb154ff36 — (scraped under "Shadow" UNL-194; the cards meant are)
 *   Shadow Clone token (rule 187.11) · 0 Might · "When I attack, you may banish a unit from your trash. If you do, give me
 *     [Assault 4] this turn." — minted here by Death Mark (ven-144-166) "[Burn 3]. Play a 0 [Might] Shadow Clone unit token."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] "Move a friendly unit and ready it."
 *
 * Q: My Shadow Clone attacked and banished a unit for Assault 4. If I Ride the Wind it into another fight and banish
 *    another unit, does it have Assault 8?
 * A: Yes — 4 + 4 = 8. Each combat is a new Attacker designation, so "When I attack" fires again (needs a second unit in
 *    the trash to banish) and Assault from multiple grants sums. Caveat: if Ride the Wind sends it to an EMPTY battlefield
 *    there is no combat, no attack, no trigger.
 * Rules: 807.2 (Assault values sum), 383.4.e.2.a (attack triggers once per combat), 446 (move by effect), 464 (attacker
 *        designation on arrival at an enemy-held battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATH_MARK = "ven-144-166";
const RIDE_THE_WIND = "ogn-173-298";
const SKULKER = "ogn-175-298";

/**
 * P1's turn 2 with exactly Death Mark's 2+[rainbow]. P2 holds bf2 (1-Might Wall) and bf3 (7-Might Guard); bf4 is empty and
 * uncontrolled. P1's deck top: four Skulkers (Burn 3 → three units in the trash). Ride the Wind waits in hand.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: P2 })
    .battlefield("bf4", { controller: null })
    .unit(P2, "bf2", { might: 1, name: "Wall" }, "wall")
    .unit(P2, "bf3", { might: 7, name: "Guard" }, "guard")
    .deck(P1, [SKULKER, SKULKER, SKULKER, SKULKER], ["u1", "u2", "u3", "u4"])
    .hand(P1, DEATH_MARK, "dm")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Death Mark → Shadow Clone token; come back round to P1's turn so it is ready; load 2+[chaos] for Ride the Wind. */
async function readyClone(): Promise<{ game: Game; clone: string }> {
  const game = await board().build();
  await game.p1.cast("dm");
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  if (d?.kind === "pick" && d.semantics === "destination") {
    await game.p1.pick("base");
  }
  await game.settle();
  const clone = game.p1.units().find((u) => game.state(u).isToken) as string;
  expect(clone).toBeDefined();
  expect(game.state(clone)).toMatchObject({ isToken: true, might: 0, name: "Shadow Clone" });
  expect(game.p1.trash()).toEqual(expect.arrayContaining(["u1", "u2", "u3"]));
  await game.advanceToTurnOf(P2);
  await game.advanceToTurnOf(P1);
  expect(game.state(clone).isReady).toBe(true);
  await game.p1.do("addResources", { energy: 2, power: { chaos: 1 } });
  return { clone, game };
}

/** Answer the clone's "When I attack, you may banish …": yes, banish `unit`; then drain the chain (not the showdown). */
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

/** First combat: Standard Move to bf2, banish u1 → Assault 4, the Wall dies, P1 conquers bf2. */
async function firstCombat(): Promise<{ game: Game; clone: string }> {
  const { game, clone } = await readyClone();
  await game.p1.move(clone, "bf2");
  await takeAssault(game, clone, "u1");
  expect(game.state(clone).combatRole).toBe("attacker");
  expect(game.state(clone).grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
  expect(game.zoneOf("u1")).toBe("banishment");
  await game.settle();
  expect(game.zoneOf("wall")).toBe("trash"); // 0 + 4 ≥ 1
  expect(game.locationOf(clone)).toBe("bf2");
  expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  expect(game.state(clone)).toMatchObject({ combatRole: null, isExhausted: true });
  return { clone, game };
}

/** Ride the Wind the clone to `dest`; resolve the spell (chain drained, showdown/trigger left as is). */
async function rideTo(game: Game, clone: string, dest: string): Promise<void> {
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: clone, answers: [dest] });
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
    await game.p1.pick(dest);
  }
  for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "rtw"); i++) {
    const x = game.decision();
    if (x?.kind !== "action" || x.context !== "chain") {
      break;
    }
    await game.seat(x.seat).passPriority();
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf(clone)).toBe(dest);
  expect(game.state(clone).isReady).toBe(true);
}

describe("Ruling f556be7fb154ff36 — a Shadow Clone Ride-the-Winded into a second combat stacks Assault 4 + 4 = 8", () => {
  test("first combat: 'When I attack' → banish u1 → [Assault 4] this turn; the grant persists after the combat (one entry)", async () => {
    const { game, clone } = await firstCombat();
    expect(game.state(clone).grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["u2", "u3"])); // fuel for a second trigger
  });

  test("Ride the Wind into enemy-held bf3: a NEW combat, the clone is the attacker again and 'When I attack' fires AGAIN (P1 asked again; a second trash unit must be banished)", async () => {
    const { game, clone } = await firstCombat();
    await rideTo(game, clone, "bf3");
    expect(game.state(clone).combatRole).toBe("attacker");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.prompt ?? "").toContain(clone);
    await takeAssault(game, clone, "u2");
    expect(game.zoneOf("u2")).toBe("banishment");
    expect(game.state(clone).grantedKeywords).toEqual([
      { duration: "turn", keyword: "Assault", value: 4 },
      { duration: "turn", keyword: "Assault", value: 4 },
    ]);
  });

  test("…and it fights as 0 + 4 + 4 = 8: alone into the 7-Might Guard it kills it and SURVIVES (7 < 8) — P1 conquers bf3", async () => {
    const { game, clone } = await firstCombat();
    await rideTo(game, clone, "bf3");
    await takeAssault(game, clone, "u2");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf(clone)).toBe("bf3");
    expect(game.gameState.battlefields.bf3?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control: declining the second banish leaves a single Assault 4 — the clone (4) dies to the Guard (7)", async () => {
    const { game, clone } = await firstCombat();
    await rideTo(game, clone, "bf3");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    expect(game.state(clone).grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
    await game.settle();
    expect(game.zoneOf(clone)).toBe("gone");
    expect(game.zoneOf("guard")).toBe("battlefield-bf3");
    expect(game.gameState.battlefields.bf3?.controller).toBe(P2);
  });

  test("caveat: Ride the Wind to the EMPTY bf4 is no combat — no Attacker designation, no 'When I attack' prompt, still just the one Assault 4", async () => {
    const { game, clone } = await firstCombat();
    await rideTo(game, clone, "bf4");
    expect(game.state(clone).combatRole).not.toBe("attacker");
    expect(game.decision()?.kind).not.toBe("yes-no");
    await game.settle();
    expect(game.state(clone).grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
    expect(game.zoneOf("u2")).toBe("trash");
    expect(game.locationOf(clone)).toBe("bf4");
  });
});

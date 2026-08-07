/**
 * Ruling 8bb44b90da8bab68 — Glasc Mixologist (SFD-165 → sfd-165-221) · Unit · Order · 5 · 5 Might
 *   "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from
 *    your trash, ignoring its cost."
 *
 * Q: Glasc is my ONLY defender, dies in combat, and his Deathknell plays a unit to where he died —
 *    what happens?
 * A: Combat cleanup heals every unit before the pending Deathknell resolves (466.1.a.1), and because
 *    no defender remained the surviving attackers are NOT recalled (466.1.a.2). Then the Deathknell
 *    puts the new unit at that battlefield; with both players present the combat result is
 *    "No Result" (466.3.d) — nobody wins the original combat — and a fresh combat is staged there
 *    immediately (466.3.d.1).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC_MIXOLOGIST = "sfd-165-221";

/** P2 holds bf1 with Glasc alone; P1's 6-Might Brute will attack. P2's trash: a 2-cost unit (legal) and a 5-cost unit (too big). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", GLASC_MIXOLOGIST, "glasc")
    .unit(P1, "base", { might: 6, name: "Brute" }, "brute")
    .trash(P2, { cardType: "unit", energyCost: 2, might: 2, name: "Revived Help" }, "revived")
    .trash(P2, { cardType: "unit", energyCost: 5, might: 5, name: "Too Big" }, "toobig")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander");
}

/** Brute attacks bf1; both pass focus → combat damage: Glasc (5) dies to 6, Brute (6) takes 5 and survives. */
async function fightUntilDeathknellPending(game: Game): Promise<void> {
  await game.p1.move("brute", "bf1");
  expect(game.state("brute").combatRole).toBe("attacker");
  expect(game.state("glasc").combatRole).toBe("defender");
  // Pass focus/priority until Glasc's Deathknell is the pending chain item.
  for (let i = 0; i < 6 && !game.chain().some((c) => c.cardId === "glasc"); i++) {
    const d = game.decision();
    expect(d?.kind).toBe("action");
    await game.seat(d!.seat).pass();
  }
  expect(game.zoneOf("glasc")).toBe("trash");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glasc", controller: P2, triggered: true })]);
}

function pickKeys(d: Decision | null): string[] {
  return d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

/**
 * Resolve the Deathknell as P2: opt in, choose "revived" from the trash, put it at bf1. Tolerant of the
 * exact prompt sequence (yes/no opt-in, card pick, destination pick) but strict about what is offered.
 */
async function resolveDeathknellToBf1(game: Game): Promise<void> {
  // Both pass on the trigger → it resolves and asks P2.
  for (let i = 0; i < 4 && game.decision()?.kind === "action"; i++) {
    const d = game.decision()!;
    await game.seat(d.seat).pass();
  }
  let pickedCard = false;
  let pickedWhere = false;
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    expect(d.seat).toBe(P2);
    if (d.kind === "yes-no") {
      await game.p2.yes();
      continue;
    }
    if (d.kind === "pick") {
      const keys = pickKeys(d);
      if (keys.includes("revived")) {
        expect(keys).not.toContain("toobig"); // cost 5 > 3
        expect(keys).not.toContain("brute"); // not "from your trash"
        await game.p2.pick("revived");
        pickedCard = true;
        continue;
      }
      const bf1Key = keys.find((k) => k === "bf1" || k === "battlefield-bf1");
      expect(bf1Key).toBeDefined(); // P2 still controls bf1 → may play there
      await game.p2.pick(bf1Key as string);
      pickedWhere = true;
      continue;
    }
    break;
  }
  expect(pickedCard).toBe(true);
  expect(pickedWhere).toBe(true);
}

describe("Ruling 8bb44b90da8bab68 — Glasc dies as the lone defender; Deathknell replays a unit into the same battlefield", () => {
  test("combat cleanup before the Deathknell resolves: Glasc is in the trash with its trigger pending (P2), the surviving attacker is healed to full and NOT recalled (466.1.a.1/2)", async () => {
    const game = await board().build();
    await fightUntilDeathknellPending(game);
    expect(game.state("brute").damage).toBe(0); // healed although it took 5
    expect(game.locationOf("brute")).toBe("bf1"); // no defenders left → no recall
    expect(game.zoneOf("revived")).toBe("trash"); // nothing replayed yet
  });

  // Expected (466.3): the combat's result is only determined after pending triggers — while Glasc's
  // Deathknell is on the chain nobody has won: bf1 is still P2's and P1 has scored nothing.
  // Actual: resolveFullCombat hands bf1 to P1 and awards the conquer point before the trigger resolves.
  test("ruling 8bb44b90da8bab68 — with the Deathknell still pending, the original combat has no winner yet (bf1 still P2's, P1 on 0)", async () => {
    const game = await board().build();
    await fightUntilDeathknellPending(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1] ?? []).toEqual([]);
  });

  // Expected: the Deathknell asks P2 (optional) for a unit in THEIR TRASH costing ≤3 / ≤1 power — "revived"
  // yes, "toobig" no — and P2 may play it to bf1 (still theirs) for free.
  // Actual: the parsed effect targets a unit on the board (it grabs the attacking Brute) and never
  // looks at P2's trash; bf1 has already flipped to P1.
  test.failing("BUG: ruling 8bb44b90da8bab68 — Deathknell: P2 plays 'Revived Help' (cost 2) from trash to bf1 ignoring its cost; the 5-cost unit is not offered", async () => {
    const game = await board().build();
    await fightUntilDeathknellPending(game);
    await resolveDeathknellToBf1(game);
    await game.settle();
    expect(game.locationOf("revived")).toBe("bf1");
    expect(game.state("revived").owner).toBe(P2);
    expect(game.p2.energy()).toBe(0); // ignoring its cost
    expect(game.zoneOf("toobig")).toBe("trash");
    // The enemy that survived is already back to full when the new unit arrives.
    expect(game.state("brute").damage).toBe(0);
    expect(game.locationOf("brute")).toBe("bf1");
  });

  // Expected (466.3.d / 466.3.d.1): both players now have units at bf1 → "No Result": bf1 stays P2's,
  // P1 gains no point, and a fresh showdown+combat is staged at bf1 (Brute attacking, Revived defending).
  // Actual: P1 already conquered and scored bf1 during combat resolution; no second combat.
  test("ruling 8bb44b90da8bab68 — No Result: nobody wins the original combat and a second combat is immediately staged at bf1", async () => {
    const game = await board().build();
    await fightUntilDeathknellPending(game);
    await resolveDeathknellToBf1(game);
    // Drain until the next real decision (do not auto-resolve the new combat).
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || d.kind !== "action" || d.context !== "chain" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("brute").combatRole).toBe("attacker");
    expect(game.state("revived").combatRole).toBe("defender");
  });
});

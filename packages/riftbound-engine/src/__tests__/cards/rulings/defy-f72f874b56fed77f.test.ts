/**
 * Ruling f72f874b56fed77f — Defy (OGN-045 → ogn-045-298) · [Reaction] · 1+[calm] · "Counter a spell that costs no more than [4]
 *     and no more than [rainbow]."
 *   × Abandoned Hall (UNL-205 → unl-205-219) · Battlefield · "When a player plays a spell, they may give a unit they control here
 *     +1 [Might] this turn."
 *
 * Q: If my spell is countered with Defy, do I still get the +1 at Abandoned Hall?
 * A: No. A countered spell never completes its resolution, so it is not "played" for play-triggers (425.1.b / 419.4.a.1): the
 *    Hall's ability never goes on the chain for it. Defy resolves first (LIFO), the countered spell is cleared to the trash.
 * Rules: 419.4.a / 419.4.a.1, 425.1.a–c, 339 (LIFO). Nuance (419.4.b): non-triggered "played" checks (Legion) key off
 *        FINALIZATION, so the countered spell still counts there.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const ABANDONED_HALL = "unl-205-219";
const DREDGE_UP = "ven-049-166"; // Spell · 2 · "Draw 1." — cheap enough for Defy

/** P1's turn. P1 controls Abandoned Hall (live text) with Guard (2) there; Dredge Up + [2]. P2: Defy + exactly 1+[calm]. Known P1 deck top. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("hall", { controller: P1, def: ABANDONED_HALL, inert: false })
    .unit(P1, "hall", { might: 2, name: "Hall Guard" }, "guard")
    .hand(P1, DREDGE_UP, "dredge")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** P1 casts Dredge Up; P1 passes; P2 Defies it. */
async function dredgeDefied(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("dredge");
  expect(game.chain().map((c) => c.cardId)).toEqual(["dredge"]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "defy")).toBe(true);
  await game.p2.cast("defy", { targets: "dredge" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "defy"]);
  return game;
}

describe("Ruling f72f874b56fed77f — a Defied spell earns no Abandoned Hall +1", () => {
  test("control: uncountered, Dredge Up resolves (P1 draws) and THEN the Hall offers P1 its +1, which lands on the Guard", async () => {
    const game = await board().build();
    await game.p1.cast("dredge");
    expect(game.state("guard").might).toBe(2); // merely on the chain: nothing has triggered yet (419.4.a)
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(["yes-no", "pick"]).toContain(d?.kind as string);
    if (d?.kind === "yes-no") {
      await game.p1.yes();
    }
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("guard");
    }
    await game.settle();
    expect(game.state("guard").might).toBe(3);
    expect(game.state("guard").mightModifier).toBe(1);
  });

  test("1–3. Dredge Up waits on the chain as P2 Defies it; Defy resolves first (LIFO) and the countered Dredge Up is cleared to P1's trash — no draw, no refund", async () => {
    const game = await dredgeDefied();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Defy resolves → Dredge Up countered
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual([]); // no "Draw 1"
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.p1.energy()).toBe(0); // 425.1.c
  });

  test("4. trigger failure: no Abandoned Hall item ever appears for P1, P1 is never asked, and the Guard stays at 2 Might", async () => {
    const game = await dredgeDefied();
    const seen: string[][] = [];
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      seen.push(game.chain().map((c) => c.cardId));
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    // Dredge Up only ever shared the chain with Defy — never with a Hall trigger, never alone (it never resolved).
    for (const s of seen.filter((x) => x.includes("dredge"))) {
      expect(s).toEqual(["dredge", "defy"]);
    }
    expect(seen.some((s) => s.includes("hall") && game.chain().some((c) => c.cardId === "hall" && c.controller === P1))).toBe(false);
    const d = game.decision();
    expect(d?.seat === P1 && d.kind !== "action").toBe(false); // no "use Abandoned Hall?" for P1
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("guard")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance (419.4.b): the countered spell was still FINALIZED, so P1's non-triggered 'cards played this turn' count (Legion) keeps it — 1 for P1, and Defy counts 1 for P2", async () => {
    const game = await dredgeDefied();
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.gameState.cardsPlayedThisTurn?.[P2]).toBe(1);
  });
});

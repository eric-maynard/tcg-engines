/**
 * Ruling 99a30c5656f9dd2b — Cruel Patron (OGN-208 → ogn-208-298, 6 Might) × Lecturing Yordle (OGN-087 → ogn-087-298, 2 Might [Tank])
 *   × Sett, Brawler (OGN-164 → ogn-164-298, 4 Might) × Facebreaker (OGN-220 → ogn-220-298) [Hidden][Action]
 *     "Stun a friendly unit and an enemy unit at the same battlefield. (They don't deal combat damage this turn.)"
 *
 * Q: I attack with Cruel Patron + Lecturing Yordle into Sett with a hidden Facebreaker; Facebreaker stuns Sett and my
 *    Cruel Patron; the Yordle alone can't kill Sett — do BOTH my attackers recall?
 * A: Yes. After combat damage both attacking and defending units remain, so all attackers are recalled to base.
 * Rules: 423 (stunned units deal no combat damage), 465–466 (combat damage; 466.1.a.2 attackers recalled if defenders remain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CRUEL_PATRON = "ogn-208-298";
const LECTURING_YORDLE = "ogn-087-298";
const SETT_BRAWLER = "ogn-164-298";
const FACEBREAKER = "ogn-220-298";

/** P1's turn. P2 holds bf1 with Sett (4) and Facebreaker facedown there. P1: Cruel Patron (6) + Lecturing Yordle (2) in base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SETT_BRAWLER, "sett")
    .facedown(P2, "bf1", FACEBREAKER, "fb")
    .unit(P1, "base", CRUEL_PATRON, "patron")
    .unit(P1, "base", LECTURING_YORDLE, "yordle");
}

/** Both attack; P1 passes Focus; P2 flips Facebreaker naming Sett (friendly) + Cruel Patron (enemy); it resolves. */
async function facebreakerLands(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["patron", "yordle"], "bf1");
  expect(game.state("patron").combatRole).toBe("attacker");
  expect(game.state("yordle").combatRole).toBe("attacker");
  expect(game.state("sett").combatRole).toBe("defender");
  await game.p1.passFocus();
  expect(game.p2.can("reveal", "fb")).toBe(true);
  await game.p2.reveal("fb", { answers: ["sett"] });
  const d = game.decision();
  if (d?.kind === "pick") {
    expect(d.seat).toBe(P2);
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["patron", "yordle"]); // the enemy at the SAME battlefield
    await game.p2.pick("patron");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fb", controller: P2, targets: ["sett", "patron"] })]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("fb")).toBe("trash");
  return game;
}

describe("Ruling 99a30c5656f9dd2b — Facebreaker stuns Sett + Cruel Patron; the Yordle can't finish Sett, so both attackers recall", () => {
  test("Facebreaker (played from hidden for 0) resolves: Sett and Cruel Patron are stunned, the Yordle is not", async () => {
    const game = await facebreakerLands();
    expect(game.state("sett").isStunned).toBe(true);
    expect(game.state("patron").isStunned).toBe(true);
    expect(game.state("yordle").isStunned).toBe(false);
    expect(game.p2.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("combat damage: only the Yordle's 2 goes into Sett (4) — not lethal; stunned Sett deals nothing back. Defenders remain → BOTH attackers (stunned Patron and unstunned Yordle alike) are recalled to base; Sett keeps bf1; nobody scores", async () => {
    const game = await facebreakerLands();
    await game.settle();
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
    expect(game.state("sett").damage).toBe(0); // 2 < 4, healed at end of combat
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.zoneOf("yordle")).toBe("base");
    expect(game.state("patron")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.state("yordle")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no Facebreaker: 6 + 2 into Sett kills him and P1 conquers bf1 (Sett's 4 goes to the Tank Yordle first, killing it)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SETT_BRAWLER, "sett")
      .unit(P1, "base", CRUEL_PATRON, "patron")
      .unit(P1, "base", LECTURING_YORDLE, "yordle")
      .build();
    await game.p1.move(["patron", "yordle"], "bf1");
    await game.settle();
    expect(game.zoneOf("sett")).toBe("trash");
    expect(game.zoneOf("yordle")).toBe("trash");
    expect(game.zoneOf("patron")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});

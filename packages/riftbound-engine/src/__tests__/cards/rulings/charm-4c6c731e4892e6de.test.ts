/**
 * Ruling 4c6c731e4892e6de — Charm (OGN-043 → ogn-043-298) · Spell · Calm · 1+[calm] "Move an enemy unit."
 *   × Dragon's Rage (OGN-258 → ogn-258-298) · Spell · Calm/Body · 4+[rainbow] "Move an enemy unit. Then do this: Choose
 *     another enemy unit at its destination. They deal damage equal to their Mights to each other."
 *
 * Q: Can Charm move a unit from one battlefield to another even though the unit lacks Ganking (and nothing grants it)?
 * A: Yes. A spell's "move" ignores the Standard Move rules, so no Ganking is needed. Same for Dragon's Rage.
 * Rules: 445–447 (moves by effects are not the Standard Move), 810 (Ganking only widens the Standard Move), 144.4.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const DRAGONS_RAGE = "ogn-258-298";

/** P1's turn. P2 controls bf1 (X, 3 Might, no keywords) and bf2 (Y, 4 Might). P1 holds Charm and Dragon's Rage. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Unit X" }, "X")
    .unit(P2, "bf2", { might: 4, name: "Unit Y" }, "Y")
    .hand(P1, CHARM, "charm")
    .hand(P1, DRAGONS_RAGE, "rage");
}

describe("Ruling 4c6c731e4892e6de — spell moves go battlefield → battlefield without Ganking", () => {
  test("Charm on X (no Ganking) at bf1: the destination menu includes the OTHER battlefield bf2; picking it moves X there", async () => {
    const game = await board().build();
    expect(game.state("X").keywords).not.toContain("Ganking");
    await game.p1.cast("charm", { targets: "X" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(dests).toContain("battlefield-bf2");
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("X")).toBe("bf2");
    expect(game.state("X").keywords).not.toContain("Ganking"); // nothing granted it either
  });

  test("Dragon's Rage likewise: X (no Ganking) is moved bf1 → bf2, then Y — 'another enemy unit at its destination' — is chosen and they trade Might damage (Y takes 3, X takes 4 and dies)", async () => {
    const game = await board().unit(P2, "bf2", { might: 1, name: "Unit Z" }, "Z").build(); // a second enemy at bf2 → a real choice
    await game.p1.cast("rage", { targets: "X" });
    expect(game.p1.energy()).toBe(1);
    // The destination is P1's choice (asked as the spell is finalized or as the move executes).
    if (game.decision()?.kind !== "pick") {
      const s = await game.settle();
      expect(s.reason).toBe("unanswered");
    }
    let d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("battlefield-bf2");
    await game.p1.pick("battlefield-bf2");
    if (game.decision()?.kind !== "pick") {
      const stop = await game.settle();
      expect(stop.reason).toBe("unanswered");
    }
    // "Then do this: Choose another enemy unit at its destination" — asked of P1 on resolution.
    d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const foes = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(foes.sort()).toEqual(["Y", "Z"]); // "another enemy unit at its destination" — never X itself
    expect(foes).not.toContain("X");
    expect(game.locationOf("X")).toBe("bf2"); // already moved, no Ganking involved
    await game.p1.pick("Y");
    await game.settle();
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.zoneOf("X")).toBe("trash"); // took Y's 4 ≥ 3
    expect(game.state("Y").damage).toBe(3);
    expect(game.locationOf("Y")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });
});

/**
 * Ruling 84c4c801e3caa91f — Wind Wall (OGN-064 → ogn-064-298) · Reaction [3][calm][calm] "Counter a spell."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   Witnesses: Ravenbloom Student (ogn-103-298, "When you play a spell, give me +1 [Might] this turn"),
 *   Noxus Hopeful (ogn-012-298, "[Legion] — I cost [2] less"), Lillia, Fae Fawn (unl-082-219, spawns a Sprite token
 *   when she moves), Fizz, Trickster (sfd-140-221, plays a spell from trash — the "cheated out" case), Cleave (ogn-004-298).
 *
 * Q: What counts as "playing a card"?
 * A: A card is played whether it comes from hand or is cheated out by another effect. Tokens are not cards, so
 *    spawning one is not playing a card. Spells count as played only if they resolve — a countered spell is not
 *    "played" — and its cost is paid before the opponent ever gets the chance to counter it.
 * Rules: 419.4.a / 419.4.a.1 / 425.1.b (countered ⇒ play-triggers don't fire), 425.1.c (no refund), 182 / 184
 *        (tokens are not cards), 812 Legion.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WIND_WALL = "ogn-064-298";
const DEFY = "ogn-045-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const NOXUS_HOPEFUL = "ogn-012-298";
const LILLIA = "unl-082-219";
const FIZZ = "sfd-140-221";
const CLEAVE = "ogn-004-298";

/** P1's turn: Student (2) in base, Cleave in hand with exactly [1]; P2 holds Wind Wall + Defy with [4] + calm×3. */
function counterBoard() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 4, power: { calm: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
    .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, WIND_WALL, "windwall")
    .hand(P2, DEFY, "defy");
}

describe("Ruling 84c4c801e3caa91f — what counts as 'playing a card'", () => {
  test("control: a spell that RESOLVES is played — Ravenbloom Student's 'when you play a spell' fires (+1)", async () => {
    const game = await counterBoard().build();
    await game.p1.cast("cleave", { targets: "grunt" });
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("student").might).toBe(3);
    expect(game.state("grunt").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  });

  test("the spell's cost is paid BEFORE the opponent gets priority to counter it (Wind Wall): P1 is at 0 energy while P2 decides", async () => {
    const game = await counterBoard().build();
    await game.p1.cast("cleave", { targets: "grunt" });
    expect(game.p1.energy()).toBe(0); // paid on finalization
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "windwall")).toBe(true);
    expect(game.p1.energy()).toBe(0);
  });

  test("countered by Wind Wall: the spell is NOT 'played' — Student gets nothing, Cleave does nothing and goes to trash, cost not refunded", async () => {
    const game = await counterBoard().build();
    await game.p1.cast("cleave", { targets: "grunt" });
    await game.p1.passPriority();
    await game.p2.cast("windwall", { targets: "cleave" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("windwall")).toBe("trash");
    expect(game.state("grunt").grantedKeywords).toEqual([]);
    expect(game.state("student").might).toBe(2); // 425.1.b — the play-trigger never fired
    expect(game.p1.energy()).toBe(0); // 425.1.c — no refund
    expect(game.violations()).toEqual([]);
  });

  test("countered by Defy: same — not 'played' for the Student, cost still spent", async () => {
    const game = await counterBoard().build();
    await game.p1.cast("cleave", { targets: "grunt" });
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cleave" });
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("grunt").grantedKeywords).toEqual([]);
    expect(game.state("student").might).toBe(2);
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 2 } });
  });

  test("a card CHEATED OUT by another effect is still played: the spell Fizz plays from the trash fires the Student's trigger too", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
      .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
      .trash(P1, CLEAVE, "cleave")
      .hand(P1, FIZZ, "fizz")
      .build();
    await game.p1.play("fizz", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    // Fizz (a unit) is played: Student does not care. His "you may play a spell from your trash" is asked on finalization.
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "cleave")) {
        await game.p1.pick("cleave");
      } else if (d.kind === "pick" && d.seat === P1 && d.semantics === "target") {
        await game.p1.pick("grunt");
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.state("grunt").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    // The Cleave came from the trash, not the hand — it was still PLAYED: Student +1.
    expect(game.state("student").might).toBe(3);
    expect(game.zoneOf("cleave")).toBe("mainDeck"); // Fizz recycles it afterwards
    expect(game.violations()).toEqual([]);
  });

  test("tokens are not cards: Lillia's move spawns a Sprite token, which does NOT turn on Legion for Noxus Hopeful (still [4]); playing a real card does", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", LILLIA, "lillia")
      .hand(P1, NOXUS_HOPEFUL, "hopeful")
      .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Recruit" }, "recruit")
      .build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.can("play", "hopeful")).toBe(false); // [4] with 3 energy, Legion off
    await game.p1.move("lillia", "bf1");
    await game.settle();
    const sprites = game.findAll({ name: "Sprite", owner: P1 });
    expect(sprites).toHaveLength(1);
    expect(game.locationOf(sprites[0] as string)).toBe("base");
    expect(game.state(sprites[0] as string).isToken).toBe(true);
    // A token entered play — but no CARD was played: Legion is still off.
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.p1.can("play", "hopeful")).toBe(false);
    // Contrast: play a real 1-cost card → Legion on → Hopeful costs [2] and is playable with the 2 energy left.
    await game.p1.play("recruit", { to: "base" });
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "hopeful")).toBe(true);
    await game.p1.play("hopeful", { to: "base" });
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.p1.energy()).toBe(0); // paid the Legion price [2]
  });
});

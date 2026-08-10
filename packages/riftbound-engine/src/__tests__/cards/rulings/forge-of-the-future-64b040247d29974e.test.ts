/**
 * Ruling 64b040247d29974e — Forge of the Future (OGN-212 → ogn-212-298) · Gear · Order · [2]
 *   "When you play this, play a 1 [Might] Recruit unit token at your base. Kill this: Recycle up to 4 cards from trashes."
 *   × Adaptatron (OGN-056 → ogn-056-298) · 3 Might — "When I conquer, you may kill a gear. If you do, buff me."
 *
 * Q: Can I use Forge of the Future's (activated) ability on my opponent's turn?
 * A: No. Activated abilities without [Reaction]/[Action] can only be activated on your own turn in an open state (not
 *    with priority on the opponent's turn, not during a showdown). And "Kill this:" is a COST of an activated ability,
 *    not a trigger — Forge being killed by an opposing Adaptatron recycles nothing.
 * Rules: 374 (activated abilities: your turn, open state), 148.2 (gear abilities: action phase, no showdown), costs vs triggers.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FORGE = "ogn-212-298";
const ADAPTATRON = "ogn-056-298";
const DISCIPLINE = "ogn-058-298";

describe("Ruling 64b040247d29974e — Forge of the Future's 'Kill this:' ability is own-turn/open-state only, and is not a death trigger", () => {
  test("opponent's turn: even while P1 holds priority (responding to P2's Discipline), Forge's ability is not offered", async () => {
    const game = await scenario()
      .active(P2)
      .gear(P1, FORGE, "forge")
      .trash(P1, "ogn-175-298", "junk")
      .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt")
      .hand(P2, DISCIPLINE, "disc")
      .resources(P2, { energy: 2 })
      .build();
    expect(game.p1.legal()).toEqual([]); // P2's open main phase: P1 has nothing at all
    await game.p2.cast("disc", { targets: "grunt" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "forge")).toBe(false);
    expect((await game.p1.try((p) => p.activate("forge"))).ok).toBe(false);
    expect(game.zoneOf("forge")).toBe("base");
    expect(game.zoneOf("junk")).toBe("trash");
  });

  test("own turn, open state: the ability IS available — killing Forge recycles the trash card", async () => {
    const game = await scenario().gear(P1, FORGE, "forge").trash(P1, "ogn-175-298", "junk").build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "forge")).toBe(true);
    await game.p1.activate("forge");
    expect(game.zoneOf("forge")).toBe("trash"); // cost paid
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        const o = d.options.find((x) => (x.card ?? x.key) === "junk") ?? d.options[0]!;
        await game.p1.pick(o.card ?? o.key);
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("junk")).toBe("mainDeck");
    expect(game.violations()).toEqual([]);
  });

  test("own turn but DURING A SHOWDOWN (P1 just moved onto an open battlefield): not an open state — the ability is not offered", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
      .gear(P1, FORGE, "forge")
      .trash(P1, "ogn-175-298", "junk")
      .build();
    expect(game.p1.can("activate", "forge")).toBe(true); // open state: yes
    await game.p1.move("walker", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "forge")).toBe(false); // showdown: no
  });

  test("FAQ note — an opposing Adaptatron conquers and kills Forge: that is not 'Kill this:' being activated, so nothing is recycled (junk stays in P1's trash); Adaptatron gets its buff", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: null })
      .unit(P2, "base", ADAPTATRON, "ada")
      .gear(P1, FORGE, "forge")
      .trash(P1, "ogn-175-298", "junk")
      .build();
    await game.p2.move("ada", "bf1");
    // Drive the conquer: pass focus; accept Adaptatron's "you may kill a gear" and choose Forge when asked.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d) {
        break;
      }
      if (d.kind === "yes-no" && d.seat === P2) {
        await game.p2.yes();
      } else if (d.kind === "pick" && d.seat === P2) {
        const o = d.options.find((x) => (x.card ?? x.key) === "forge") ?? d.options[0]!;
        await game.p2.pick(o.card ?? o.key);
      } else if (d.kind === "action" && d.context === "main") {
        break;
      } else if (d.kind === "action") {
        await game.acting().pass();
      } else {
        // Anything asked of P1 here would already contradict the ruling (no recycle prompt) — stop and let asserts fail.
        break;
      }
    }
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("forge")).toBe("trash");
    expect(game.state("ada").isBuffed).toBe(true);
    expect(game.zoneOf("junk")).toBe("trash"); // nothing recycled
    expect(game.p1.trash().sort()).toEqual(["forge", "junk"]);
    expect(game.violations()).toEqual([]);
  });
});

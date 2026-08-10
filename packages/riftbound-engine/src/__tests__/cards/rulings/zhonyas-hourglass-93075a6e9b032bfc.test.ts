/**
 * Ruling 93075a6e9b032bfc — Zhonya's Hourglass (OGN-077 → ogn-077-298, Gear [2] [Hidden]: "If a friendly unit would die,
 *   kill this instead. Heal that unit, exhaust it, and recall it.") × Malzahar, Fanatic (OGN-113 → ogn-113-298: "Kill a
 *   friendly unit or gear, [Exhaust]: [Action] — [Add] [rainbow][rainbow].")
 *
 * Q: Can you respond to any part or step of Zhonya's Hourglass?
 * A: No. Its save is a replacement effect (never on the chain), and playing it — even from hidden at reaction speed —
 *    is playing a permanent, which resolves without giving anyone priority. Same for [Add] abilities like Malzahar's.
 * Rules: 339–340 (permanents don't open a priority window), 369–372 (replacement effects don't use the chain),
 *        429.2 (Add abilities can't be reacted to), 811 (play from Hidden).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const MALZAHAR = "ogn-113-298";
const DEFY = "ogn-045-298";

describe("Ruling 93075a6e9b032bfc — nothing about Zhonya's Hourglass (or an [Add] ability) can be responded to", () => {
  test("played from hand: the gear simply lands in base — no chain item, the opponent (holding a Reaction) never receives priority, P1 keeps the open main phase", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .hand(P1, ZHONYAS, "zh")
      .hand(P2, DEFY, "defy")
      .build();
    await game.p1.play("zh");
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal().map((o) => o.verb)).not.toContain("cast"); // no window for Defy at any point
    expect(game.p1.energy()).toBe(0);
  });

  test("flipped from hidden mid-showdown at reaction speed: it becomes a permanent at once (no 'respond to Zhonya's' priority for P2), and when the Guard would die the save happens with NO chain item — Zhonya's to trash, Guard healed/exhausted/recalled", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .facedown(P1, "bf1", ZHONYAS, "zh")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .hand(P2, DEFY, "defy")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.reveal("zh");
    expect(game.state("zh").isHidden).toBe(false);
    expect(game.chain().some((c) => c.cardId === "zh")).toBe(false); // never a chain item
    // P2's next decision is ordinary Focus / nothing to respond to — not chain priority over Zhonya's.
    const d = game.decision();
    expect(d?.kind === "action" && d.context === "chain" && game.chain().some((c) => c.cardId === "zh")).toBe(false);
    // Let combat happen: Guard (2) takes 5 and WOULD die → replaced, again without any chain item.
    const chainCardsSeen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      for (const c of game.chain()) {
        chainCardsSeen.add(c.cardId);
      }
      const r = await game.settle();
      if (r.reason !== "unanswered") {
        break;
      }
      const dd = game.decision();
      if (dd?.kind === "pick") {
        await game.seat(dd.seat).pick(dd.options[0]?.key as string);
      } else {
        break;
      }
    }
    expect(chainCardsSeen.has("zh")).toBe(false);
    expect(game.zoneOf("zh")).toBe("trash"); // "kill this instead"
    expect(game.zoneOf("guard")).toBe("base");
    expect(game.state("guard")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2); // Raider took the now-empty battlefield
    expect(game.zoneOf("defy")).toBe("hand"); // P2 never had anything to counter
    expect(game.violations()).toEqual([]);
  });

  test("likewise an [Add] ability (Malzahar: kill a friendly gear, exhaust → [Add] 2 [rainbow]) resolves on the spot: resources appear immediately, no chain, no priority for the opponent", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .unit(P1, "base", MALZAHAR, "malz")
      .gear(P1, { name: "Trinket" }, "trinket")
      .hand(P2, DEFY, "defy")
      .build();
    expect(game.p1.power("rainbow")).toBe(0);
    await game.p1.activate("malz", undefined, { sacrifice: "trinket" });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("trinket");
    }
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(game.state("malz").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(2); // added at once
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

import { P1, applyMove, createBattlefield, createCard, createMinimalGameState, getCardMeta } from "./src/__tests__/rules-audit/helpers";
import type { CardId } from "./src/types";

const NO_DAMAGE_WHEN_MOVED_TWICE = [
  {
    condition: { text: "If I have moved twice this turn", type: "custom" },
    effect: { restriction: "no-damage", type: "restriction" },
    type: "static",
  },
] as any;

const engine = createMinimalGameState({ currentPlayer: P1, phase: "main" });
createBattlefield(engine, "bf-1", { controller: P1 });
createBattlefield(engine, "bf-2", { controller: P1 });
createBattlefield(engine, "bf-3", { controller: P1 });
createCard(engine, "kayn" as CardId, {
  abilities: NO_DAMAGE_WHEN_MOVED_TWICE,
  cardType: "unit",
  keywords: ["Ganking"],
  might: 6,
  owner: P1,
  zone: "battlefield-bf-1",
});

console.log("Before r1, phase:", (engine.getState() as any).turn.phase);
const r1 = applyMove(engine, "gankingMove", {
  playerId: P1,
  toBattlefield: "bf-2",
  unitId: "kayn",
});
console.log("r1 success:", r1.success, "phase after:", (engine.getState() as any).turn.phase);
console.log("r1 movedCount:", getCardMeta(engine, "kayn" as CardId)?.movedThisTurnCount);

const internal = engine as any;
internal.internalState.cardMetas.kayn.exhausted = false;
if (internal.internalState.cardMetas.kayn.__flags) {
  internal.internalState.cardMetas.kayn.__flags.exhausted = false;
}

const stateBefore = engine.getState() as any;
console.log("Phase before r2:", stateBefore.turn.phase);
const fm = engine.getFlowManager();
console.log("FM gameState phase:", (fm?.getGameState() as any)?.turn?.phase);
console.log("FM current phase:", fm?.getCurrentPhase());

const r2 = applyMove(engine, "gankingMove", {
  playerId: P1,
  toBattlefield: "bf-3",
  unitId: "kayn",
});
console.log("r2 success:", r2.success, "error:", (r2 as any).error);
console.log("Phase after r2:", (engine.getState() as any).turn.phase);

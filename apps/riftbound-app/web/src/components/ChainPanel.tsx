/**
 * ChainPanel — renders the engine's chain (spell stack) in LIFO order.
 *
 * Phase B batch 25 EEE: the engine's chain state lives at
 * `state.interaction.chain.items` and was previously invisible to the SPA.
 * This panel renders items top-of-stack-first (LIFO) so the player can see
 * what will resolve next.
 *
 * Data shape: `view.chain` (api.ts `ChainView`). When undefined or
 * items.length === 0, this renders nothing.
 */

import type { ActionsLegal, ChainView } from "../lib/api";

interface ChainPanelProps {
  readonly chain: ChainView | undefined;
  /**
   * Phase B batch 26 GGG — action wiring. Local seat is used to gate the
   * "Pass Priority" button: only the player who currently has focus can
   * pass. `actionsLegal.passChainPriority` is the engine-derived legality.
   */
  readonly localPlayerId?: string;
  readonly actionsLegal?: ActionsLegal;
  readonly disabled?: boolean;
  readonly onPassPriority?: () => void;
}

export function ChainPanel({
  chain,
  localPlayerId,
  actionsLegal,
  disabled,
  onPassPriority,
}: ChainPanelProps) {
  if (!chain || chain.items.length === 0) {
    return null;
  }
  // LIFO: items[items.length - 1] resolves first. We render top of stack at
  // The top of the list so the player reads it like a stack.
  const lifo = [...chain.items].toReversed();
  const localHasFocus = Boolean(localPlayerId) && chain.focusOwner === localPlayerId;
  const canPassPriority = Boolean(actionsLegal?.passChainPriority) && localHasFocus;
  return (
    <section className="chain-panel" data-testid="chain-panel">
      <header className="chain-panel-header">
        <h3 className="chain-panel-title">Chain ({chain.items.length})</h3>
        <span data-testid="chain-focus">focus: {chain.focusOwner || "(resolving)"}</span>
      </header>
      <ol className="chain-panel-items">
        {lifo.map((item, idx) => (
          <li
            key={item.id}
            className={
              item.countered ? "chain-panel-item countered" : "chain-panel-item"
            }
            data-testid={`chain-item-${item.id}`}
            data-lifo-index={idx}
            data-countered={item.countered ? "true" : "false"}
          >
            <span className="chain-panel-item-summary">{item.summary}</span>
            <span className="chain-panel-item-source">
              by {item.source.cardName ?? item.source.cardId} (
              {item.source.playerId})
            </span>
          </li>
        ))}
      </ol>
      {onPassPriority ? (
        <footer
          className="chain-panel-actions"
          data-testid="chain-panel-actions"
        >
          <button
            type="button"
            data-testid="chain-pass-priority"
            disabled={disabled || !canPassPriority}
            title={
              !canPassPriority ? "Pass Priority not legal right now" : undefined
            }
            onClick={() => onPassPriority()}
          >
            Pass Priority
          </button>
        </footer>
      ) : null}
    </section>
  );
}

/**
 * Chain & Showdown State Machine
 *
 * Implements rules 532-553: the Chain (spell stack) and Showdown (combat window).
 *
 * ## Chain (rules 532-544)
 * The Chain is a LIFO stack of spells and abilities.
 * - Created when a card is played or ability activated
 * - Only Reaction spells/abilities can be added during a chain (Closed State)
 * - Priority passes between Relevant Players
 * - When all pass, top item resolves, then priority resets
 * - Repeat until chain is empty
 *
 * ## Showdown (rules 545-553)
 * A Showdown is a window where players can play Action/Reaction spells.
 * - Opens when a battlefield becomes contested
 * - Focus passes between Relevant Players
 * - Each spell played creates a chain
 * - When all pass, showdown ends → combat occurs (if contested)
 *
 * ## Turn States (rule 510)
 * - Neutral Open: no showdown, no chain → play anything on your turn
 * - Neutral Closed: no showdown, chain exists → only Reaction
 * - Showdown Open: showdown active, no chain → Action or Reaction
 * - Showdown Closed: showdown active, chain exists → only Reaction
 */

/**
 * An item on the chain (spell or ability).
 */
export interface ChainItem {
  /** Unique ID for this chain item */
  readonly id: string;
  /** Type of item */
  readonly type: "spell" | "permanent" | "ability";
  /** Card ID (for spells/permanents) or source card ID (for abilities) */
  readonly cardId: string;
  /** Player who played/activated this */
  readonly controller: string;
  /** The effect to execute when this resolves */
  readonly effect?: unknown;
  /** Whether this is a triggered ability (auto-added, not player-initiated) */
  readonly triggered?: boolean;
  /** Whether this item was countered (skip execution on resolve) */
  readonly countered?: boolean;
}

/**
 * Current state of the chain system.
 */
export interface ChainState {
  /** Items on the chain (LIFO — last item resolves first) */
  readonly items: ChainItem[];

  /** Whether a chain currently exists (items.length > 0) */
  readonly active: boolean;

  /** Relevant players for this chain (who can act) */
  readonly relevantPlayers: string[];

  /** Current active player (has priority) */
  readonly activePlayer: string;

  /** Players who have passed since the last chain action */
  readonly passedPlayers: string[];

  /** Turn order (for cycling priority) */
  readonly turnOrder: string[];
}

/**
 * Current state of a showdown.
 */
export interface ShowdownState {
  /** Whether a showdown is active */
  readonly active: boolean;

  /** Battlefield where the showdown is occurring */
  readonly battlefieldId: string;

  /** Player who has Focus */
  readonly focusPlayer: string;

  /** Relevant players for this showdown */
  readonly relevantPlayers: string[];

  /** Players who have passed Focus since last action */
  readonly passedPlayers: string[];

  /** Whether this showdown is part of combat */
  readonly isCombatShowdown: boolean;

  /** The attacking player (if combat showdown) */
  readonly attackingPlayer?: string;

  /** The defending player (if combat showdown) */
  readonly defendingPlayer?: string;
}

/**
 * Combined turn state including chain and showdown.
 */
export interface TurnInteractionState {
  /** Current chain state (null if no chain) */
  chain: ChainState | null;

  /** Stack of showdown states (top = active showdown, empty = no showdown) */
  showdownStack: ShowdownState[];

  /** Counter for generating unique chain item IDs */
  nextChainItemId: number;
}

/**
 * Get the active (top-of-stack) showdown, or null if no showdown is active.
 */
export function getActiveShowdown(state: TurnInteractionState): ShowdownState | null {
  return state.showdownStack.length > 0
    ? state.showdownStack[state.showdownStack.length - 1]
    : null;
}

/**
 * The four possible turn states (rule 510).
 */
export type TurnStateType = "neutral-open" | "neutral-closed" | "showdown-open" | "showdown-closed";

/**
 * Determine the current turn state.
 */
export function getTurnState(interaction: TurnInteractionState): TurnStateType {
  const activeShowdown = getActiveShowdown(interaction);
  const hasShowdown = activeShowdown?.active ?? false;
  const hasChain = interaction.chain?.active ?? false;

  if (hasShowdown && hasChain) {
    return "showdown-closed";
  }
  if (hasShowdown && !hasChain) {
    return "showdown-open";
  }
  if (!hasShowdown && hasChain) {
    return "neutral-closed";
  }
  return "neutral-open";
}

/**
 * Check if a spell timing is legal in the current turn state.
 *
 * - Neutral Open: Action and Reaction
 * - Neutral Closed: Reaction only (rule 535.1)
 * - Showdown Open: Action and Reaction (rule 546)
 * - Showdown Closed: Reaction only
 */
export function isLegalTiming(timing: "action" | "reaction", turnState: TurnStateType): boolean {
  if (timing === "reaction") {
    return true;
  } // Always legal
  // Action is legal in open states
  return turnState === "neutral-open" || turnState === "showdown-open";
}

/**
 * Create an empty interaction state.
 */
export function createInteractionState(): TurnInteractionState {
  return {
    chain: null,
    nextChainItemId: 1,
    showdownStack: [],
  };
}

// ============================================================================
// Chain Operations
// ============================================================================

/**
 * Start a new chain or add to an existing chain (rule 537).
 *
 * @param state - Current interaction state
 * @param item - Item to add
 * @param turnOrder - Player turn order
 * @returns Updated interaction state
 */
export function addToChain(
  state: TurnInteractionState,
  item: Omit<ChainItem, "id">,
  turnOrder: string[],
): TurnInteractionState {
  const chainItem: ChainItem = {
    ...item,
    id: `chain-${state.nextChainItemId}`,
  };

  // If permanent, it resolves immediately (rule 538)
  if (item.type === "permanent") {
    return {
      ...state,
      nextChainItemId: state.nextChainItemId + 1,
      // Don't create a chain for permanents
    };
  }

  const existingItems = state.chain?.items ?? [];
  const activeShowdown = getActiveShowdown(state);
  const relevantPlayers =
    state.chain?.relevantPlayers ?? activeShowdown?.relevantPlayers ?? turnOrder;

  return {
    ...state,
    chain: {
      active: true,
      items: [...existingItems, chainItem],
      relevantPlayers,
      activePlayer: item.controller,
      passedPlayers: [], // Reset passes when new item added
      turnOrder,
    },
    nextChainItemId: state.nextChainItemId + 1,
  };
}

/**
 * Pass priority to the next relevant player (rule 540.4).
 *
 * @returns Updated state. If all have passed, chain is ready to resolve.
 */
export function passPriority(state: TurnInteractionState): TurnInteractionState {
  if (!state.chain) {
    return state;
  }

  const { activePlayer, relevantPlayers, passedPlayers, turnOrder } = state.chain;

  // Mark current player as passed
  const newPassed = [...passedPlayers, activePlayer];

  // Check if all relevant players have passed (rule 540.4.b)
  const allPassed = relevantPlayers.every((p) => newPassed.includes(p));

  if (allPassed) {
    // All passed — chain is ready to resolve
    return {
      ...state,
      chain: {
        ...state.chain,
        activePlayer: "",
        passedPlayers: newPassed, // No one has priority
      },
    };
  }

  // Find next relevant player in turn order
  const currentIdx = turnOrder.indexOf(activePlayer);
  let nextPlayer = activePlayer;
  for (let i = 1; i <= turnOrder.length; i++) {
    const candidate = turnOrder[(currentIdx + i) % turnOrder.length];
    if (relevantPlayers.includes(candidate) && !newPassed.includes(candidate)) {
      nextPlayer = candidate;
      break;
    }
  }

  return {
    ...state,
    chain: {
      ...state.chain,
      activePlayer: nextPlayer,
      passedPlayers: newPassed,
    },
  };
}

/**
 * Check if all relevant players have passed (chain ready to resolve).
 */
export function allPlayersPassed(state: TurnInteractionState): boolean {
  if (!state.chain) {
    return false;
  }
  return state.chain.relevantPlayers.every((p) => state.chain!.passedPlayers.includes(p));
}

/**
 * Resolve the top item on the chain (rule 543).
 *
 * @returns The resolved item and updated state.
 */
export function resolveTopItem(state: TurnInteractionState): {
  resolved: ChainItem | null;
  newState: TurnInteractionState;
} {
  if (!state.chain || state.chain.items.length === 0) {
    return { newState: { ...state, chain: null }, resolved: null };
  }

  const items = [...state.chain.items];
  const resolved = items.pop()!;

  if (items.length === 0) {
    // Chain is now empty
    return {
      newState: { ...state, chain: null },
      resolved,
    };
  }

  // Chain still has items — reset passes, give priority to controller of new top item
  const newTopController = items[items.length - 1].controller;
  return {
    newState: {
      ...state,
      chain: {
        ...state.chain,
        activePlayer: newTopController,
        items,
        passedPlayers: [], // Everyone must pass again (rule 543.4)
      },
    },
    resolved,
  };
}

// ============================================================================
// Showdown Operations
// ============================================================================

/**
 * Start a showdown at a battlefield (rule 548).
 */
export function startShowdown(
  state: TurnInteractionState,
  battlefieldId: string,
  focusPlayer: string,
  relevantPlayers: string[],
  isCombat: boolean,
  attackingPlayer?: string,
  defendingPlayer?: string,
): TurnInteractionState {
  const newShowdown: ShowdownState = {
    active: true,
    attackingPlayer,
    battlefieldId,
    defendingPlayer,
    focusPlayer,
    isCombatShowdown: isCombat,
    passedPlayers: [],
    relevantPlayers,
  };

  return {
    ...state,
    showdownStack: [...state.showdownStack, newShowdown],
  };
}

/**
 * Pass focus to the next relevant player in a showdown (rule 553.4-553.5).
 *
 * @returns Updated state. If all have passed, showdown should end.
 */
export function passFocus(state: TurnInteractionState): TurnInteractionState {
  const activeShowdown = getActiveShowdown(state);
  if (!activeShowdown) {
    return state;
  }

  const { focusPlayer, relevantPlayers, passedPlayers } = activeShowdown;

  const newPassed = [...passedPlayers, focusPlayer];

  // Check if all relevant players have passed (rule 553.4.a)
  const allPassed = relevantPlayers.every((p) => newPassed.includes(p));

  const stackCopy = [...state.showdownStack];
  const topIndex = stackCopy.length - 1;

  if (allPassed) {
    // Showdown ends
    stackCopy[topIndex] = {
      ...activeShowdown,
      active: false,
      passedPlayers: newPassed,
    };
    return {
      ...state,
      showdownStack: stackCopy,
    };
  }

  // Find next relevant player for focus
  // Use turnOrder from chain if available, otherwise just cycle through relevant players
  const currentIdx = relevantPlayers.indexOf(focusPlayer);
  let nextFocus = focusPlayer;
  for (let i = 1; i <= relevantPlayers.length; i++) {
    const candidate = relevantPlayers[(currentIdx + i) % relevantPlayers.length];
    if (!newPassed.includes(candidate)) {
      nextFocus = candidate;
      break;
    }
  }

  stackCopy[topIndex] = {
    ...activeShowdown,
    focusPlayer: nextFocus,
    passedPlayers: newPassed,
  };

  return {
    ...state,
    showdownStack: stackCopy,
  };
}

/**
 * Check if showdown has ended (all relevant players passed).
 */
export function isShowdownEnded(state: TurnInteractionState): boolean {
  const activeShowdown = getActiveShowdown(state);
  if (!activeShowdown) {
    return true;
  }
  return !activeShowdown.active;
}

/**
 * End the showdown and clean up.
 */
export function endShowdown(state: TurnInteractionState): TurnInteractionState {
  if (state.showdownStack.length === 0) {
    return state;
  }

  const newStack = state.showdownStack.slice(0, -1);

  // If there's a resumed showdown underneath, reset its passedPlayers
  // So players can re-evaluate after the nested showdown resolved.
  if (newStack.length > 0) {
    const topIndex = newStack.length - 1;
    newStack[topIndex] = {
      ...newStack[topIndex],
      passedPlayers: [],
    };
  }

  return {
    ...state,
    showdownStack: newStack,
  };
}

/**
 * Reset passed players in a showdown (when a new action is taken).
 */
export function resetShowdownPasses(state: TurnInteractionState): TurnInteractionState {
  const activeShowdown = getActiveShowdown(state);
  if (!activeShowdown) {
    return state;
  }

  const stackCopy = [...state.showdownStack];
  stackCopy[stackCopy.length - 1] = {
    ...activeShowdown,
    passedPlayers: [],
  };

  return {
    ...state,
    showdownStack: stackCopy,
  };
}

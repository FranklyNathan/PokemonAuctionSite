import { updateSelectedPlayerCard, hideSelectedPlayerCard } from './html.js';

export function playerSelected(playerData, speciesInfoMap, allPlayers) {
  hideSelectedPlayerCard(); // Clear previous content first
  updateSelectedPlayerCard(playerData, speciesInfoMap, allPlayers);
}

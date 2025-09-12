import { updateSelectedPlayerCard, toast, hideSelectedPlayerCard, enableRaiseButtons } from './html.js';

export function playerSelected(ctx, playerData) {
  console.log('[Debug] playerSelected called with player:', playerData);
  // if this is the client who is up to choose a player, update the player card to show the player
  if (ctx.stateId == 'player_selection' && ctx.myClientId == ctx.currentlySelectingTeam) {
    console.log('[Debug] Conditions met to process player selection.');
    enableRaiseButtons();
    const player = ctx.playersTableData[playerData.playerId];
    if (!player || player.pickedBy) {
      console.log('[Debug] Selected player is invalid or already drafted.');
      toast('Invalid Selection', 'The selected player has already been drafted!', 'danger');
      return; // Stop further execution if player is invalid
    }
    ctx.selectedPlayerId = playerData.playerId;
    console.log('[Debug] Updating selected player card for player ID:', playerData.playerId);
    updateSelectedPlayerCard(playerData, ctx.extraPlayerStatsFields);
  } else {
    console.log('[Debug] Conditions not met to process player selection. State:', ctx.stateId, 'My Client ID:', ctx.myClientId, 'Selecting Team:', ctx.currentlySelectingTeam);
  }
}

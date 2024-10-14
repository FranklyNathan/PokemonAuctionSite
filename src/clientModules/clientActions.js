import { updateSelectedPlayerCard, toast, hideSelectedPlayerCard, enableRaiseButtons } from './html.js';

export function playerSelected(ctx, playerData) {
  // if this is the client who is up to choose a player, update the player card to show the player
  if (ctx.stateId == 'player_selection' && ctx.myClientId == ctx.currentlySelectingTeam) {
    enableRaiseButtons();
    if (
      playerData.playerId >= ctx.playersTableData.length ||
      typeof ctx.playersTableData[playerData.playerId].drafted != 'boolean' ||
      ctx.playersTableData[playerData.playerId].drafted
    ) {
      toast('Invalid Selection', 'The selected player has already been drafted!', 'danger');
    }
    ctx.selectedPlayerId = playerData.playerId;
    updateSelectedPlayerCard(playerData, ctx.extraPlayerStatsFields);
  }
}

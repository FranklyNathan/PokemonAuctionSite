import { fireConfetti } from './confetti.js';
import {
  addDraftLog,
  updateTeamConnected,
  updateRemainingFunds,
  updateCurrentBid,
  updateHighestBidder,
  updateCurrentlySelectingTeam,
  removeSelectingIndicator,
  updateRaiseButtonsLabel,
  hideSelectedPlayerCard,
  updateSelectedPlayerCard,
  jiggleCurrentBid,
  clearHighestBidder,
  resetTimerTime,
  toast,
  updateTeamRosterCount,
  moveTeamToCompleteSection,
  disableRaiseButtons,
  enableRaiseButtons,
} from './html.js';

/*
ctx: {
  teams: {
    [clientId]: number: {
      clientId: number,
      teamName: string,
      remainingFunds: number,
      connected: boolean,
      ready: boolean,
    }
  }
  playersTableData: [],
  myClientId: number,
  stateId: string,
  selectedPlayerId: number,
  currentBid: number,
  highestBidder: number,
  currentlySelectingTeam: number,
  timer: CountDownTimer,
  biddingTimeLimit: number,
  playerSelectionTimeLimit: number,
}
*/
/**
 * Records who got what player. Takes whoever is currently being
 *   bid on and adds them to the current highest bidder. The only
 *   change to make is to update the datatable showing that the
 *   player is no longer available, and who drafted them.
 * Called when moving out of the bidding phase.
 */
function recordDraft(ctx) {
  // in order to avoid iterating over the array looking for the
  //   the correct playerId, this assumes the playerIds are
  //   already in ascending order starting at zero. which should
  //   always be true.
  if (ctx.selectedPlayerId != ctx.playersTableData[ctx.selectedPlayerId].playerId) {
    console.error('ctx.playersTableData is not in sorted order playerId!! Failed to mark player as drafted.');
    return;
  }
  ctx.playersTableData[ctx.selectedPlayerId].drafted = true;
  ctx.playersTableData[ctx.selectedPlayerId].pickedBy = ctx.teams[ctx.highestBidder].teamName;
  ctx.playersTableData[ctx.selectedPlayerId].cost = ctx.currentBid;

  addDraftLog(ctx.teams[ctx.highestBidder].teamName, ctx.currentBid, ctx.playersTableData[ctx.selectedPlayerId].name);

  // update the table row
  const row = ctx.playersTable.getRowNode(
    ctx.playersTableData[ctx.selectedPlayerId].team + ctx.playersTableData[ctx.selectedPlayerId].name,
  );
  row.setData(ctx.playersTableData[ctx.selectedPlayerId]);
  ctx.playersTable.refreshClientSideRowModel(); // refresh the filtering so if a user is filtered on draft status it shows new draft

  // clear the highest bidder and highest bid
  clearHighestBidder();

  // celebrate if this is the highest bidder and they just drafted a player
  if (ctx.highestBidder == ctx.myClientId) {
    fireConfetti();
  }
}

function isTeamDoneDrafting(ctx, team) {
  return team.rosterCount >= ctx.maxRosterSize || team.remainingFunds <= 0;
}

function handleServerUpdate(msg, ctx) {
  if (!msg.hasOwnProperty('stateId')) {
    toast('Invalid message!', 'A message from the server is missing the `stateId` field', 'danger');
    return;
  }

  // update the UI if their are changes
  if (msg.stateId != ctx.stateId) {
    // handle state change
    // if we are entering bidding or player selection then restart the timer
    ctx.timer.stop();
    // reset the player card to empty
    hideSelectedPlayerCard(ctx.teams?.[msg.currentlySelectingTeam]?.teamName);
    switch (msg.stateId) {
      case 'bidding':
        // for the initial bid right after a player is selected, allow twice as long so teams
        //   have time to look up the player and stats
        ctx.currentTimeLimit = ctx.biddingTimeLimit * 2;
        ctx.timer.updateDuration(ctx.biddingTimeLimit * 2);
        ctx.timer.start();
        // update the raise buttons label back to be "raise" if this is the
        //   client who was just selecting a player. the label for them is
        //   currently "bid".
        if (ctx.myClientId == ctx.currentlySelectingTeam) {
          updateRaiseButtonsLabel(true);
        } else if (!isTeamDoneDrafting(ctx, ctx.teams[ctx.myClientId])) {
          // only enable the raise buttons if this team is still drafting
          enableRaiseButtons();
        }
        // remove the 'selecting' indicator from the team that just selected
        removeSelectingIndicator(ctx);
        // set the player card to the selected player
        if (msg.selectedPlayerId != undefined) {
          const playerData = ctx.playersTableData[msg.selectedPlayerId];
          updateSelectedPlayerCard(playerData, ctx.extraPlayerStatsFields);
        }
        break;
      case 'player_selection':
        // if previous state was bidding, the highest bidder got the player!
        if (ctx.stateId == 'bidding') {
          recordDraft(ctx);
        }
        disableRaiseButtons();
        ctx.currentTimeLimit = ctx.playerSelectionTimeLimit;
        ctx.timer.updateDuration(ctx.playerSelectionTimeLimit);
        ctx.timer.start();
        if (msg.currentlySelectingTeam != undefined) {
          const previouslySelectingTeam = ctx.currentlySelectingTeam || 0;
          ctx.currentlySelectingTeam = msg.currentlySelectingTeam;
          updateCurrentlySelectingTeam(ctx, previouslySelectingTeam);
        }
        // if this client is selecting a player, the raise buttons are now used
        //   as starting bid buttons. update the label to say "bid" instead of "raise"
        if (ctx.myClientId == ctx.currentlySelectingTeam) {
          updateRaiseButtonsLabel(false);
        }
        break;
      case 'post_auction':
        // go to the results page
        window.location.href = window.location.href + '/results';
        return;
      default:
        // reset the timer UI
        resetTimerTime();
    }

    ctx.stateId = msg.stateId;
  } else if (ctx.stateId == 'bidding' && msg.currentBid != ctx.currentBid) {
    // if we didn't change state in bidding, and the current bid was updated, someone
    //   just made a higher bid. reset the timer so that others have time to
    //   bid now
    ctx.timer.stop();
    // first bid after player selection is doubled, reset it to the regular bidding limit
    ctx.currentTimeLimit = ctx.biddingTimeLimit;
    ctx.timer.updateDuration(ctx.biddingTimeLimit);
    ctx.timer.start();
  } else if (ctx.stateId == 'player_selection' && msg.currentlySelectingTeam != ctx.currentlySelectingTeam) {
    // if we are in the player_selection state, and the team that was supposed to pick a
    //   player timed out, we will get a message with a different `currentlySelectingTeam`.
    hideSelectedPlayerCard(ctx.teams?.[msg.currentlySelectingTeam]?.teamName);
    ctx.timer.stop();
    ctx.timer.start();
    // if this client is the client now selecting, update the raise buttons label to be 'bid', otherwise
    //   set it back to 'raise'.
    updateRaiseButtonsLabel(ctx.myClientId == ctx.currentlySelectingTeam);

    // update the selecting indicator
    removeSelectingIndicator(ctx); // remove existing selecting indicator
    const previouslySelectingTeam = ctx.currentlySelectingTeam || 0;
    ctx.currentlySelectingTeam = msg.currentlySelectingTeam;
    updateCurrentlySelectingTeam(ctx, previouslySelectingTeam);
  }

  if (msg.peers) {
    for (const peer of msg.peers) {
      if (peer.clientId == undefined) continue;
      // for each value of peer, see if we need to make a UI update
      // remaining funds
      if (typeof peer.remainingFunds == 'number' && ctx.teams[peer.clientId]?.remainingFunds != peer.remainingFunds) {
        updateRemainingFunds(peer);
      }

      // Possibly update the team's connected/ready indicators in the top bar.
      // If either the connected flag or ready flag have changed, make updates.
      if (
        (typeof peer.connected == 'boolean' && ctx.teams[peer.clientId].connected != peer.connected) ||
        (typeof peer.ready == 'boolean' && ctx.teams[peer.clientId].ready != peer.ready)
      ) {
        ctx.teams[peer.clientId].connected = peer.connected;
        ctx.teams[peer.clientId].ready = peer.ready;
        updateTeamConnected(ctx.teams[peer.clientId]);
      }

      // roster count
      if (typeof peer.rosterCount == 'number' && ctx.teams[peer.clientId]?.rosterCount != peer.rosterCount) {
        ctx.teams[peer.clientId].rosterCount = peer.rosterCount;
        updateTeamRosterCount(peer.clientId, peer.rosterCount, ctx.maxRosterSize);
      }

      // If the team is done selecting (either has a full roster or is out of money), move
      //   them to the complete roster section
      if (isTeamDoneDrafting(ctx, peer)) {
        moveTeamToCompleteSection(peer.clientId);
      }
    }
  }

  if (typeof msg.currentBid == 'number' && msg.currentBid != ctx.currentBid) {
    ctx.currentBid = msg.currentBid;
    updateCurrentBid(ctx);
    jiggleCurrentBid();
  }

  if (typeof msg.highestBidder == 'number' && msg.highestBidder != ctx.highestBidder) {
    ctx.highestBidder = msg.highestBidder;
    updateHighestBidder(ctx);
  }

  if (msg.selectedPlayerId != ctx.selectedPlayerId) {
    ctx.selectedPlayerId = msg.selectedPlayerId;
  }
}

/*
type msg {
  type: string;
  stateId: string;
  peers?: {
    clientId: number;
    remainingFunds: number;
    connected: boolean;
    ready: boolean;
  };
  currentBid: number;
  highestBidder: number;
  currentlySelectingTeam: number;
  selectedPlayerId: number;
  message: string;
}
*/

export function getOnMessageFunc() {
  return function onMessage(event, ctx) {
    const msg = JSON.parse(event?.data);
    switch (msg?.type) {
      case 'initialize':
        if (!msg?.stateId) {
          const m = 'Initial message from server did not include the stateId!';
          console.error(m);
          toast('Invalid Server Message', m, 'danger');
          return;
        }
        ctx.stateId = msg.stateId;

        if (msg.biddingTimeLimit != undefined) {
          ctx.biddingTimeLimit = msg.biddingTimeLimit;
        }

        if (msg.playerSelectionTimeLimit != undefined) {
          ctx.playerSelectionTimeLimit = msg.playerSelectionTimeLimit;
        }

        return;
      case 'error':
        if (msg.message) {
          console.error(msg.message);
          toast('Error', msg.message, 'danger');
          return;
        }
        const m = 'Received error message from the server with no other details...';
        toast('Error', m, 'danger');
        console.error(m);
        return;
      case 'update':
        handleServerUpdate(msg, ctx);
    }
  };
}

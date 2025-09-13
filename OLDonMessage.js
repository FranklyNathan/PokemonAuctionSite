import { fireConfetti } from './confetti.js';
import {
  addDraftLog,
  updateRemainingFunds,
  updateCurrentBid,
  updateHighestBidder,
  updateCurrentlySelectingTeam,
  removeSelectingIndicator,
  hideSelectedPlayerCard,
  updateSelectedPlayerCard,
  jiggleCurrentBid,
  clearHighestBidder,
  resetTimerTime,
  toast,
  addPlayerIconToTeamCard,
  enableRaiseButtons,
  disableRaiseButtons,
  isValidNumber,
  updateTeamCard,
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
  console.log(`[Debug] recordDraft called. highestBidder: ${ctx.highestBidder}, selectedPlayerId: ${ctx.selectedPlayerId}, currentBid: ${ctx.currentBid}`);
  if (!ctx.playersTableData || ctx.playersTableData.length === 0) {
    console.error('recordDraft called before playersTableData was loaded. Aborting.');
    return;
  }
  if (ctx.selectedPlayerId == null || !ctx.playersTableData?.[ctx.selectedPlayerId]) {
    console.error(`recordDraft called with invalid selectedPlayerId: ${ctx.selectedPlayerId} or empty player data.`);
    return;
  }
  const selectedPlayer = ctx.playersTableData[ctx.selectedPlayerId];
  selectedPlayer.pickedBy = ctx.teams[ctx.highestBidder].teamName;
  selectedPlayer.cost = ctx.currentBid;

  addDraftLog(ctx.teams[ctx.highestBidder].teamName, ctx.currentBid, selectedPlayer.name);
  console.log(`[Debug] Attempting to add mini-sprite for player '${selectedPlayer.name}' to winner card for client ID: ${ctx.highestBidder}`);
  // Add the mini sprite to the winning team's card
  addPlayerIconToTeamCard(ctx.highestBidder, selectedPlayer.name);

  // update the table row
  const row = ctx.playersTable.getRowNode(
    ctx.playersTableData[ctx.selectedPlayerId].type + ctx.playersTableData[ctx.selectedPlayerId].name,
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
  return team.remainingFunds <= 0;
}

function updateTimer(ctx, currentTimeLimit) {
  console.log(`[Client Timer] Updating timer. Starting with duration: ${currentTimeLimit}ms`);
  ctx.timer.stop();
  ctx.currentTimeLimit = currentTimeLimit;
  ctx.timer.start(currentTimeLimit);
}

function resumeTimer(ctx, targetTimestamp) {
  const remainingTime = targetTimestamp - Date.now();
  console.log(`[Client Timer] Resuming timer. Remaining duration: ${remainingTime}ms`);
  ctx.timer.stop();
  // Note: We don't update ctx.currentTimeLimit here, as it's needed for the progress bar to show the correct percentage.
  ctx.timer.start(remainingTime);
}

function handleServerUpdate(msg, ctx) {
  if (!msg.hasOwnProperty('stateId')) {
    toast('Invalid message!', 'A message from the server is missing the `stateId` field', 'danger');
    return;
  }

  console.log('[Debug] handleServerUpdate received message:', msg);

  // Check if a draft just completed BEFORE updating any other part of the context.
  // This is crucial because we need the `ctx` from the end of the bidding phase
  // to correctly record who won.
  if (ctx.stateId === 'bidding' && msg.stateId === 'player_selection') {
    console.log('[Debug] Auction ended. Calling recordDraft with old context.');
    // The highest bidder from the just-ended bidding phase won the player.
    recordDraft(ctx);
  }

  // Always update bid and bidder info first, as this is critical feedback.
  if (typeof msg.currentBid == 'number' && msg.currentBid != ctx.currentBid) {
    console.log(`[Debug] Updating currentBid from ${ctx.currentBid} to ${msg.currentBid}`);
    ctx.currentBid = msg.currentBid;
    updateCurrentBid(ctx);
    jiggleCurrentBid();
  }
  if (typeof msg.highestBidder == 'number' && msg.highestBidder != ctx.highestBidder) {
    console.log(`[Debug] Updating highestBidder from ${ctx.highestBidder} to ${msg.highestBidder}`);
    ctx.highestBidder = msg.highestBidder;
    updateHighestBidder(ctx);
  }

  // Handle pause state
  if (typeof msg.isPaused === 'boolean' && msg.isPaused !== ctx.isPaused) {
    ctx.isPaused = msg.isPaused;
    const pauseButton = document.getElementById('pause-button');
    const timeEl = document.getElementById('time');
    if (ctx.isPaused) {
      console.log('[Debug] Pausing client timer.');
      ctx.timer.stop();
      pauseButton.innerHTML = 'Resume';
      disableRaiseButtons();
      timeEl.classList.add('paused');
    } else {
      console.log('[Debug] Resuming client timer.');
      pauseButton.innerHTML = 'Pause';
      timeEl.classList.remove('paused');
      enableRaiseButtons(); // Re-enable buttons on resume.
      // When un-pausing, restart the timer with the remaining time from the server.
      if (isValidNumber(msg.remainingTimeOnResume)) {
        console.log(`[Client Timer] Resuming with duration from server: ${msg.remainingTimeOnResume}ms`);
        // Explicitly stop any lingering timer before starting a new one to ensure a clean resume.
        ctx.timer.stop();
        ctx.timer.start(msg.remainingTimeOnResume, ctx.currentTimeLimit);
      } else if (isValidNumber(msg.currentAlarmTime) && isValidNumber(msg.currentTimeLimit)) {
        // Fallback for regular updates that might coincide with resume
        updateTimer(ctx, +msg.currentTimeLimit);
      }
    }
  } else if (isValidNumber(msg.currentAlarmTime) && isValidNumber(msg.currentTimeLimit)) {
    // Only run the generic timer update if we are not handling a pause state change.
    updateTimer(ctx, +msg.currentTimeLimit);
  }

  // update the UI if there was a state change or we haven't performed the initial UI update
  if (
    msg.stateId != ctx.stateId ||
    !ctx.performedInitialUpdate ||
    // if we are in player selection and the player changes (due to timeout), re-run state change logic
    (ctx.stateId == 'player_selection' && msg.selectedPlayerId != ctx.selectedPlayerId)
  ) {
    // if a player rejoins in the middle of the bidding phase, the `msg.stateId != ctx.stateId`
    console.log(`[Client onMessage] State change detected. Old: ${ctx.stateId}, New: ${msg.stateId}. Entering state-change UI block.`);
    console.log(`[Client onMessage] State change detected. Old: ${ctx.stateId}, New: ${msg.stateId}`);
    //   check won't match, but we still need to initialize their UI as if it was a state change
    //   so we have to keep track of whether we have done the initial update.
    if (!ctx.performedInitialUpdate) {
      ctx.performedInitialUpdate = true;
    }
    // handle state change
    // reset the player card to empty
    hideSelectedPlayerCard(ctx.teams?.[msg.currentlySelectingTeam]?.teamName);
    switch (msg.stateId) {
      case 'bidding':
        console.log('[Client onMessage] In bidding state. Checking if buttons should be enabled.');
        if (!isTeamDoneDrafting(ctx, ctx.teams[ctx.myClientId])) {
          // only enable the raise buttons if this team is still drafting
          enableRaiseButtons();
        }
        // remove the 'selecting' indicator from the team that just selected
        removeSelectingIndicator(ctx);
        // set the player card to the selected player
        if (msg.selectedPlayerId != undefined) {
          const playerData = ctx.playersTableData?.[msg.selectedPlayerId];
          if (playerData) {
            updateSelectedPlayerCard(playerData, ctx.extraPlayerStatsFields);
            displayPlayerAuctionInfo(playerData, ctx.speciesInfoMap);
          } else {
            console.error(`Could not find player data for selectedPlayerId: ${msg.selectedPlayerId}`);
          }
        }
        break;
      case 'player_selection':
        // if previous state was bidding, the highest bidder got the player!
        // if there was a selecting team, remove the indicator
        if (ctx.currentlySelectingTeam != undefined) {
          removeSelectingIndicator(ctx);
        }
        ctx.currentlySelectingTeam = undefined;

        // The first bid can be made by any team.
        console.log('[Client onMessage] In player_selection state. Checking if buttons should be enabled.');
        if (!isTeamDoneDrafting(ctx, ctx.teams[ctx.myClientId])) {
          enableRaiseButtons();
        } else {
          disableRaiseButtons();
        }
        // set the player card to the selected player
        if (msg.selectedPlayerId != undefined) {
          const playerData = ctx.playersTableData?.[msg.selectedPlayerId];
          if (playerData) {
            updateSelectedPlayerCard(playerData, ctx.extraPlayerStatsFields);
            displayPlayerAuctionInfo(playerData, ctx.speciesInfoMap);
          } else {
            console.error(`Could not find player data for selectedPlayerId: ${msg.selectedPlayerId}`);
          }
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
  } else {
    console.log(`[Client onMessage] No state change. Old: ${ctx.stateId}, New: ${msg.stateId}.`);
  }

  // This logic runs on EVERY update to ensure button state is correct, even without a state change.
  if (ctx.stateId === 'bidding') {
    console.log(`[Client onMessage] In bidding state. My ID: ${ctx.myClientId}, Highest Bidder: ${msg.highestBidder}`);
    if (ctx.myClientId !== msg.highestBidder && !isTeamDoneDrafting(ctx, ctx.teams[ctx.myClientId])) {
      console.log('[Client onMessage] Enabling raise buttons because I am not the highest bidder.');
      enableRaiseButtons();
    } else {
      console.log('[Client onMessage] Disabling raise buttons because I am the highest bidder or done drafting.');
      disableRaiseButtons();
    }
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
        (typeof peer.ready == 'boolean' && ctx.teams[peer.clientId].ready != peer.ready) ||
        isTeamDoneDrafting(ctx, peer) // Also update if they just became "done"
      ) {
        ctx.teams[peer.clientId].connected = peer.connected;
        ctx.teams[peer.clientId].ready = peer.ready;
        updateTeamCard(ctx.teams[peer.clientId], isTeamDoneDrafting(ctx, peer));
      }
    }
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

export function onMessage(event, ctx) {
  console.log('[Client onMessage] Raw message received from server:', event.data);
  const msg = JSON.parse(event?.data);
  switch (msg?.type) {
    case 'update':
      handleServerUpdate(msg, ctx);
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
  }
}

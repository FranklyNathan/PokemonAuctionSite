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
  showFlashbangOverlay,
  hideFlashbangOverlay,
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
  const selectedPlayer = ctx.playerMap.get(ctx.selectedPlayerId);
  if (!selectedPlayer) {
    console.error(`recordDraft called with invalid selectedPlayerId: ${ctx.selectedPlayerId} or empty player data.`);
    return;
  }
  selectedPlayer.pickedBy = ctx.teams[ctx.highestBidder].teamName;
  selectedPlayer.cost = ctx.currentBid;

  addDraftLog(ctx.teams[ctx.highestBidder].teamName, ctx.currentBid, selectedPlayer.name);
  console.log(`[Debug] Attempting to add mini-sprite for player '${selectedPlayer.name}' to winner card for client ID: ${ctx.highestBidder}`);
  // Add the mini sprite to the winning team's card
  addPlayerIconToTeamCard(ctx.highestBidder, selectedPlayer.name);

  // update the table row
  const row = ctx.playersTable.getRowNode(selectedPlayer.type + selectedPlayer.name);
  row.setData(selectedPlayer);
  ctx.playersTable.refreshClientSideRowModel(); // refresh the filtering so if a user is filtered on draft status it shows new draft

  // clear the highest bidder and highest bid
  clearHighestBidder();
  // Also reset the context's bid state to ensure the next bid update is processed correctly.
  ctx.currentBid = 0;
  ctx.highestBidder = undefined;
  console.log('[Debug] Cleared local bid context after recording draft.');

  // celebrate if this is the highest bidder and they just drafted a player
  if (ctx.highestBidder == ctx.myClientId) {
    fireConfetti();
  }
}

function isTeamDoneDrafting(ctx, team) {
  return team.remainingFunds <= 0;
}

function updateTimer(ctx, currentTimeLimit) {
  console.log(`[Debug] updateTimer called with currentTimeLimit: ${currentTimeLimit}.`);
}

function startOrResumeTimer(ctx, targetTimestamp, totalDuration) {
  console.log(`[Debug] startOrResumeTimer called. targetTimestamp: ${targetTimestamp}, totalDuration: ${totalDuration}`);
  let remainingTime = targetTimestamp - Date.now();

  // Prevent the timer from starting with more time than the total limit due to clock drift.
  if (remainingTime > totalDuration) {
    console.warn(`[Client Timer] Calculated remaining time (${remainingTime}ms) is greater than total duration (${totalDuration}ms). Capping at total duration.`);
    remainingTime = totalDuration;
  }
  console.log(`[Client Timer] Starting/Resuming timer. Remaining duration calculated as: ${remainingTime}ms`);

  // Stop any existing timer before starting a new one.
  ctx.timer.stop();

  // The total duration is needed for the progress bar calculation.
  ctx.currentTimeLimit = totalDuration;

  // Start the timer with the calculated remaining time and the total duration for the progress bar.
  ctx.timer.start(remainingTime, totalDuration);
}

function handleServerUpdate(msg, ctx) {
  let handledPauseChange = false; // Flag to prevent double-updating the timer on resume.
  if (!msg.hasOwnProperty('stateId')) {
    toast('Invalid message!', 'A message from the server is missing the `stateId` field', 'danger');
    return;
  }

  console.log(`[Debug] handleServerUpdate received message. Current client isPaused state: ${ctx.isPaused}. Message:`, msg);

  // Check if a draft just completed BEFORE updating any other part of the context.
  // This is crucial because we need the `ctx` from the end of the bidding phase
  // to correctly record who won.
  if (
    ctx.stateId === 'bidding' &&
    msg.stateId === 'bidding' &&
    msg.selectedPlayerId !== ctx.selectedPlayerId &&
    ctx.selectedPlayerId !== null &&
    ctx.highestBidder !== undefined
  ) {
    console.log('[Debug] New auction round started. Recording draft for previous round.');
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
    // After the highest bidder changes, we must re-render all team cards to apply/remove the highlight.
    console.log('[Debug] Highest bidder changed. Re-rendering all team cards to update highlights.');
    for (const team of Object.values(ctx.teams)) {
      updateTeamCard(ctx.teams[team.clientId], isTeamDoneDrafting(ctx, team), ctx.myClientId, ctx.flashbangedClientId, ctx.ws, ctx.stateId, ctx.highestBidder);
    }
  }
  if (msg.hasOwnProperty('flashbangedClientId')) {
    ctx.flashbangedClientId = msg.flashbangedClientId;
    if (ctx.flashbangedClientId === ctx.myClientId) {
      console.log('[Client] I have been flashbanged!');
      showFlashbangOverlay();
      disableRaiseButtons();
    } else {
      // If I am not flashbanged (or it just cleared), hide the overlay.
      hideFlashbangOverlay();
    }
  }

  // Handle pause state
  if (typeof msg.isPaused === 'boolean' && msg.isPaused !== ctx.isPaused) {
    console.log(`[Debug] Pause state change detected. Message isPaused: ${msg.isPaused}, Client isPaused: ${ctx.isPaused}`);
    handledPauseChange = true;
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
      // Also update the time limit from the message, so we don't trigger the generic update below.
      if (isValidNumber(msg.currentTimeLimit)) {
        ctx.currentTimeLimit = +msg.currentTimeLimit;
      }

      // When un-pausing, restart the timer with the remaining time from the server.
      if (isValidNumber(msg.remainingTimeOnResume)) {
        console.log(`[Client Timer] Resume message received. The generic timer update will handle syncing the clock.`);
      } else {
        // This case should ideally not be hit if the server is behaving correctly.
        // If it is, it means we resumed but didn't get the remaining time.
        // We will have to wait for the next generic timer update.
        console.warn('[Client Timer] Resume message received without remainingTimeOnResume. Timer may be out of sync.');
      }
    }
  } else if (isValidNumber(msg.currentAlarmTime) && isValidNumber(msg.currentTimeLimit)) {
    // This is the generic timer update. It runs on every applicable server message.
    // It ensures the client timer is always synced with the server's alarm time.
    console.log('[Debug] Generic timer update condition met. Calling startOrResumeTimer.');
    startOrResumeTimer(ctx, +msg.currentAlarmTime, +msg.currentTimeLimit);
  }

  // update the UI if there was a state change or we haven't performed the initial UI update
  if (
    msg.stateId != ctx.stateId ||
    !ctx.performedInitialUpdate ||
    // If the player being auctioned changes (e.g., a new round starts), we must re-run the state change logic to update the UI.
    (msg.selectedPlayerId !== undefined && msg.selectedPlayerId !== ctx.selectedPlayerId)
  ) {
    // if a player rejoins in the middle of the bidding phase, the `msg.stateId != ctx.stateId`
    console.log(`[Client onMessage] State change detected. Old: ${ctx.stateId}, New: ${msg.stateId}. Entering state-change UI block.`);
    //   check won't match, but we still need to initialize their UI as if it was a state change
    //   so we have to keep track of whether we have done the initial update.
    if (!ctx.performedInitialUpdate) {
      ctx.performedInitialUpdate = true;
    }
    // handle state change
    // reset the player card to empty
    hideSelectedPlayerCard();
    switch (msg.stateId) {
      case 'bidding':
        console.log('[Client onMessage] In bidding state. Checking if buttons should be enabled.');
        // set the player card to the selected player
        if (msg.selectedPlayerId != undefined) {
          const playerData = ctx.playerMap.get(msg.selectedPlayerId);
          if (playerData) {
            updateSelectedPlayerCard(playerData, ctx.speciesInfoMap, ctx.allPlayersUnsorted);
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
    if (
      ctx.myClientId !== msg.highestBidder &&
      !isTeamDoneDrafting(ctx, ctx.teams[ctx.myClientId]) &&
      ctx.flashbangedClientId !== ctx.myClientId // Cannot bid if flashbanged
    ) {
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

      // Update the team's connected/ready state from the message.
      ctx.teams[peer.clientId].connected = peer.connected;
      ctx.teams[peer.clientId].ready = peer.ready;
      // Re-render the team card to reflect any changes (connection status, flashbang, state change for dropdowns, etc.).
      // This is called for every peer on every update to ensure UI consistency.
      updateTeamCard(ctx.teams[peer.clientId], isTeamDoneDrafting(ctx, peer), ctx.myClientId, ctx.flashbangedClientId, ctx.ws, ctx.stateId, ctx.highestBidder);
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

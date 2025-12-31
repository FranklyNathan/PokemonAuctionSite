import { fireConfetti } from './confetti.js';
import {
  addDraftLog,
  updateRemainingFunds,
  updateCurrentBid,
  updateHighestBidder,
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
  updateDraftCounter,
  calculateAveragePrice,
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

  // Add the drafted player to the team's roster in the client-side context.
  if (!ctx.teams[ctx.highestBidder].roster) {
    ctx.teams[ctx.highestBidder].roster = [];
  }
  ctx.teams[ctx.highestBidder].roster.push(selectedPlayer);

  addDraftLog(ctx.teams[ctx.highestBidder].teamName, ctx.currentBid, selectedPlayer.name);
  console.log(`[Debug] Attempting to add mini-sprite for player '${selectedPlayer.name}' to winner card for client ID: ${ctx.highestBidder}`);
  // Add the mini sprite to the winning team's card
  addPlayerIconToTeamCard(ctx.highestBidder, selectedPlayer.name);

  // Increment the draft count and update the UI
  ctx.draftedPokemonCount++;
  const avg = calculateAveragePrice(ctx.playersTableData);
  updateDraftCounter(ctx.draftedPokemonCount, ctx.totalPokemonAuctioned, avg);

  // update the table row
  const row = ctx.playersTable.getRowNode(selectedPlayer.playerId);
  row.setData(selectedPlayer);
  ctx.playersTable.refreshClientSideRowModel(); // refresh the filtering so if a user is filtered on draft status it shows new draft

  // celebrate if this is the highest bidder and they just drafted a player
  if (ctx.highestBidder == ctx.myClientId) {
    fireConfetti();
  }

  // clear the highest bidder and highest bid
  clearHighestBidder();
  // Also reset the context's bid state to ensure the next bid update is processed correctly.
  ctx.currentBid = 0;
  ctx.highestBidder = undefined;
  console.log('[Debug] Cleared local bid context after recording draft.');
}

function isTeamDoneDrafting(ctx, team) {
  return team.remainingFunds <= 0;
}

function updateTimer(ctx, currentTimeLimit) {
  console.log(`[Debug] updateTimer called with currentTimeLimit: ${currentTimeLimit}.`);
}

function startOrResumeTimer(ctx, targetTimestamp, totalDuration, isNewBid = false) {
  console.log(`[Debug] startOrResumeTimer called. targetTimestamp: ${targetTimestamp}, totalDuration: ${totalDuration}, isNewBid: ${isNewBid}`);
  let remainingTime;

  if (isNewBid) {
    // If it's a new bid, always start the timer with the full duration.
    remainingTime = totalDuration;
  } else {
    // Otherwise, calculate remaining time for syncing clients joining mid-timer.
    remainingTime = targetTimestamp - Date.now();
  }

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
  let isNewBid = false;
  let handledPauseChange = false; // Flag to prevent double-updating the timer on resume.
  if (!msg.hasOwnProperty('stateId')) {
    toast('Invalid message!', 'A message from the server is missing the `stateId` field', 'danger');
    return;
  }

  console.log(`[Debug] handleServerUpdate received message. Current client isPaused state: ${ctx.isPaused}. Message:`, msg);

  // Check if a draft just completed BEFORE updating any other part of the context.
  // This is crucial because we need the `ctx` from the end of the bidding phase
  // to correctly record who won.
  const draftJustCompleted = ctx.stateId === 'bidding' && ctx.highestBidder !== undefined;

  // Determine if a new player is being auctioned BEFORE updating the context.
  const isNewPlayer = msg.selectedPlayerId !== undefined && msg.selectedPlayerId !== ctx.selectedPlayerId;

  // A "fresh start" for the timer should only happen for a new bid or a new player round,
  // but NOT when a client is just joining/refreshing. We use `performedInitialUpdate` to differentiate.
  // This must be calculated BEFORE `performedInitialUpdate` is changed.
  const isNewPlayerForTimerReset = isNewPlayer && ctx.performedInitialUpdate;


  // Case 1: A new auction round is starting (bidding -> bidding).
  if (
    draftJustCompleted &&
    msg.stateId === 'bidding' &&
    (msg.selectedPlayerId !== undefined && msg.selectedPlayerId !== ctx.selectedPlayerId)
  ) {
    recordDraft(ctx);
  } else if (draftJustCompleted && msg.stateId !== 'bidding') {
    // Case 2: The auction is ending (bidding -> auction_over/post_auction).
    // The highest bidder from the just-ended bidding phase won the player.
    recordDraft(ctx);
  }
  
  if (isNewPlayer) {
    console.log('[Debug] New player detected. Storing newPlayerTime.');
    ctx.newPlayerTime = Date.now();
  }

  // Always update bid and bidder info first, as this is critical feedback.
  if (typeof msg.currentBid == 'number' && msg.currentBid != ctx.currentBid) {
    ctx.previousBid = ctx.currentBid; // store the old bid
    ctx.lastBidUpdateTime = Date.now(); // store the update time
    ctx.currentBid = msg.currentBid;
    updateCurrentBid(ctx);
    jiggleCurrentBid();
  }
  if (isValidNumber(msg.highestBidder) && msg.highestBidder != ctx.highestBidder) {
    // Only consider it a "new bid" for timer reset purposes if this is not the initial update.
    if (ctx.performedInitialUpdate) {
      isNewBid = true;
    }
    console.log(`[Debug] Updating highestBidder from ${ctx.highestBidder} to ${msg.highestBidder}`);
    ctx.highestBidder = msg.highestBidder;
    updateHighestBidder(ctx);
    // After the highest bidder changes, we must re-render all team cards to apply/remove the highlight.
    for (const team of Object.values(ctx.teams)) {
      updateTeamCard(ctx.teams[team.clientId], isTeamDoneDrafting(ctx, team), ctx.myClientId, ctx.flashbangedClientId, ctx.ws, ctx.stateId, ctx.highestBidder, ctx.flashbangsEnabled);
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
  // Always trust the server's value for totalPokemonAuctioned.
  // The previous check (msg.totalPokemonAuctioned !== ctx.totalPokemonAuctioned) could fail
  // if the server sent 0 initially and the client's default is also 0, preventing the
  // correct value from ever being set.
  if (msg.hasOwnProperty('totalPokemonAuctioned') && typeof msg.totalPokemonAuctioned === 'number') {
      if (msg.hasOwnProperty('flashbangsEnabled')) {
        ctx.flashbangsEnabled = msg.flashbangsEnabled;
      }
    ctx.totalPokemonAuctioned = msg.totalPokemonAuctioned;
    // Initialize the counter display
    const avg = calculateAveragePrice(ctx.playersTableData);
    updateDraftCounter(ctx.draftedPokemonCount, ctx.totalPokemonAuctioned, avg);
  }

  // Handle pause state
  if (typeof msg.isPaused === 'boolean' && (msg.isPaused !== ctx.isPaused || !ctx.performedInitialUpdate)) {
    console.log(`[Debug] Pause state change detected. Message isPaused: ${msg.isPaused}, Client isPaused: ${ctx.isPaused}`);
    handledPauseChange = true;
    ctx.isPaused = msg.isPaused;
    const pauseButton = document.getElementById('pause-button');
    ctx.isPaused = msg.isPaused;    
    const timeEl = document.getElementById('time');
    if (ctx.isPaused) {
      console.log('[Debug] Pausing client timer.');
      ctx.timer.stop();
      pauseButton.innerHTML = '<sl-icon name="play-fill" label="Resume" style="font-size: 1.4rem; position: relative; top: 5px;"></sl-icon>';
      disableRaiseButtons();
      timeEl.classList.add('paused');
    } else {
      console.log('[Debug] Resuming client timer.');
      pauseButton.innerHTML = '<sl-icon name="pause-fill" label="Pause" style="font-size: 1.4rem; position: relative; top: 5px;"></sl-icon>';
      timeEl.classList.remove('paused');
      enableRaiseButtons(); // Re-enable buttons on resume.

      // This block handles resuming from a pause. We only need to check for remainingTimeOnResume
      // if this is an actual state change, not the initial page load.
      if (ctx.performedInitialUpdate) {
        // Also update the time limit from the message, so we don't trigger the generic update below.
        if (isValidNumber(msg.currentTimeLimit)) {
          ctx.currentTimeLimit = +msg.currentTimeLimit;
        }
        // When un-pausing, restart the timer with the remaining time from the server.
        if (isValidNumber(msg.remainingTimeOnResume)) {
          console.log(`[Client Timer] Resume message received. The generic timer update will handle syncing the clock.`);
        } else {
          console.warn('[Client Timer] Resume message received without remainingTimeOnResume. Timer may be out of sync.');
        }
      }
    }
  }

  // update the UI if there was a state change or we haven't performed the initial UI update
  if (
    msg.stateId != ctx.stateId ||
    !ctx.performedInitialUpdate ||
    // If the player being auctioned changes (e.g., a new round starts), we must re-run the state change logic to update the UI.
    isNewPlayer
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
      case 'auction_over':
        console.log('[Client onMessage] Auction is over. Disabling controls.');
        document.getElementById('waiting-msg').innerHTML = 'The auction has ended!';
        
        // Add "View Your Team" button (not for spectators)
        if (ctx.myClientId !== -1) {
          const myTeam = ctx.teams[ctx.myClientId];
          if (myTeam && myTeam.roster && myTeam.roster.length > 0) {
            const pokemonNames = myTeam.roster
              .map(p => p.name)
              .sort((a, b) => a.localeCompare(b))
              .map(name => encodeURIComponent(name))
              .join(',');
            const teamPlannerUrl = `/teamplanner?pokemon=${pokemonNames}`;
            const buttonHtml = `<br><br><sl-button variant="primary" size="large" onclick="window.location.href='${teamPlannerUrl}'">View Your Team!</sl-button>`;
            document.getElementById('waiting-msg').innerHTML += buttonHtml;
          }
        }
        
        disableRaiseButtons();
        resetTimerTime();
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

  // This timer update logic is placed *after* the state change block to ensure
  // that ctx.currentTimeLimit has been updated from the message before the timer starts.
  if (isValidNumber(msg.currentAlarmTime) && isValidNumber(msg.currentTimeLimit)) {
    console.log('[Debug] Generic timer update condition met. Calling startOrResumeTimer.');
    startOrResumeTimer(ctx, +msg.currentAlarmTime, +msg.currentTimeLimit, isNewBid || isNewPlayerForTimerReset);
  }

  // This logic runs on EVERY update to ensure button state is correct, even without a state change.
  if (ctx.stateId === 'bidding') {
    console.log(`[Client onMessage] In bidding state. My ID: ${ctx.myClientId}, Highest Bidder: ${msg.highestBidder}`);
    // Spectators (myClientId === -1) should not be able to bid
    if (
      ctx.myClientId !== -1 &&
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
      updateTeamCard(ctx.teams[peer.clientId], isTeamDoneDrafting(ctx, peer), ctx.myClientId, ctx.flashbangedClientId, ctx.ws, ctx.stateId, ctx.highestBidder, ctx.flashbangsEnabled);
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
    case 'kick_event':
      const dialog = document.getElementById('disconnectedDialog');
      if (dialog) {
        const contentDiv = dialog.querySelector('div');
        if (contentDiv && contentDiv.firstChild) {
          contentDiv.firstChild.textContent = `You have been kicked by ${msg.kicker}. `;
        }
      }
      return;
    case 'chat_message':
      // Handle incoming chat messages
      if (window.addChatMessage && msg.teamName && msg.message && msg.timestamp) {
        window.addChatMessage(msg.teamName, msg.message, msg.timestamp);
      }
      return;
  }
}

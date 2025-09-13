import { Ctx, State, ServerMessage, ServerMessageType } from './mod.config';
import { getUndraftedCount, getRosterCounts, setDraft, getRandomUndraftedPlayer } from './mod.storage';

export function isValidNumber(s: string): boolean {
  return !isNaN(+s) && !isNaN(parseFloat(s));
}

export function getSerializableCtx(ctx: Ctx) {
  // removes `setAlarm`, `deleteAlarm`, `storeCtx`, `sql`, and all the websockets from the clients
  return {
    auctionId: ctx.auctionId,
    // remove the unserializable websocket from each client
    clientMap: Object.fromEntries(
      Object.entries(ctx.clientMap).map(([key, client]) => {
        const { ws: _, ...newClient } = client;
        return [key, newClient];
      }),
    ),
    draftOrder: ctx.draftOrder,
    draftPosition: ctx.draftPosition,
    serverState: ctx.serverState,
    currentlySelectingTeam: ctx.currentlySelectingTeam,
    selectedPlayerId: ctx.selectedPlayerId,
    highestBidder: ctx.highestBidder,
    currentBid: ctx.currentBid,
    isPaused: ctx.isPaused,
    remainingTimeOnPause: ctx.remainingTimeOnPause,
    clientIdIncrementer: ctx.clientIdIncrementer,
    biddingTimeLimit: ctx.biddingTimeLimit,
    playerSelectionTimeLimit: ctx.playerSelectionTimeLimit,
    totalPokemonAuctioned: ctx.totalPokemonAuctioned,
    currentTimeLimit: ctx.currentTimeLimit,
  };
}

export function unserializeCtx(ctx: Ctx, state: DurableObjectState, sql: SqlStorage) {
  // add the unserializable parts back to the context object:
  // set and delete alarm
  ctx._setAlarm = state.storage.setAlarm.bind(state.storage);
  ctx.storage = state.storage;
  ctx.setAlarm = (durationMs: number) => {
    ctx.currentTimeLimit = durationMs;
    ctx._setAlarm(Date.now() + durationMs);
  };
  ctx.deleteAlarm = state.storage.deleteAlarm.bind(state.storage);
  ctx.getAlarm = state.storage.getAlarm.bind(state.storage);
  ctx.sql = sql;
  // function to store the context to the durable object storage
  ctx.storeCtx = async () => await state.storage.put('ctx', getSerializableCtx(ctx));
  // websockets back to clients
  for (const [clientId, client] of Object.entries(ctx.clientMap)) {
    client.ws = state.getWebSockets(clientId).at(0);
  }
  return ctx;
}

function startNewAuctionRound(ctx: Ctx) {
  console.log('[Server] Starting new auction round...');
  ctx.serverState = State.Bidding;
  ctx.currentBid = 0;
  ctx.selectedPlayerId = undefined;
  ctx.highestBidder = undefined;
  ctx.currentlySelectingTeam = undefined;
  ctx.flashbangedClientId = null;

  console.log('[Server] Getting random undrafted player...');
  // Instead of the client selecting a player, the server does it randomly.
  const randomPlayer = getRandomUndraftedPlayer(ctx);
  if (randomPlayer) {
    console.log(`[Server] Selected player ID: ${randomPlayer.player_id}. Setting alarm.`);
    ctx.selectedPlayerId = randomPlayer.player_id;

    // Since the bid is $0 at the start of a round, we apply the double-time rule.
    let newTimeLimit = ctx.biddingTimeLimit;
    if (ctx.currentBid < 10) {
      newTimeLimit = ctx.biddingTimeLimit * 2;
      console.log(`[Server] New round starting with bid at $0. Doubling timer to ${newTimeLimit}ms.`);
    }
    ctx.setAlarm(newTimeLimit);
  } else {
    // If no player is found (e.g., all base pokemon are drafted), end the draft.
    console.log('[Server] No more undrafted base-form Pokémon. Ending draft.');
    goToPostAuction(ctx);
  }
}

export async function updateClients(
  ctx: Ctx,
  sendPeers = false,
  sendTimerUpdate?: boolean,
  message?: string,
  remainingTimeOnResume?: number,
) {
  console.log(`[Server] Broadcasting 'updateClients'. state: ${ctx.serverState}, bid: ${ctx.currentBid}, bidder: ${ctx.highestBidder}`);
  let msg: ServerMessage = {
    type: ServerMessageType.Update,
    stateId: ctx.serverState,
    currentBid: ctx.currentBid,
    highestBidder: ctx.highestBidder,
    currentlySelectingTeam: ctx.currentlySelectingTeam,
    isPaused: ctx.isPaused,
    flashbangedClientId: ctx.flashbangedClientId,
    totalPokemonAuctioned: ctx.totalPokemonAuctioned,
    selectedPlayerId: ctx.selectedPlayerId,
    message: message,
  };

  if (sendTimerUpdate) {
    msg.currentAlarmTime = await ctx.getAlarm();
    msg.currentTimeLimit = ctx.currentTimeLimit;
  }

  if (remainingTimeOnResume) {
    msg.remainingTimeOnResume = remainingTimeOnResume;
  }

  if (sendPeers) {
    msg.peers = Object.values(ctx.clientMap).map((client) => {
      return {
        clientId: client.clientId,
        remainingFunds: client.remainingFunds,
        connected: client.connected,
        ready: client.ready,
      };
    });
  }

  const msgStr = JSON.stringify(msg);

  Object.values(ctx.clientMap)
    .filter((client) => client.connected && client.ws?.readyState == WebSocket.OPEN) // get the currently connected clients
    .forEach((client) => client.ws?.send(msgStr));
}

function recordDraft(ctx: Ctx) {
  if (ctx.highestBidder == undefined || ctx.selectedPlayerId == undefined || ctx.currentBid == undefined) {
    return;
  }
  setDraft(ctx);
  ctx.clientMap[ctx.highestBidder].remainingFunds -= ctx.currentBid;
}

function isDraftComplete(ctx: Ctx) {
  const rosterSizes = getRosterCounts(ctx);
  const availablePlayersCount = getUndraftedCount(ctx) || 0;
  const totalDrafted = Object.values(rosterSizes).reduce((sum, count) => sum + count, 0);

  // The auction should only end based on this count if a valid, positive number was provided.
  const limitReached = typeof ctx.totalPokemonAuctioned === 'number' && ctx.totalPokemonAuctioned > 0 && totalDrafted >= ctx.totalPokemonAuctioned;

  return (
    // all teams have no remaining funds or full roster or disconnected
    Object.values(ctx.clientMap).every((client) => client.remainingFunds <= 0 || !client.connected) ||
    // or there aren't any more available players
    availablePlayersCount == 0 ||
    // or the total number of auctioned pokemon has been reached
    limitReached
  );
}

async function goToPostAuction(ctx: Ctx) {
  // going to post auction causes clients to close websockets, and once all sockets close
  //   the closeOrErrorHandler() function serializes the state to the durable object,
  //   so no need to handle that here.
  ctx.deleteAlarm();
  ctx.serverState = State.PostAuction;
}

///////////////
// Server state transition
///////////////

export async function transitionState(ctx: Ctx) {
  console.log(`[transitionState] Transitioning from state: ${ctx.serverState}`);
  ctx.deleteAlarm(); // remove current timer that will call transitionState again
  // if all players are disconnected, exit with resetting the alarm.
  if (Object.values(ctx.clientMap).every((c) => !c.connected)) {
    console.log('Stopping alarm because all players disconnected!');
    return;
  }
  switch (ctx.serverState) {
    case State.PreAuction:
      // second argument false: don't increment selecting team because we start at
      //   team 0 and team 0 has not picked yet.
      startNewAuctionRound(ctx);
      break;
    case State.Bidding:
      if (ctx.highestBidder == undefined || ctx.selectedPlayerId == undefined || ctx.currentBid == undefined) {
        console.error(
          `[ERROR][transitionState()]: highestBidder (${ctx.highestBidder}) or selectedPlayerId
 (${ctx.selectedPlayerId}) or currentBid (${ctx.currentBid}) are undefined while trying to
 transition from Bidding to Player Selection!`,
        );
        break;
      }

      // lock in the current player to the highest bidder
      recordDraft(ctx);

      // check if we should go to results
      if (isDraftComplete(ctx)) {
        await goToPostAuction(ctx);
        break;
      }

      startNewAuctionRound(ctx);
      break;
    case State.PlayerSelection:
      // This state is no longer used for starting new rounds. If the alarm fires in this
      // state, it means a bid was made and the timer ran out, so the bidding is over.
      // We transition to the next round, which is handled by the Bidding case.
      console.log('[transitionState] Alarm fired in PlayerSelection state. This should not happen in the new flow. Transitioning to new round.');
      startNewAuctionRound(ctx);
      break;
  }
}

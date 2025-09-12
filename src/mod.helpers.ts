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

function setupPlayerSelection(ctx: Ctx) {
  ctx.serverState = State.PlayerSelection;
  ctx.currentBid = 0;
  ctx.selectedPlayerId = undefined;
  ctx.highestBidder = undefined;
  ctx.currentlySelectingTeam = undefined;

  // Instead of the client selecting a player, the server does it randomly.
  const randomPlayer = getRandomUndraftedPlayer(ctx);
  if (randomPlayer) {
    ctx.selectedPlayerId = randomPlayer.player_id;
  }
  ctx.setAlarm(ctx.playerSelectionTimeLimit);
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
  return (
    // all teams have no remaining funds or full roster or disconnected
    Object.values(ctx.clientMap).every((client) => client.remainingFunds <= 0 || !client.connected) ||
    // or there aren't any more available players
    availablePlayersCount == 0
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
  console.log(`[transitionState] ALARM FIRED. Transitioning from state: ${ctx.serverState}`);
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
      setupPlayerSelection(ctx);

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

      setupPlayerSelection(ctx);
      break;
    case State.PlayerSelection:
      if (isDraftComplete(ctx)) {
        await goToPostAuction(ctx);
        break;
      }

      // If highestBidder is set, it means a bid was made and we should move to Bidding state.
      if (ctx.highestBidder !== undefined) {
        // A team has made an initial bid. Move to the bidding state
        ctx.serverState = State.Bidding;
        ctx.currentlySelectingTeam = undefined;
        ctx.setAlarm(ctx.biddingTimeLimit);
      } else {
        // The alarm fired, which means the team that was supposed to make a bid timed out.
        // Stay in player selection state, and move to the next team.
        setupPlayerSelection(ctx);
      }
      break;
  }
}

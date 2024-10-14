import { Ctx, State, ServerMessage, ServerMessageType, InitClientMessage } from './mod.config';
import { getUndraftedCount, getRosterCounts, getTeamRosterCount, setDraft } from './mod.storage';

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
    maxRosterSize: ctx.maxRosterSize,
    serverState: ctx.serverState,
    currentlySelectingTeam: ctx.currentlySelectingTeam,
    selectedPlayerId: ctx.selectedPlayerId,
    highestBidder: ctx.highestBidder,
    currentBid: ctx.currentBid,
    clientIdIncrementer: ctx.clientIdIncrementer,
    biddingTimeLimit: ctx.biddingTimeLimit,
    playerSelectionTimeLimit: ctx.playerSelectionTimeLimit,
  };
}

export function unserializeCtx(ctx: Ctx, state: DurableObjectState, sql: SqlStorage) {
  // add the unserializable parts back to the context object:
  // set and delete alarm
  ctx.setAlarm = state.storage.setAlarm.bind(state.storage);
  ctx.deleteAlarm = state.storage.deleteAlarm.bind(state.storage);
  ctx.sql = sql;
  // function to store the context to the durable object storage
  ctx.storeCtx = async () => await state.storage.put('ctx', getSerializableCtx(ctx));
  // websockets back to clients
  for (const [clientId, client] of Object.entries(ctx.clientMap)) {
    client.ws = state.getWebSockets(clientId).at(0);
  }
  return ctx;
}

function nextDraftOrder(ctx: Ctx) {
  // get a copy of the initial draft position. this way we can exit if theres a bug
  //   and we do a full loop around the teams.
  const originalDraftPosition = ctx.draftPosition;
  while (true) {
    // increment the draft position, looping back to 0 if we go beyond the number of teams
    ctx.draftPosition = (ctx.draftPosition + 1) % ctx.draftOrder.length;

    // check if this team is valid to select a player
    const client = ctx.clientMap[ctx.draftOrder[ctx.draftPosition]];
    const rosterSize = getTeamRosterCount(ctx, client.clientId) || 0;
    if (client.connected && client.remainingFunds > 0 && rosterSize < ctx.maxRosterSize) {
      ctx.currentlySelectingTeam = client.clientId;
      return;
    }

    if (ctx.draftPosition == originalDraftPosition) {
      // we have gone all the way around and didn't find a new team...
      //   this shouldn't happen. So we don't keep looping forever
      //   just use team 0;
      ctx.currentlySelectingTeam = 0;
      break;
    }
  }
}

function setupPlayerSelection(ctx: Ctx, increment = true) {
  ctx.serverState = State.PlayerSelection;
  ctx.currentBid = undefined;
  ctx.selectedPlayerId = undefined;

  // choose new team to select a player
  if (increment) {
    nextDraftOrder(ctx);
  } else {
    ctx.currentlySelectingTeam = ctx.draftPosition || 0;
  }

  ctx.setAlarm(Date.now() + ctx.playerSelectionTimeLimit);
}

export function updateClients(ctx: Ctx, sendPeers = false, message?: string) {
  let msg: ServerMessage = {
    type: ServerMessageType.Update,
    stateId: ctx.serverState,
    currentBid: ctx.currentBid,
    highestBidder: ctx.highestBidder,
    currentlySelectingTeam: ctx.currentlySelectingTeam,
    selectedPlayerId: ctx.selectedPlayerId,
    message: message,
  };

  if (sendPeers) {
    const rosterSizes = getRosterCounts(ctx);
    msg.peers = Object.values(ctx.clientMap).map((client) => {
      return {
        clientId: client.clientId,
        remainingFunds: client.remainingFunds,
        connected: client.connected,
        ready: client.ready,
        rosterCount: rosterSizes?.[client.clientId.toString()] || 0,
      };
    });
  }

  const msgStr = JSON.stringify(msg);

  Object.values(ctx.clientMap)
    .filter((client) => client.connected && client.ws?.readyState == WebSocket.OPEN) // get the currently connected clients
    .forEach((client) => client.ws?.send(msgStr));
}

export function initializeClient(ctx: Ctx, clientWs: WebSocket) {
  let msg: InitClientMessage = {
    type: 'initialize',
    stateId: ctx.serverState,
    currentBid: ctx.currentBid,
    highestBidder: ctx.highestBidder,
    currentlySelectingTeam: ctx.currentlySelectingTeam,
    selectedPlayerId: ctx.selectedPlayerId,
    peers: Object.values(ctx.clientMap).map((client) => ({
      clientId: client.clientId,
      remainingFunds: client.remainingFunds,
      connected: client.connected,
      ready: client.ready,
    })),
    biddingTimeLimit: ctx.biddingTimeLimit,
    playerSelectionTimeLimit: ctx.playerSelectionTimeLimit,
  };

  const msgStr = JSON.stringify(msg);

  if (clientWs.readyState == WebSocket.OPEN) {
    clientWs.send(msgStr);
  } else {
    console.error(`Failed to send initializeClient message to client!`);
  }

  // let other clients know that another peer has joined
  updateClients(ctx, true, 'Team joined');
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
    Object.values(ctx.clientMap).every(
      (client) => client.remainingFunds <= 0 || rosterSizes?.[client.clientId] >= ctx.maxRosterSize || !client.connected,
    ) ||
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
      setupPlayerSelection(ctx, false);

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
      // check if we should go to results (can happen if valid teams left)
      if (isDraftComplete(ctx)) {
        await goToPostAuction(ctx);
        break;
      }

      // check if we timed out waiting for team to select a player. stay in player selection state
      if (ctx.selectedPlayerId == undefined) {
        setupPlayerSelection(ctx);
        break;
      }
      // A team has selected a player. Move to the bidding state
      ctx.serverState = State.Bidding;
      ctx.currentlySelectingTeam = undefined;
      // give double the time for the first bid after a player is selected so teams have time to pull up stats
      ctx.setAlarm(Date.now() + ctx.biddingTimeLimit * 2);
      break;
  }
}

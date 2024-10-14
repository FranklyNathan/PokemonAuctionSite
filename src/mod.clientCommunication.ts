import { Ctx, ServerMessage, ServerMessageType, ClientMessage, ClientMessageType, ClientId, State } from './mod.config';
import { isValidNumber, transitionState, updateClients } from './mod.helpers';
import { getPlayerDraftedById, getRosterCounts } from './mod.storage';

function sendError(ctx: Ctx, msg: string, clientId: ClientId) {
  let err: ServerMessage = {
    stateId: ctx.serverState,
    type: ServerMessageType.Error,
    message: msg,
  };
  let ws = ctx.clientMap[clientId]?.ws;
  if (ws == null) {
    console.error(
      `Failed to get websocket from the client mapping for client ID ${clientId}, trying to send error message ${JSON.stringify(err)}`,
    );
    return null;
  }
  ws.send(JSON.stringify(err));
  return null;
}

function validateClientMessage(ctx: Ctx, clientId: ClientId, msg: any, rosterCounts: { [clientId: string]: number }): ClientMessage | null {
  // check for an invalid message
  // make sure message type is valid
  if (!(msg.hasOwnProperty('type') && Object.values<string>(ClientMessageType).includes(msg.type))) {
    return sendError(ctx, `The message 'type' parameter ('${msg.stateId}') is invalid!`, clientId);
  }
  // check stateId is valid and corresponds to the server's state
  if (!(msg.hasOwnProperty('stateId') && Object.values<string>(State).includes(msg.stateId))) {
    return sendError(
      ctx,
      `The 'stateId' parameter ('${msg.stateId}') is invalid, or client state does not match the server's state ('${ctx.serverState}')!`,
      clientId,
    );
  }
  if (msg.stateId != ctx.serverState) {
    return sendError(ctx, `Your 'stateId' (${msg.stateId}) does not match the server's state (${ctx.serverState})!`, clientId);
  }
  switch (msg.type as ClientMessageType) {
    case 'ready_up':
      if (ctx.serverState != State.PreAuction) {
        return sendError(ctx, `Readying up is not a valid after the Pre-Auction!`, clientId);
      }
      break;
    case 'bid':
      // if the bid is not a valid number, send an error
      if (!(msg.hasOwnProperty('bid') && isValidNumber(msg['bid']))) {
        return sendError(ctx, `The 'bid' field is missing or is not a valid number: ${msg?.bid}`, clientId);
      }
      // convert the string to a number, and truncate to an integer
      msg.bid = Math.trunc(+msg.bid);

      // bid must be greater than 0 in any state
      if (msg.bid < 1) {
        return sendError(ctx, `The bid must be greater than zero! Got ${msg.bid}`, clientId);
      }

      // the bid cannot be greater than the teams remaining funds in any state
      if (msg.bid > ctx.clientMap[clientId].remainingFunds) {
        return sendError(
          ctx,
          `The bid is greater than your remaing funds! Bid = ${msg.bid}, remaing funds for ${ctx.clientMap[clientId].teamName} = ${ctx.clientMap[clientId].remainingFunds}`,
          clientId,
        );
      }

      // make sure the team isn't over the max roster size
      if ((rosterCounts?.[clientId.toString()] || 0) >= ctx.maxRosterSize) {
        return sendError(ctx, `You are already at the max roster size (${ctx.maxRosterSize})!`, clientId);
      }

      // validate by state
      if (ctx.serverState == State.Bidding) {
        // validate a bid in the bidding state
        // team cannot bid if they are currently the highest bidder
        if (clientId == ctx.highestBidder) {
          return sendError(ctx, `You are already the highest bidder!`, clientId);
        }
        // the bid cannot be less than or equal to the highest current bid
        if (ctx.currentBid != undefined && msg.bid <= ctx.currentBid) {
          return sendError(ctx, `Your bid (${msg.bid}) is not greater than the current highest bid (${ctx.currentBid})`, clientId);
        }
        // bidding time must not have expired (handled by checking if we are in the bidding state)
      } else if (ctx.serverState == State.PlayerSelection) {
        // validate a bid in the Player Selection state
        // only the team currently selecting a player can bid
        if (clientId != ctx.currentlySelectingTeam) {
          return sendError(
            ctx,
            `Bidding is only allowed by the team currently selecting a player: ${ctx.currentlySelectingTeam}`,
            clientId,
          );
        }
        // validate the client sent us the selectedPlayerId for the player they selected
        if (!msg.hasOwnProperty('selectedPlayerId')) {
          return sendError(
            ctx,
            "Message did not contain the 'selectedPlayerId' field, which is necessary when selecting a player!",
            clientId,
          );
        }
        if (!isValidNumber(msg.selectedPlayerId)) {
          return sendError(ctx, `The selectedPlayerId ${msg.selectedPlayerId} is not a valid number!`, clientId);
        }
        msg.selectedPlayerId = Math.trunc(+msg.selectedPlayerId); // convert the selectedPlayerId to an integer
        // make sure the selectedPlayerId sent by the client is a valid player ID
        const draftedByArray = getPlayerDraftedById(ctx, msg.selectedPlayerId);
        if (draftedByArray.length == 0) {
          return sendError(ctx, `The selected player ID ${msg.selectedPlayerId} is not a known player ID!`, clientId);
        } else if (draftedByArray[0] != null) {
          return sendError(ctx, `The selected player (playerId ${msg.selectedPlayerId}) has already been drafted!`, clientId);
        }
      } else {
        // if we aren't in the bidding or player selection state, a bid type message is invalid
        return sendError(ctx, `Bidding is invalid in the (${ctx.serverState}) state`, clientId);
      }
      break;
    default:
      return sendError(ctx, `The message type (${msg.type}) is invalid!`, clientId);
  }

  return msg as ClientMessage;
}

export async function handleClientMessage(ctx: Ctx, clientId: ClientId, messageData: string | ArrayBuffer) {
  if (typeof messageData !== 'string') {
    return sendError(ctx, 'Websocket message data must be a JSON string!', clientId);
  }

  const rosterCounts = getRosterCounts(ctx);

  // first validate the message
  let obj = JSON.parse(messageData);
  let msg = validateClientMessage(ctx, clientId, obj, rosterCounts);
  if (msg == null) return;

  // next act on the message.
  switch (msg.type) {
    case ClientMessageType.ReadyUp:
      ctx.clientMap[clientId].ready = true;
      // if all clients are ready (only need the clients who aren't "done" drafting at the time of
      //   joining (full roster or no money)), go to player selection
      if (
        Object.values(ctx.clientMap).every(
          (client) =>
            (client.connected && client.ready) || // client has readied up
            rosterCounts?.[client.clientId.toString()] >= ctx.maxRosterSize || // client is at the max roster size
            client.remainingFunds <= 0, // client has no remaining funds
        )
      ) {
        await transitionState(ctx);
      }
      break;
    case ClientMessageType.Bid:
      // check that msg.bid is not undefined to make TS happy
      if (msg.bid == undefined) return sendError(ctx, "The 'bid' parameter is empty!", clientId);
      // set the currentBid to this message's bid. We already validated the message's bid is the
      //   highest in validateClientMessageSchema().
      ctx.currentBid = msg.bid;
      ctx.highestBidder = clientId;
      if (ctx.serverState == State.PlayerSelection) {
        ctx.selectedPlayerId = msg.selectedPlayerId;
        ctx.highestBidder = clientId;
        await transitionState(ctx);
        break;
      }
      // reset the bidding time limit
      ctx.deleteAlarm();
      ctx.setAlarm(Date.now() + ctx.biddingTimeLimit);
      break;
  }
  updateClients(ctx, true);
}

///////////////////
// Handler for client disconnecting
//////////////////
export async function closeOrErrorHandler(ctx: Ctx, clientId: ClientId) {
  // remove this ws from the active sessions
  ctx.clientMap[clientId].connected = false;
  ctx.clientMap[clientId].ready = false;
  // if there are now no clients connected, stop the auction by removing any alarm
  //   that triggers state changes.
  // TODO: how to start the auction again if clients rejoin?
  if (Object.values(ctx.clientMap).every((client) => !client.connected)) {
    console.log('All clients disconnected. Deleting alarm (if running)');
    ctx.deleteAlarm();
  }

  await ctx.storeCtx();

  // if we are in the player selection state, we need to select a new team to pick
  //   a player and restart the timer
  if (ctx.currentlySelectingTeam == clientId && ctx.serverState == State.PlayerSelection) {
    // logic for staying in the player selection state and picking a new team is handled
    await transitionState(ctx);
  }

  // if we are in the bidding state, no need to do anything, auction continues
  updateClients(ctx, true);
}

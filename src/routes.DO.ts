import { Ctx, ClientId, ServerMessageType, State, Player } from './mod.config';
import { updateClients, isValidNumber } from './mod.helpers';
import { setupAuction } from './mod.auctionSetup';

import auctionHtml from './html.auction.html';
import { getPlayersJsonString, getResultsJsonString, getTeamRoster } from './mod.storage';

async function setupWebSocket(ctx: Ctx, state: DurableObjectState, ws: WebSocket, clientId: ClientId) {
  if (ctx.clientMap[clientId] == undefined) {
    console.error(`Failed to find client with clientId '${clientId}'. Currently have clientIds: ${Object.keys(ctx.clientMap)}`);
    ws.accept();
    ws.send(
      JSON.stringify({
        type: ServerMessageType.Error,
        message: 'Server error, invalid client ID.',
      }),
    );
    ws.close();
    return;
  }

  // Accept the server side of the websocket (Durable Objects Hibernatable websockets API).
  // Messages are routed to the durable object's `webSocketMessage` and `webSocketClose` methods.
  // Tag this websocket with its client ID so we know which client this websocket is for when
  //   coming out of hibernation.
  state.acceptWebSocket(ws, [clientId.toString()]);

  ctx.clientMap[clientId].connected = true;
  // if the client is (re)joining partway into an auction, they are considered ready (no chance to ready up)
  ctx.clientMap[clientId].ready = ctx.serverState == State.PreAuction ? false : true;
  ctx.clientMap[clientId].ws = ws;

  // send the players for the auction and who else is connected
  await updateClients(ctx, true, true, 'Team joined!');
}

export async function handleWebsocket(request: Request, path: string[], ctx: Ctx, state: DurableObjectState): Promise<Response> {
  if (request.headers.get('Upgrade') != 'websocket') {
    return new Response(`Expected websocket, got ${request.headers.get('Upgrade')}`, { status: 400 });
  }

  // create new WebSockets (one for the client, one for the server)
  const webSocketPair = new WebSocketPair();
  const [clientWs, serverWs] = Object.values(webSocketPair);

  let clientId: ClientId;
  // There are two kinds of auctions: an open auction where there aren't preset teams,
  //   and a closed auction where teams are preset.
  // In the case of preset teams, the user has to select their team from the options,
  //   and the clientId associated with the team is returned as the last part of the URL
  //   in the upgrade request.
  // In the case of no preset teams, we assign a clientId here.
  // ----
  // To validate the ID, make sure its a number. use type coercion in the first call to
  //   isNaN to parse the _entirety_ of the string (`parseFloat` alone does not do this).
  if (path.length >= 3 && isValidNumber(path[2])) {
    clientId = Math.trunc(+path[2]);
  } else {
    return new Response('400 Missing client ID', { status: 400 });
  }

  if (ctx.clientMap[clientId].connected) {
    return new Response(`Invalid team selected! Team "${ctx.clientMap[clientId]?.teamName}" is already connected.`, { status: 400 });
  }

  // set up the server's web socket
  await setupWebSocket(ctx, state, serverWs, clientId);

  ctx.storeCtx(); // save new client to storage

  return new Response(null, {
    status: 101,
    webSocket: clientWs,
  });
}

export async function handleNewAuction(request: Request, ctx: Ctx, url: URL): Promise<Response> {
  const form = await request.formData();
  const res = await setupAuction(ctx, form);
  // function returns errors as a response to send to the client
  if (res instanceof Response) return res;
  try {
    await ctx.storeCtx();
  } catch {
    return new Response('Failed to store auction state!', { status: 500 });
  }

  // Successfully created a new auction. redirect the user to select which team they are
  return Response.redirect(url.origin + '/' + ctx.auctionId, 302);
}

export async function handlePlayersData(_: Request, ctx: Ctx): Promise<Response> {
  // fetch the players from sqlite and send back to client
  // build a JSON array string as the single row of the results
  const players = getPlayersJsonString(ctx);
  return new Response(players, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function handleResultsData(_: Request, ctx: Ctx): Promise<Response> {
  // fetch the players from sqlite and send as csv
  const results = getResultsJsonString(ctx);
  return new Response(results, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export async function handleAuction(req: Request, ctx: Ctx): Promise<Response> {
  // if the auction is already over, redirect to results page
  if (ctx.serverState == State.PostAuction) {
    return Response.redirect(req.url + '/results', 302);
  }

  // create a copy of the clientMap without the websocket handles to send to the client
  const teamsWithoutWs = Object.fromEntries(
    ctx.draftOrder.map((clientId, idx) => {
      // Create a new inner object without the key to be removed
      const { ws: _, ...newClient } = ctx.clientMap[clientId];
      const teamWithDetails: any = { ...newClient };
      teamWithDetails.draftPosition = idx; // add the draft position to the team
      teamWithDetails.roster = getTeamRoster(ctx, clientId); // Add the full roster
      return [clientId, teamWithDetails];
    }),
  );

  // Interpolate data about this auction into the HTML (teams, current state).
  // This is kind of ugly, but it means the client doesn't have to make another round
  //   trip to the server to fetch this stuff as soon it loads the page.
  // teams
  const teamsStr = 'teams: ' + JSON.stringify(teamsWithoutWs);
  let auctionHtmlStr = auctionHtml.replace('teams: {}', teamsStr);
  // state
  const stateStr = `stateId: '${ctx.serverState}'`;
  auctionHtmlStr = auctionHtmlStr.replace("stateId: 'pre_auction'", stateStr);
  // flashbangs enabled
  const flashbangsEnabledStr = `flashbangsEnabled: ${ctx.flashbangsEnabled}`;
  auctionHtmlStr = auctionHtmlStr.replace('flashbangsEnabled: false', flashbangsEnabledStr);

  return new Response(auctionHtmlStr, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
}

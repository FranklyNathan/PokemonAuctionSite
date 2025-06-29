import { State, SECONDS, Ctx, ServerMessageType } from './mod.config';
import { transitionState, updateClients, getSerializableCtx, unserializeCtx } from './mod.helpers';
import { closeOrErrorHandler, handleClientMessage } from './mod.clientCommunication';
import auctionSetupHtml from './html.auctionSetup.html';
import resultsHtml from './html.results.html';
import css from './style.css';

import {
  handleAuction,
  handleNewAuction as handleNewAuctionDO,
  handleTest,
  handleWebsocket,
  handlePlayersData,
  handleResultsData,
} from './routes.DO';
import { handleDO, handleNewAuction as handleNewAuctionWorker, handleIcon, handleModule, handleVendor } from './routes.worker';

/**
 * Associate bindings declared in wrangler.toml with the TypeScript type system
 */
export interface Env {
  AUCTION: DurableObjectNamespace;
}

/**
 * Durable Objects can be used as the single point of coordination for
 *   web socket connections from multiple clients. Workers are stateless,
 *   so cannot "remember" all the clients that are connected.
 */
export class Auction implements DurableObject {
  storage!: DurableObjectStorage;
  state!: DurableObjectState;
  durableObjectId!: DurableObjectId;
  bucket!: R2Bucket;
  sql!: SqlStorage;

  ctx!: Ctx;

  /**
   * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
   *     `DurableObjectStub::get` for a given identifier
   *
   * @param state - The interface for interacting with Durable Object state
   * @param env - The interface to reference bindings declared in wrangler.toml
   */
  constructor(state: DurableObjectState, env: Env) {
    // `blockConcurrencyWhile()` ensures no requests are delivered until
    // initialization completes.
    state.blockConcurrencyWhile(async () => {
      // set the state of the durable object so it can be accessed in fetch() from memory
      this.storage = state.storage;
      this.durableObjectId = state.id;
      this.state = state;
      this.sql = this.storage.sql;

      const existing: Ctx | undefined = await state.storage.get('ctx');
      if (existing) {
        this.ctx = unserializeCtx(existing, this.state, this.storage.sql);
      } else {
        this.ctx = {
          auctionId: state.id.toString(),
          sql: state.storage.sql,
          clientMap: {},
          draftOrder: [],
          draftPosition: 0,
          serverState: State.PreAuction,
          clientIdIncrementer: 0,
          biddingTimeLimit: 15 * SECONDS, // default overwridden by auction setup
          playerSelectionTimeLimit: 60 * SECONDS, // default overwridden by auction setup
          maxRosterSize: 15, // default overwridden by auction setup
          _setAlarm: this.storage.setAlarm.bind(this.storage),
          setAlarm: (durationMs: number) => {
            this.ctx.currentTimeLimit = durationMs;
            this.ctx._setAlarm(Date.now() + durationMs);
          },
          deleteAlarm: this.storage.deleteAlarm.bind(this.storage),
          getAlarm: this.storage.getAlarm.bind(this.storage),
          storeCtx: async () => await this.storage.put('ctx', getSerializableCtx(this.ctx)),
          // leave currentlySelectingTeam, selectedPlayerId, currentBid, and highestBidder undefined.
        };
      }
    });
  }

  /**
   * The Durable Object fetch handler will be invoked when a Durable Object instance receives a
   *     request from a Worker via an associated stub
   *
   * @param request - The request submitted to a Durable Object instance from a Worker
   * @returns The response to be sent back to the Worker
   */
  async fetch(request: Request): Promise<Response> {
    let url = new URL(request.url);
    // slice(1) removes the leading backslash in the pathname
    let path = url.pathname.slice(1).split('/');

    try {
      if (path[1] == 'websocket') {
        return await handleWebsocket(request, path, this.ctx, this.state);
      } else if (path[1] == 'results') {
        // post-auction page with just the players table
        return new Response(resultsHtml, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
      } else if (path[0] == 'new-auction') {
        return await handleNewAuctionDO(request, this.ctx, url);
      } else if (path[0] == 'test') {
        return await handleTest(request, this.ctx);
      } else if (path[1] == 'players-data') {
        return await handlePlayersData(request, this.ctx);
      } else if (path[1] == 'results-data') {
        return await handleResultsData(request, this.ctx);
      } else {
        return await handleAuction(request, this.ctx);
      }
    } catch (e) {
      console.error(e);
      return new Response('Server Error...', { status: 500 });
    }
  }

  async alarm() {
    await transitionState(this.ctx);
    await updateClients(this.ctx, true, true);
    await this.ctx.storeCtx();
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const clientIdStr = this.state.getTags(ws).at(0);
    if (clientIdStr == undefined) {
      console.error('Failed to get client ID for websocket!');
      ws.send(
        JSON.stringify({
          type: ServerMessageType.Error,
          message: 'Failed to get client ID for websocket!',
        }),
      );
    } else {
      await handleClientMessage(this.ctx, +clientIdStr, message);
      await this.ctx.storeCtx();
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const clientIdStr = this.state.getTags(ws).at(0);
    if (clientIdStr == undefined) {
      console.error('Failed to get client ID while closing websocket!');
    } else {
      await closeOrErrorHandler(this.ctx, +clientIdStr);
      await this.ctx.storeCtx();
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.warn('Websocket error:');
    console.error(error);
    // the close handler is always called after the error handler for websockets on errors,
    //   so necessary logic for disconnection happens there.
  }
}

export default {
  /**
   * This is the standard fetch handler for a Cloudflare Worker
   *
   * @param request - The request submitted to the Worker from the client
   * @param env - The interface to reference bindings declared in wrangler.toml
   * @param ctx - The execution context of the Worker
   * @returns The response to be sent back to the client
   */
  async fetch(request: Request, env: Env, _: ExecutionContext): Promise<Response> {
    // We will create a `DurableObjectId` using the pathname from the Worker request
    // This id refers to a unique instance of our 'MyDurableObject' class above

    let url = new URL(request.url);
    let path = url.pathname.slice(1).split('/');

    try {
      if (!path[0] && request.method.toLowerCase() == 'get') {
        // User is setting up a new auction
        return new Response(auctionSetupHtml, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
      } else if (path[0] == 'new-auction' || path[0] == 'test') {
        return await handleNewAuctionWorker(request, env);
      } else if (path[0] == 'style.css') {
        return new Response(css, { headers: { 'Content-Type': 'text/css;charset=UTF-8' } });
      } else if (path[0] == 'modules') {
        return await handleModule(request, path);
      } else if (path[0] == 'assets' && path[1] == 'icons') {
        return await handleIcon(request, path);
      } else if (path[0] == 'vendor') {
        return await handleVendor(request, path);
      } else if (path[0] == 'favicon.ico') {
        return new Response('404 Not Found', { status: 404 });
      } else if (path[0] && /^[0-9a-f]{64}$/.test(path[0])) {
        return await handleDO(request, env, path);
      }
    } catch (e) {
      console.error(e);
      return new Response('Server Error...', { status: 500 });
    }

    return new Response('404 Not Found', { status: 404 });
  },
};

import { State, SECONDS, Ctx, ServerMessageType, ClientMessageType } from './mod.config';
import { transitionState, updateClients, getSerializableCtx, unserializeCtx } from './mod.helpers';
import { getAssetFromKV, NotFoundError } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';
import homeHtml from './html.home.html';
import bossBattlesHtml from '../assets/boss-battles.html';
import v1_7 from '../assets/PatchNotes/v1.7 Patch Notes.txt';
import v1_8 from '../assets/PatchNotes/v1.8 Patch Notes.txt';
import v1_9 from '../assets/PatchNotes/v1.9 Patch Notes.txt';
import v2_0 from '../assets/PatchNotes/v2.0 Patch Notes.txt';
import v2_1 from '../assets/PatchNotes/v2.1 Patch Notes.txt';
import v2_2 from '../assets/PatchNotes/v2.2 Patch Notes.txt';
import v2_3 from '../assets/PatchNotes/v2.3 Patch Notes.txt';
import v2_4 from '../assets/PatchNotes/v2.4 Patch Notes.txt';
import v2_5 from '../assets/PatchNotes/v2.5 Patch Notes.txt';
import v2_6 from '../assets/PatchNotes/v2.6 Patch Notes.txt';
import v2_7 from '../assets/PatchNotes/v2.7 Patch Notes.txt';
import v2_8 from '../assets/PatchNotes/v2.8 Patch Notes.txt';
import v2_9 from '../assets/PatchNotes/v2.9 Patch Notes.txt';
import v3_0 from '../assets/PatchNotes/v3.0 Patch Notes.txt';
import v4_0 from '../assets/PatchNotes/v4.0 Patch Notes.txt';
import v4_1 from '../assets/PatchNotes/v4.1 Patch Notes.txt';
import v4_2 from '../assets/PatchNotes/v4.2 Patch Notes.txt';
import v4_3 from '../assets/PatchNotes/v4.3 Patch Notes.txt';
import v4_4 from '../assets/PatchNotes/v4.4 Patch Notes.txt';
import v4_5 from '../assets/PatchNotes/v4.5 Patch Notes.txt';
import v4_6 from '../assets/PatchNotes/v4.6 Patch Notes.txt';
import v4_7 from '../assets/PatchNotes/v4.7 Patch Notes.txt';
import v4_8 from '../assets/PatchNotes/v4.8 Patch Notes.txt';
import v4_9 from '../assets/PatchNotes/v4.9 Patch Notes.txt';
import v5_0 from '../assets/PatchNotes/v5.0 Patch Notes.txt';
import v5_1 from '../assets/PatchNotes/v5.1 Patch Notes.txt';
import v5_2 from '../assets/PatchNotes/v5.2 Patch Notes.txt';
import v5_3 from '../assets/PatchNotes/v5.3 Patch Notes.txt';
import v5_4 from '../assets/PatchNotes/v5.4 Patch Notes.txt';
import v5_5 from '../assets/PatchNotes/v5.5 Patch Notes.txt';
import v5_7 from '../assets/PatchNotes/v5.7 Patch Notes.txt';
import v5_8 from '../assets/PatchNotes/v5.8 Patch Notes.txt';
import v5_9 from '../assets/PatchNotes/v5.9 Patch Notes.txt';
import v6_0 from '../assets/PatchNotes/v6.0 Patch Notes.txt';
import v6_1 from '../assets/PatchNotes/v6.1 Patch Notes.txt';
import v6_2 from '../assets/PatchNotes/v6.2 Patch Notes.txt';
import v6_3 from '../assets/PatchNotes/v6.3 Patch Notes.txt';
import patchNotesHtml from './html.patchNotes.html';
import { closeOrErrorHandler, handleClientMessage } from './mod.clientCommunication';
import gymsText from '../assets/gyms.txt';
import auctionSetupHtml from './html.auctionSetup.html';
import speciesInfoText from '../assets/speciesinfo.txt';
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

const assetManifest = JSON.parse(manifestJSON);

/**
 * Associate bindings declared in wrangler.toml with the TypeScript type system
 */
export interface Env {
  AUCTION: DurableObjectNamespace;
  __STATIC_CONTENT: KVNamespace;
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
  env: Env;
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
      this.env = env;
      this.sql = this.storage.sql;

      const existing: Ctx | undefined = await state.storage.get('ctx');
      if (existing) {
        this.ctx = unserializeCtx(existing, this.state, this.storage.sql);
      } else {
        this.ctx = {
          auctionId: state.id.toString(),
          storage: this.storage,
          sql: state.storage.sql,
          clientMap: {},
          draftOrder: [],
          draftPosition: 0,
          serverState: State.PreAuction,
          clientIdIncrementer: 0,
          isPaused: false,
          flashbangsEnabled: false, // default to disabled
          biddingTimeLimit: 15 * SECONDS, // default overwridden by auction setup
          playerSelectionTimeLimit: 60 * SECONDS, // default overwridden by auction setup
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
    const path = url.pathname.slice(1).split('/');
    console.log(`[Durable Object] FETCH HANDLER | Received request for path: ${url.pathname}`);
    const route = path.length > 1 ? path[1] : path[0];

    try {
      if (route == 'websocket') {
        return await handleWebsocket(request, path, this.ctx, this.state);
      } else if (path[1] === 'results') {
        // Inject a cache-busting favicon link into the results page.
        const modifiedResultsHtml = resultsHtml.replace('</head>', `<link rel="icon" href="/favicon.ico?v=1" type="image/x-icon">\n</head>`);
        // post-auction page with just the players table
        return new Response(modifiedResultsHtml, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
        // post-auction page with just the players table
        return new Response(resultsHtml, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
      } else if (path[0] == 'new-auction') {
        return await handleNewAuctionDO(request, this.ctx, url);
      } else if (path[1] == 'players-data') {
        return await handlePlayersData(request, this.ctx);
      } else if (path[1] == 'results-data') {
        return await handleResultsData(request, this.ctx);
      } else {
        console.log(`[Durable Object] Path did not match a specific DO route. Treating as request for main auction HTML.`);
        const auctionHtml = await handleAuction(request, this.ctx);
        const auctionHtmlText = await auctionHtml.text();
        return new Response(auctionHtmlText.replace('</head>', `<link rel="icon" href="/favicon.ico?v=1" type="image/x-icon">\n</head>`), auctionHtml);
      }
    } catch (e) {
      console.error(`[Durable Object Fetch] Error on path ${url.pathname}:`, e);
      return new Response('Server Error...', { status: 500 });
    }
  }

  async alarm() {
    if (this.ctx.isPaused) {
      console.log('[Server] Alarm fired while paused. Ignoring.');
      // Do nothing. The timer will be correctly resumed when the user un-pauses.
      return;
    }
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
      console.log(`[Durable Object] webSocketMessage received from client ${clientIdStr}.`);
      try {
        console.log(`[Durable Object] Message content: ${message as string}`);
      } catch (e) {
        console.log('[Durable Object] Message content is not a string.');
      }
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    console.log(`[Worker Fetch] Received request for: ${url.pathname}`);
    
    if (request.method.toUpperCase() === 'GET') {
      try {
        // Try to serve static assets first for GET requests
        console.log(`[Worker Fetch] 1. Attempting to serve as a static asset from KV: ${url.pathname}`);
        return await getAssetFromKV(
          {
            request,
            waitUntil: (promise) => ctx.waitUntil(promise),
          },
          {
            ASSET_NAMESPACE: env.__STATIC_CONTENT,
            ASSET_MANIFEST: assetManifest,
          },
        );
      } catch (e) {
        if (!(e instanceof NotFoundError)) {
          // This is a real error, not just a file not found.
          console.error(`[Worker Fetch] Error serving static asset for path ${url.pathname}:`, e);
          return new Response('Server Error...', { status: 500 });
        }
        // It's a NotFoundError, so it's not a static asset. Continue to the API router.
        console.log(`[Worker Fetch] Not a static asset, proceeding to API router for path: ${url.pathname}`);
      }
    }
    
    // API Router
    let path = url.pathname.slice(1).split('/');
    console.log(`[Worker Fetch] 2. Entering API router for path: ${url.pathname}`);
    try {
      if (path[0] === '' && request.method.toLowerCase() == 'get') {
        // User is at the home page
        const modifiedHomeHtml = homeHtml.replace('</head>', `<link rel="icon" href="/favicon.ico?v=1" type="image/x-icon">\n</head>`);
        return new Response(modifiedHomeHtml, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
      } else if (path[0] === 'setup' && request.method.toLowerCase() == 'get') {
        // User is setting up a new auction
        // Inject a cache-busting favicon link into the setup page.
        const modifiedSetupHtml = auctionSetupHtml.replace('</head>', `<link rel="icon" href="/favicon.ico?v=1" type="image/x-icon">\n</head>`);
        return new Response(modifiedSetupHtml, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
      } else if (path[0] == 'new-auction' || path[0] == 'new-pokemon-auction') {
      } 
      
      // Handle asset routes that might be requested from within an auction page (e.g., /<auction_id>/clientModules/...)
      // We check for these before checking for an auction ID to prevent the DO from incorrectly handling the request.
      if (path.includes('clientModules')) {
        return await handleModule(request, ['clientModules', path[path.length -1]]);
      }

      // Serve patch notes text files directly from bundled assets to avoid static-KV mismatches on deploy
      if (path[0] === 'assets' && path[1] === 'PatchNotes' && path[2]) {
        const filename = decodeURIComponent(path[2]);
        const map: Record<string, string> = {
          'v1.7 Patch Notes.txt': v1_7,
          'v1.8 Patch Notes.txt': v1_8,
          'v1.9 Patch Notes.txt': v1_9,
          'v2.0 Patch Notes.txt': v2_0,
          'v2.1 Patch Notes.txt': v2_1,
          'v2.2 Patch Notes.txt': v2_2,
          'v2.3 Patch Notes.txt': v2_3,
          'v2.4 Patch Notes.txt': v2_4,
          'v2.5 Patch Notes.txt': v2_5,
          'v2.6 Patch Notes.txt': v2_6,
          'v2.7 Patch Notes.txt': v2_7,
          'v2.8 Patch Notes.txt': v2_8,
          'v2.9 Patch Notes.txt': v2_9,
          'v3.0 Patch Notes.txt': v3_0,
          'v4.0 Patch Notes.txt': v4_0,
          'v4.1 Patch Notes.txt': v4_1,
          'v4.2 Patch Notes.txt': v4_2,
          'v4.3 Patch Notes.txt': v4_3,
          'v4.4 Patch Notes.txt': v4_4,
          'v4.5 Patch Notes.txt': v4_5,
          'v4.6 Patch Notes.txt': v4_6,
          'v4.7 Patch Notes.txt': v4_7,
          'v4.8 Patch Notes.txt': v4_8,
          'v4.9 Patch Notes.txt': v4_9,
          'v5.0 Patch Notes.txt': v5_0,
          'v5.1 Patch Notes.txt': v5_1,
          'v5.2 Patch Notes.txt': v5_2,
          'v5.3 Patch Notes.txt': v5_3,
          'v5.4 Patch Notes.txt': v5_4,
          'v5.5 Patch Notes.txt': v5_5,
          'v5.7 Patch Notes.txt': v5_7,
          'v5.8 Patch Notes.txt': v5_8,
          'v5.9 Patch Notes.txt': v5_9,
          'v6.0 Patch Notes.txt': v6_0,
          'v6.1 Patch Notes.txt': v6_1,
          'v6.2 Patch Notes.txt': v6_2,
          'v6.3 Patch Notes.txt': v6_3,
        };
        const content = map[filename];
        if (content !== undefined) {
          return new Response(content, { headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
        }
        return new Response('404 Not Found', { status: 404 });
      }

      if (path[0] == 'new-auction' || path[0] == 'new-pokemon-auction') {
        const response = await handleNewAuctionWorker(request, env, path.slice(1));
        // If the handler returned an error, let's log it before returning it.
        // A 302 redirect is not "ok", but it's expected. Only log actual server errors (4xx or 5xx).
        if (response.status >= 400) {
          console.error(`[Worker Fetch] Handler for ${url.pathname} returned an error response:`, response.status, response.statusText);
        }
        return response;
      } else if (path[0] === 'api' && path[1] === 'speciesinfo') {
        console.log(`[Worker Fetch] Matched /api/speciesinfo route. Content length: ${speciesInfoText.length}`);
        return new Response(speciesInfoText, { headers: { 'Content-Type': 'text/plain' } });
      } else if (path[0] == 'style.css') {
        return new Response(css, { headers: { 'Content-Type': 'text/css;charset=UTF-8' } });
      } else if (path[0] == 'clientModules') {
        console.log(`[Worker Fetch] 3. Routing to handleModule for path: ${url.pathname}`);
        return await handleModule(request, path);
      } else if (path[0] == 'assets' && path[1] == 'icons') {
        return await handleIcon(request, path);
      } else if (path[0] === 'assets' && path[1] === 'boss-battles.html') {
        console.log(`[Worker Fetch] Matched /assets/boss-battles.html route.`);
        return new Response(bossBattlesHtml, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
      } else if (decodeURIComponent(path[0]) === 'patch notes' && request.method.toLowerCase() == 'get') {
        // Legacy URL with a space — redirect to the canonical no-separator URL
        return Response.redirect('/patchnotes', 302);
      } else if (path[0] === 'patch-notes' && request.method.toLowerCase() == 'get') {
        // Older dash-based URL — redirect to canonical no-separator URL
        return Response.redirect('/patchnotes', 302);
      } else if (path[0] === 'patchnotes' && request.method.toLowerCase() == 'get') {
        const modifiedPatchHtml = patchNotesHtml.replace('</head>', `<link rel="icon" href="/favicon.ico?v=1" type="image/x-icon">\n</head>`);
        return new Response(modifiedPatchHtml, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
      } else if (path[0] === 'assets' && path[1] === 'gyms.txt') {
        console.log(`[Worker Fetch] Matched /assets/gyms.txt route.`);
        return new Response(gymsText, { headers: { 'Content-Type': 'text/plain' } });
      } else if (path[0] == 'vendor') {
        return await handleVendor(request, path);
      } else if (path[0] && /^[0-9a-f]{64,64}$/.test(path[0])) {
        return await handleDO(request, env, path);
      } else if (path[0] === 'favicon.ico') {
        // The getAssetFromKV doesn't handle root-level assets well. We'll serve it manually.
        return await handleModule(request, ['assets', 'favicon.ico']);
      }
      // If no API route matched, it's a 404 for the API.
      console.log(`[Worker Fetch] 4. No API route matched for path: ${url.pathname}`);
      return new Response('404 Not Found', { status: 404 });
    } catch (e) {
      console.error(`[Worker Fetch] 5. Uncaught error in API router for path ${url.pathname}:`, e);
      return new Response('Server Error...', { status: 500 });
    }
  },
};

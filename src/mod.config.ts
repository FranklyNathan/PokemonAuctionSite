////////////
// Constants
////////////
export const SECONDS = 1000;

////////
// enums
////////
export enum ClientMessageType {
  ReadyUp = 'ready_up',
  Bid = 'bid',
  TogglePause = 'toggle_pause',
  Flashbang = 'flashbang',
  ClaimEevee = 'claim_eevee',
  UnclaimEevee = 'unclaim_eevee',
  Error = 'error',
}

export enum ServerMessageType {
  Update = 'update',
  Error = 'error',
}

export enum State {
  PreAuction = 'pre_auction',
  PlayerSelection = 'player_selection',
  Bidding = 'bidding',
  AuctionOver = 'auction_over',
  PostAuction = 'post_auction',
}

///////////////////////
// Types and interfaces
///////////////////////
export type ClientId = number;

export interface ClientMessage {
  type: ClientMessageType;
  stateId: State;
  bid?: number;
  selectedPlayerId?: number;
  targetClientId?: ClientId;
  message?: string;
}

export interface Peer {
  clientId: ClientId;
  remainingFunds: number;
  connected: boolean;
  ready: boolean;
}

export interface ServerMessage {
  type: ServerMessageType;
  stateId: State;
  peers?: Peer[];
  currentBid?: number;
  highestBidder?: ClientId;
  isPaused?: boolean;
  flashbangsEnabled?: boolean;
  flashbangedClientId?: ClientId;
  currentlySelectingTeam?: ClientId;
  totalPokemonAuctioned?: number;
  selectedPlayerId?: PlayerId;
  currentAlarmTime?: number; // target timestamp when alarm will run out in milliseconds elapsed since the UNIX epoch
  currentTimeLimit?: number; // original total time duration of the current alarm in ms
  remainingTimeOnResume?: number; // The remaining time in ms when a timer is resumed from a pause.
  message?: string;
}

export type PlayerId = number;

export interface Player {
  id: number;
  name: string;
  type: string;
  isStarred: boolean;
}

export interface Client {
  clientId: ClientId;
  ws: WebSocket | undefined;
  teamName: string;
  initialFunds: number;
  remainingFunds: number;
  ready: boolean;
  connected: boolean;
}

export interface Ctx {
  // maps client IDs to their websockets. just a handle to get the websocket.
  auctionId: string;
  storage: DurableObjectStorage;
  sql: SqlStorage;
  clientMap: { [clientId: ClientId]: Client };
  draftOrder: ClientId[];
  draftPosition: number;
  serverState: State;
  currentlySelectingTeam?: ClientId;
  selectedPlayerId?: PlayerId;
  flashbangsEnabled: boolean;
  isPaused: boolean;
  remainingTimeOnPause?: number;
  highestBidder?: ClientId;
  flashbangedClientId?: ClientId;
  currentBid?: number;
  clientIdIncrementer: number; // what ID to use for the next incoming client
  biddingTimeLimit: number; // length of time in milliseconds for the Bidding state
  playerSelectionTimeLimit: number; // length of time in milliseconds for the Player Selection state
  totalPokemonAuctioned: number;
  currentTimeLimit?: number;
  eeveeClaims: { [evolution: string]: { clientId: ClientId; teamName: string } }; // Track which Eeveelution is claimed by whom
  _setAlarm: Function;
  setAlarm: Function;
  deleteAlarm: Function;
  getAlarm: Function;
  storeCtx: Function;
}

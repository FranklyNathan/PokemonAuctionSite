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
  message?: string;
}

export interface Peer {
  clientId: ClientId;
  remainingFunds: number;
  connected: boolean;
  ready: boolean;
}

export interface InitClientMessage {
  type: 'initialize';
  stateId: State;
  peers: Peer[];
  currentBid?: number;
  highestBidder?: ClientId;
  currentlySelectingTeam?: ClientId;
  selectedPlayerId?: PlayerId;
  biddingTimeLimit: number;
  playerSelectionTimeLimit: number;
}

export interface ServerMessage {
  type: ServerMessageType;
  stateId: State;
  peers?: Peer[];
  currentBid?: number;
  highestBidder?: ClientId;
  currentlySelectingTeam?: ClientId;
  selectedPlayerId?: PlayerId;
  message?: string;
}

export type PlayerId = number;

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
  sql: SqlStorage;
  clientMap: { [clientId: ClientId]: Client };
  draftOrder: ClientId[];
  draftPosition: number;
  maxRosterSize: number;
  serverState: State;
  currentlySelectingTeam?: ClientId;
  selectedPlayerId?: PlayerId;
  highestBidder?: ClientId;
  currentBid?: number;
  clientIdIncrementer: number; // what ID to use for the next incoming client
  biddingTimeLimit: number; // length of time in milliseconds for the Bidding state
  playerSelectionTimeLimit: number; // length of time in milliseconds for the Player Selection state
  setAlarm: Function;
  deleteAlarm: Function;
  storeCtx: Function;
}

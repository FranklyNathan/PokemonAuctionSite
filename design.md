# Project TODOs

- [ ] add setup parameter for multiplier of how much longer the first time period is right after selecting a playerd
- [ ] add ability to pass on bidding (highest bidder gets player if everyone else passes)
- [ ] add ability to pass on selecting a player
- [ ] add ability to write in player name to draft
- [ ] When a client rejoins partway through a phase, the time limit for the phase never starts
  - need to keep track of the time the phase timer started in the server's ctx
  - when a player rejoins, add the remaining time to the message from the server so client can set remaining time
- [ ] improve mobile functionality (works but players table super squished)
- [ ] how to start the auction again if after all clients disconnect, 1 or more clients rejoin?
  - player selection state is partially functional because whoever's up just needs to select a player, which triggers transition into the bidding state
    - until the select a player, they have infinite time though...
  - if everyone leaves in the bidding state, the transition timer is deleted and there is no way to
- [ ] find an easy way to bundle shoelace dependency with the server so app doesn't depend on any other servers to get dependencies.

# Technical Design

### State management

Components should be updated precisely when data is updated. Don't use a single global state with full page re-rendering.

**Components with State Management**

- Current team picking header:
  - Whose turn it is. When turn changes, team order changes
  - Number of teams in the auction. When someone joins or drops, need to add or remove them from the teams
  - Remaining cash per team. When someone picks a player their remaining cash has to be decreased
- Current player up for auction
- Current leading bid
- Auction timer
- Player list
  - When a player is drafted, remove them from the list
- Taken list
  - When a player is drafted, add them to this list

**State Management**

- Teams in the auction
  - Cash per team
  - Order
- Current turn
  - Player up for auction
  - Current bid / team who made the bid
  - Time remaining
- Players
  - who's been drafted

### Coordinating Timing Between Clients

All clients (one per team), need to have auction timing coordinated!

- When the auction starts, all clients need to start their local timers to show a countdown
- When bidding time for a player is up, all clients timers should transition to the countdown for the next team to pick a player to bid on.
- When the team has chosen a player, all clients should start the bidding countdown again.

**The server signals all client state changes**. The server has the ground truth timer running. The server will send a message to all clients to:

- Enter the bidding state (start the bidding timer) when a player is selected
- Reset the local time to bid when a bid is received
- Move to the Player Selection state when the time to bid runs out

The coordination messages will have a time

### Server States

The states below are reflected by the server. The states on the server side are determined by timers and user action.

There are **four states**. Possible actions performed in the state and how the server responds are listed:

1. Pre-Auction
   a. All teams ready up. Send message to all clients to move to picking state, first team in draft order gets notified they are picking.
2. Player Selection
   a. Client who is picking responds with player and bid. Send message to all clients to move to bidding state.
   b. Client picking runs out of time. Set them to not picking, set the client next up in the draft order to pick.
3. Bidding
   a. Client other than highest bidder sends a higher bid. They are now highest bidder. Reset bid timer.
   b. Bid timer runs out. Highest bidder gets the player. Send message to all clients to move to picking state for next up in the draft order
4. Post-Auction

https://asciiflow.com/#/

```
                            ┌─────────────┐
                            │             │
                            │ Pre-Auction │
                            │             │
                            └──────┬──────┘
                                   │
  ┌───────┐                        └────Start-auction───┐
  │New team bids highest                                │    ┌───────┐
  │       │                                             │    │   Team leaves
  │   ┌───▼─────────┐                          ┌───────▼───▼──┐   │
  └───┤   Bidding    ◄──────Player-selected────┤     Player     ├───┘
      │   (team X    │                          │   Selection    │
      │ highest bid) ├───Time-to-bid-expires───►  By Team X     │
      └────┬─────────┘                          └────────────────┘
           │
    bidding ends AND
      (Team rosters
          full
           OR
    Teams with roster
    space out of money)      ┌──────────────┐
           │                 │              │
           └─────────────────►Post-Auction │
                             │              │
                             └──────────────┘
```

When the server receives a message from the client, often it will have to validate the client action. For example, a team cannot bid more money than they currently have left. Rules like this are enforced on the client side too, but server needs to validate as well because we don't trust the client!

### Client States

The states below are reflected by the client. They are very similar to the server states, except broken out into whether or not this team or another team is in a specific state.

The states on the client side are purely determined by the server (client state changes are coordinated through websocket messages).

There are **six states**. User actions in each state are listed as well:

1. Pre-Auction
   a. User can ready up. Once all players ready, auction will begin
2. Player Selection by This Team
   a. User has to select a player from the player list and make a bid (move to state 4)
   b. User runs out of time to pick a player and bid (move to state 3)
3. Player Selection by Another Team
   a. User has no actions
4. Bidding (This team has highest bid)
   a. User has no actions
5. Bidding (Other team has highest bid)
   a. User can make a highest bid (move to state 4)
6. Post-Auction

```
                   ┌────────────────────────────────────────────────────────────────┐
                   │                                                                │
                   │     ┌─────────────┐                                            │
                   │     │             │                                            │
                   │     │ Pre-Auction │             ┌─────────────────────────┐    │
                   │     │             │             │                         │    │
                   │     └──────┬──────┘             │    ┌───────┬───────┐    │    │
                   │            │                    │    │       │       │    │    │
                   └───────┐    └────Start-auction───┤    │   Other Team  │    │    │
                           │                         │    │     Leaves    │    │    │
                           │                         │    │       │       │    │    │
   ┌──────────────┐        │                  ┌─────▼────▼──┐   │    ┌──▼───▼───▼─┐
   │   Bidding    ├───Time-to-bid-expires────►    Player     ├───┘    │    Player     │
   │ (Other team  │                           │   Selection   │        │  Selection    │
   │   leading)   ◄──────Player-Selected─────┤ by Other Team │        │ by This Team  │
   └────┬───┬───▲┘                           └───────────▲──┘        └──┬────┬───────┘
        │   │   │                                          │   Player     │    │
        │   │   └──────┐                                   └──runs out of─┘    │
        │   │          │                                    time or leaves     │
        │   │  ┌───────┴──────┐                                                │
        │   │  │    Bidding   │          This team selects a player            │
        │   └──►  (This team  ◄───────────and places starting bid────────────┘
        │      │    Leading)  │
        │      └──────────────┘
        │                         Team rosters           ┌──────────────┐
        │                            full                │              │
        └────Bidding-ends-AND─────────OR─────────────────► Post-Auction│
                               Teams with roster         │              │
                               space out of money        └──────────────┘
```

### Server Client Communication

**Exhaustive list of Client => Server messages**

- "ready_up" - team is ready to start the auction
- "bid" - team bids on a player

Message schema:

```
{
    "type": "ready_up OR bid OR error",
    "state_id": "pre_auction OR state_player_selection OR state_bidding OR post_auction",
    "bid": 9,
    "message": "string"
}
```

That's it! Simple.

**Exhaustive list of Server => Client messages**

- "players" - server sending the auction players to the client
- "bid" - server lets all clients know the knew highest bid. Data dictionary contains:
  - bid (The new highest bid)
  - highest_bidder (which team is the highest bidder)
- "state_player_selection" - Transition into the Player Selection state. Data dictionary contains:
  - state_id: "player_selection"
  - selecting_team (which team is up to select a player)
- "state_bidding" - Transition into the Player Selection state. Data dictionary contains:
  - state_id: "bidding"
  - bid (the starting bid)
  - highest_bidder (which team is the highest bidder)
- "post_auction" - Transition into the Player Selection state. Data dictionary contains:
  - state_id: "post_auction

Message schema:

```
{
    "type": "bid OR state_player_selection OR state_bidding OR statePostAuction OR error",
    "state_id": "state_player_selection OR state_bidding OR post_auction",
    "current_bid": 9,
    "highest_bidder": "team_0",
    "currently_selecting_team": "Fisher",
    "peers": [
      {
        "client_id": 0,
        "remaining_funds": 97,
        "connected": true,
        "ready": true

      },
      {
        "client_id": 1,
        "remaining_funds": 140,
        "connected": true,
        "ready": true
      },
    ]
    "message": "string"
}
```

Every time an event of the auction happens a message of this schema is sent to the client, with the exception of the `peers` key which can be left out when there aren't any changes to any clients.

If the auction state changes, the client updates its internal state and starts a new timer that roughly corresponds to the server's timer.




### Server Client Message Validation

When the server receives a message from the client, often it will have to validate the client action because we don't trust the client. First validate the message is valid for the current state, then validate any special cases.

State validation is simple as there are only 2 messages. "ready_up" is only valid in the Pre-Auction state. "Bid" is only valid in the Bidding state and Player-Selection state.

There are more special validations for the "bid" message:

In the Player-Selection state, "bid" is only valid from the client that is selecting a player.

In the Bidding state, "bid" is only valid if:

- the bidding team has funds >= the bid
- AND the current highest bid is not held by the bidder
- AND bidding time has not expired (already handled by checking the state)

### How Does the Server Identify What Team a Message Comes From?

When each client's websocket is set up, a listener is attached that runs when the websocket recieves a message. The websocket itself for some reason doesn't have any enumerable fields (JSON.stringify evaluates it to `{}`) so we can't use the websocket's fields to identify the team / client.

So we need to match up that websocket with a client ID that is saved to a map, and pass that ID into the message recieved listener.

The client ID map can just be an object with a integer ID mapped to the websocket. The integer ID should just be incremented every time a new team joins.

### Auction Creation / User Entry Flow

**User creating an auction starts here**

- user goes to home page to set up an auction
  - stateless, served by cloudflare worker directly.
- submits auction setup details to `/setup-auction`
  - terminates in the durable object
  - saves state of the new auction
  - redirects to `/<auction_id>`

**Other users joining an existing auction start here**

- go to `/<auction_id>` to select which team they are and join the auction
  - main auction page opens a websocket connection and initially requests all the teams so the user can identify themselves

# UX Design

Inspiration: https://berkeleygraphics.com, https://berkeleygraphics.com/public-affairs/bulletins/BT-002/

- Functional
- Dense
- Simple components (prefer default )
- Text heavy (lots of text, but also prioritizing using text for shapes / style where possible)

# Data Storage
Most of the data about the auction is quite small (teams, time limits), but the players data can get quite large. In fact the full list of NHL players from the NHL API is too large to fit within the limit of a single durable object value (1023 players == 275923 bytes, larger than limit of 131072 bytes).

Options for handling this issue:

- Use cloudflare r2 object storage to store the csv. Durable objects are really meant for coordination of state, not for data storage, so it might make sense to put the full list of players in r2 instead..
  - The only two times the full list of players is required is when the client initially loads the auction, and again when the results table rows are generated.
    - results table rows should also be saved back to r2
  - PRO: object storage is cheap, and will be fast inside the cloudflare network
  - PRO: csv of results in r2 is a dead simple and somewhat user accessible format even if the app completely dies
- Break up the players data into chunks that fit within the value byte limit, and only load from durable object transactional storage when needed (don't load every time the durable object is re-created).
  - CON: more complex saving and loading data due to having to break it up into chunks based on size
  - PRO: only 1 storage service (durable object transactional storage) instead of 2
- Use the new sqlite storage interface provided by durable objects
  - PRO: easy SQL interface for updating players when they are drafted
  - PRO: No need to serialize to and from csv when working on the players data

Option 3, durable objects sqlite storage interface, seems like the best option here.
- How to ingest json (array of js objects) data into sqlite? Since we support a dynamic number of columns in the upload, this is a bit tricky. We can really just have 2 columns:
  - player_id: integer primary key
  - player_data: JSONB (whole json object. this way we don't have to have a dynamic number of columns based on what was uploaded)
    - we can still do operations on the json data by using sqlites json functions when a player is drafted.

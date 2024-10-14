# Auction-Draft
A web app to run a multi-user auction style fantasy draft with realtime updates to all connected clients. Built on Cloudflare Workers + Durable Objects, vanilla JS and HTML with Shoelace components.

Test it out at https://auction.snisher.workers.dev

## Usage
Step one is setting up the auction. You'll need a CSV file of all the available players available to draft. If you are in a Yahoo league, there is a script provided `scrape_players.py` that will download all the players from a fantasy hockey league. To use it, you need to set up a Yahoo Fantasy Application that has access to your league data and set the necessary env vars with the necessary authentication.

## Design
See design.md for ramblings on the design.

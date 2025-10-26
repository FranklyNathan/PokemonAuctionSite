import { isValidNumber } from './mod.helpers';
import { createPlayersTable, insertPlayers } from './mod.storage';
import { Ctx, SECONDS } from './mod.config';
import Papa from 'papaparse';
import defaultPokCsv from '../Pok.csv';

export async function initPlayers(ctx: Ctx, data: string | any[]): Promise<Response | void> {
  let playerRows: any[];
  let headers: string[];

  if (typeof data === 'string') {
    const parseRes = Papa.parse(data, { header: true, skipEmptyLines: true, dynamicTyping: true });
    headers = parseRes.meta.fields || [];
    playerRows = parseRes.data as any[];
    // Check for essential headers. 'is_baby' is now also expected.
    if (!(headers.includes('name') && headers.includes('type') && headers.includes('is_baby'))) {
      return new Response("CSV file did not have 'name', 'type', and 'is_baby' headers!", { status: 400 });
    }
  } else {
    // Data is pre-parsed from the test auction
    playerRows = data;
    headers = playerRows.length > 0 ? Object.keys(playerRows[0]) : [];
  }

  const processedPlayerRows = playerRows.map((row, idx) => {
    const draftedByIdRaw = row.drafted_by_id;
    let drafted_by_id = null;
    let cost = null;
    let keeper = false;

    // if the ID matches one of the teams, add the player to their roster
    if (typeof draftedByIdRaw === 'number' && Object.keys(ctx.clientMap).includes(String(draftedByIdRaw - 1))) {
      drafted_by_id = draftedByIdRaw - 1; // convert to zero based index
      cost = typeof row.cost === 'number' ? row.cost : null;
      keeper = true;
    }

    // Add draft-specific properties to the player object from the CSV row.
    row.cost = cost;
    row.drafted_by_id = drafted_by_id;
    row.keeper = keeper;

    // Create the final nested structure that the database queries expect.
    return {
      player_id: idx,
      player_data: row,
    };
  });

  try {
    await createPlayersTable(ctx);
    await insertPlayers(ctx, processedPlayerRows);
  } catch (e) {
    console.error('Error during player initialization and database insertion:', e);
    return new Response('Failed to import players and create the auction!', { status: 500 });
  }
}

export async function setupAuction(ctx: Ctx, form: FormData): Promise<Response | undefined> {
  const resourceMode = form.get('resourceMode') === 'true';

  if (resourceMode) {
    ctx.stateId = 'auction_over'; // This state enables clicking players for info
    ctx.isResourceMode = true;
    await ctx.storage.put('isResourceMode', true);
    ctx.totalPokemonAuctioned = 0;
    ctx.biddingTimeLimit = 0;

    const res = await initPlayers(ctx, defaultPokCsv);
    if (res instanceof Response) {
      return res;
    }
    return; // Skip the rest of the setup
  }
  const biddingTimeLimit = form.get('biddingTimeLimit');
  const totalPokemonAuctioned = form.get('totalPokemonAuctioned');
  if (
    !(
      typeof biddingTimeLimit == 'string' &&
      isValidNumber(biddingTimeLimit) &&
      typeof totalPokemonAuctioned == 'string' &&
      isValidNumber(totalPokemonAuctioned)
    )
  ) {
    return new Response('Got invalid values for the time limit or total Pokémon auctioned!', { status: 400 });
  }

  ctx.biddingTimeLimit = +biddingTimeLimit * SECONDS;
  ctx.totalPokemonAuctioned = +totalPokemonAuctioned;
  ctx.flashbangsEnabled = form.get('flashbangsEnabled') === 'on';

  // this logic started as supporting not specifying specific teams and just letting a certain number of people join
  let numTeams = 100; // default number of teams
  const numTeamsVal = form.get('numTeams');
  if (numTeamsVal != null && typeof numTeamsVal == 'string' && isValidNumber(numTeamsVal)) {
    numTeams = +numTeamsVal;
  }

  for (let team = 0; team < numTeams; team++) {
    const clientId = ctx.clientIdIncrementer++; // increments clientIdIncrementer, returning the initial value before incrementing
    const teamName = (form.get(`team${team}Name`) as string)?.replace(/[^a-zA-Z0-9']/g, '').slice(0, 50);
    ctx.clientMap[clientId] = {
      clientId: clientId,
      ws: undefined,
      teamName: teamName,
      initialFunds: +(form.get(`team${team}Funds`) as string),
      remainingFunds: +(form.get(`team${team}Funds`) as string),
      ready: false,
      connected: false,
    };
    ctx.draftOrder.push(clientId);
  }

  let csvText: string;
  const useDefaultCsv = form.get('useDefaultCsv') === 'true';

  if (useDefaultCsv) {
    csvText = defaultPokCsv;
  } else {
    const file = form.get('csvInput');
    if (!(file instanceof File) || file.size === 0) {
      return new Response('Invalid CSV file! Please upload a file or use the default.', { status: 400 });
    }
    // 1048 kb max
    if (file.size > 1048576) {
      return new Response('Too many players provided! Max size of CSV is 1048 kb', { status: 400 });
    }
    csvText = await file.text();
  }

  const res = await initPlayers(ctx, csvText);
  if (res instanceof Response) {
    // error returned as Response
    return res;
  }
}

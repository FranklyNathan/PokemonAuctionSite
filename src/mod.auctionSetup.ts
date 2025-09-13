import { isValidNumber } from './mod.helpers';
import { createPlayersTable, insertPlayers } from './mod.storage';
import { Ctx, SECONDS } from './mod.config';
import Papa from 'papaparse';

export async function initPlayers(ctx: Ctx, data: string | any[]): Promise<Response | void> {
  let playerRows: any[];
  let headers: string[];

  if (typeof data === 'string') {
    const parseRes = Papa.parse(data, { header: true, skipEmptyLines: true, dynamicTyping: true });
    headers = parseRes.meta.fields || [];
    playerRows = parseRes.data as any[];
    if (!(headers.includes('name') && headers.includes('type'))) {
      return new Response("CSV file did not have 'name' and 'type' headers!", { status: 400 });
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
    console.log('[Debug] Attempting to insert processed player rows:', JSON.stringify(processedPlayerRows.slice(0, 2), null, 2)); // Log first 2 for brevity
    await createPlayersTable(ctx);
    await insertPlayers(ctx, processedPlayerRows);
  } catch (e) {
    console.error('Error during player initialization and database insertion:', e);
    return new Response('Failed to import players and create the auction!', { status: 500 });
  }
}

export async function setupAuction(ctx: Ctx, form: FormData): Promise<Response | undefined> {
  const playerSelectionTimeLimit = form.get('playerSelectionTimeLimit');
  const biddingTimeLimit = form.get('biddingTimeLimit');
  const totalPokemonAuctioned = form.get('totalPokemonAuctioned');
  if (
    !(
      typeof playerSelectionTimeLimit == 'string' &&
      isValidNumber(playerSelectionTimeLimit) &&
      typeof biddingTimeLimit == 'string' &&
      isValidNumber(biddingTimeLimit) &&
      typeof totalPokemonAuctioned == 'string' &&
      isValidNumber(totalPokemonAuctioned)
    )
  ) {
    return new Response('Got invalid values for one of the time limits or total Pokémon auctioned!', { status: 400 });
  }

  ctx.playerSelectionTimeLimit = +playerSelectionTimeLimit * SECONDS;
  ctx.biddingTimeLimit = +biddingTimeLimit * SECONDS;
  ctx.totalPokemonAuctioned = +totalPokemonAuctioned;

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

  const file = form.get('csvInput');
  if (!(file instanceof File)) {
    return new Response('Invalid CSV file!', { status: 400 });
  }
  // 1048 kb max
  if (file.size > 1048576) {
    return new Response('Too many players provided! Max size of CSV is 1048 kb', { status: 400 });
  }

  const csvText = await file.text();
  const res = await initPlayers(ctx, csvText);
  if (res instanceof Response) {
    // error returned as Response
    return res;
  }
}

import { isValidNumber } from './mod.helpers';
import { storePlayers } from './mod.storage';
import { Ctx, SECONDS } from './mod.config';
import Papa from 'papaparse';

export function initPlayers(ctx: Ctx, csvText: string) {
  const parseRes = Papa.parse(csvText, { header: true, skipEmptyLines: true, dynamicTyping: true });
  const headers = parseRes.meta.fields || [];
  const playerRows = parseRes.data as any[];

  if (!(headers.includes('name') && headers.includes('team') && headers.includes('position'))) {
    return new Response("CSV file did not have 'name', 'team', and/or 'position' headers!", { status: 400 });
  }
  // add draft data columns if not provided
  if (!headers.includes('player_id')) headers.push('player_id');
  if (!headers.includes('cost')) headers.push('cost');
  if (!headers.includes('drafted_by_id')) headers.push('drafted_by_id');
  if (!headers.includes('keeper')) headers.push('keeper');

  playerRows.forEach((row, idx) => {
    row.player_id = idx;
    row.drafted_by_id = row.drafted_by_id - 1; // convert to zero based index
    // if the ID matches one of the teams, add the player to their roster
    if (typeof row.drafted_by_id == 'number' && Object.keys(ctx.clientMap).includes(row.drafted_by_id.toString())) {
      if (typeof row.cost != 'number') row.cost = null;
      row.keeper = true;
    } else {
      row.drafted_by_id = null;
      row.cost = null;
      row.keeper = false;
    }
  });

  try {
    storePlayers(ctx.sql, playerRows);
  } catch (e) {
    console.error(e);
    return new Response('Failed to import players and create the auction!', { status: 500 });
  }
}

export async function setupAuction(ctx: Ctx, form: FormData): Promise<Response | undefined> {
  const playerSelectionTimeLimit = form.get('playerSelectionTimeLimit');
  const biddingTimeLimit = form.get('biddingTimeLimit');
  const maxRosterSize = form.get('maxRosterSize');
  if (
    !(
      typeof playerSelectionTimeLimit == 'string' &&
      isValidNumber(playerSelectionTimeLimit) &&
      typeof biddingTimeLimit == 'string' &&
      isValidNumber(biddingTimeLimit) &&
      typeof maxRosterSize == 'string' &&
      isValidNumber(maxRosterSize)
    )
  ) {
    return new Response('Got invalid values for the Player Selection Time Limit, Bidding Time Limit, or both!', { status: 400 });
  }

  ctx.playerSelectionTimeLimit = +playerSelectionTimeLimit * SECONDS;
  ctx.biddingTimeLimit = +biddingTimeLimit * SECONDS;
  ctx.maxRosterSize = +maxRosterSize;

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
  const res = initPlayers(ctx, csvText);
  if (res instanceof Response) {
    // error returned as Response
    return res;
  }
}

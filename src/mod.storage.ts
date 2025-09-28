import { ClientId, Ctx } from './mod.config';

export async function createPlayersTable(ctx: Ctx) {
  await ctx.sql.exec('DROP TABLE IF EXISTS players;');
  await ctx.sql.exec(`
    CREATE TABLE players(
      player_id INTEGER PRIMARY KEY,
      player_data JSON
    );
  `);
}

export async function insertPlayers(ctx: Ctx, players: any[]) {
  if (!players || players.length === 0) {
    return;
  }

  // Revert to a simpler, one-by-one insert. This is less efficient for huge
  // datasets, but is far more reliable and avoids issues with parameter binding
  // limits and SQL syntax interpretation in the Durable Object environment.
  for (const player of players) {
    try {
      // The incoming `player` object is already correctly structured.
      const playerDataString = JSON.stringify(player.player_data).replace(/'/g, "''");

      // The diagnostic step proved that parameterized queries fail with this driver for JSON strings,
      // but raw SQL with escaped quotes succeeds. We will use the working method.
      const rawSql = `INSERT INTO players (player_id, player_data) VALUES (${player.player_id}, '${playerDataString}')`;
      
      await ctx.sql.exec(rawSql);
    } catch (e) {
      console.error('[DATABASE_INSERT_ERROR] A single player insert failed. See details below.');
      console.error('Error Object:', e);
      console.error('Player Data that Failed:', JSON.stringify(player, null, 2));
      throw new Error('Database insertion failed for a player.'); // Re-throw a more specific error.
    }
  }
}

export function getUndraftedCount(ctx: Ctx) {
  return ctx.sql.exec("SELECT COUNT(*) as count FROM players WHERE JSON_EXTRACT(player_data, '$.drafted_by_id') IS NULL").one()
    .count as number;
}

// returns a mapping from client IDs to the count of players on the clients team
export function getRosterCounts(ctx: Ctx): { [id: string]: number } {
  return Object.fromEntries(
    ctx.sql
      .exec(
        `select
          JSON_EXTRACT(player_data, '$.drafted_by_id') as client_id,
          count(*) as count
        from players
        where JSON_EXTRACT(player_data, '$.drafted_by_id') is not null
        group by JSON_EXTRACT(player_data, '$.drafted_by_id');`,
      )
      .toArray()
      .map((row) => [row.client_id?.toString(), row.count?.valueOf()]),
  );
}

export function getTeamRosterCount(ctx: Ctx, clientId: ClientId): number {
  return ctx.sql
    .exec(`select count(*) as count from players where JSON_EXTRACT(player_data, '$.drafted_by_id') = ${clientId}`)
    .one()
    .count?.valueOf() as number;
}

export function getTeamRoster(ctx: Ctx, clientId: ClientId): any[] {
  const results = ctx.sql
    .exec(`SELECT player_data FROM players WHERE JSON_EXTRACT(player_data, '$.drafted_by_id') = ${clientId}`)
    .toArray();

  if (results.length > 0) {
    // The player_data is a JSON string, so we need to parse it.
    return results.map((row) => {
      return JSON.parse(row.player_data as string);
    });
  }
  return [];
}

export function getPlayerDraftedById(ctx: Ctx, playerId: number): Array<number | null> {
  return ctx.sql
    .exec(`SELECT JSON_EXTRACT(player_data, '$.drafted_by_id') as drafted_by_id FROM players WHERE player_id = ${playerId}`)
    .toArray()
    .map((row) => row.drafted_by_id?.valueOf() as number);
}

export function getPlayerById(ctx: Ctx, playerId: number): any | null {
  const result = ctx.sql.exec(`SELECT player_data FROM players WHERE player_id = ${playerId}`).one();
  if (result && result.player_data) {
    return JSON.parse(result.player_data as string);
  }
  return null;
}

export function getRandomUndraftedPlayer(ctx: Ctx): { player_id: number } | null {
  const result = ctx.sql
    .exec(
      `SELECT player_id FROM players
        WHERE JSON_EXTRACT(player_data, '$.drafted_by_id') IS NULL
        AND JSON_EXTRACT(player_data, '$.stage') = 'base'
        ORDER BY RANDOM() LIMIT 1`,
    )
    .toArray();
  if (result.length > 0) {
    const player = result[0];
    return {
      player_id: player.player_id as number,
    };
  }
  return null;
}

export function getPlayersJsonString(ctx: Ctx) {
  // This query constructs a JSON array string. The previous json_group_array approach was
  // too resource-intensive. GROUP_CONCAT is more reliable in this environment.
  // We construct a JSON object for each player and then concatenate them into a single string.
  return ctx.sql.exec(`
    SELECT '[' || GROUP_CONCAT(json_object('player_id', player_id, 'player_data', json(player_data))) || ']' as players
    FROM players
  `).one().players?.toString();
}

export function getResultsJsonString(ctx: Ctx) {
  const players = ctx.sql
    .exec(
      // build a JSON array string as the single row of the results
      `SELECT
        json_extract(player_data, '$.name') as name,
        json_extract(player_data, '$.type') as type,
        json_extract(player_data, '$.drafted_by_id') as drafted_by_id,
        json_extract(player_data, '$.cost') as cost,
        json_extract(player_data, '$.keeper') as keeper
      FROM players
      WHERE json_extract(player_data, '$.drafted_by_id') IS NOT NULL
      ORDER BY player_id;`,
    )
    .toArray()
    .map((row) => {
      // add the team name using the drafted_by_id
      if (typeof row.drafted_by_id == 'number') {
        row.pickedBy = ctx.clientMap?.[row.drafted_by_id]?.teamName ?? '';
      }
      // convert sqlite's representation of booleans as 1 or 0 to actual booleans
      row.keeper = row.keeper == 1;
      return Object(row);
    });

  return JSON.stringify(players);
}

export function setDraft(ctx: Ctx) {
  ctx.sql
    .exec(
      `UPDATE players
    SET player_data = JSON_PATCH(
      player_data,
      JSON_OBJECT('drafted_by_id', ${ctx.highestBidder}, 'cost', ${ctx.currentBid})
    )
    WHERE player_id = ${ctx.selectedPlayerId}
    ;`,
    );
}

import { ClientId, Ctx } from './mod.config';

export function storePlayers(sql: SqlStorage, players: any[]) {
  sql.exec(`
    CREATE TABLE player(
      player_id INTEGER PRIMARY KEY,
      player_data JSON
    );
  `);
  // inner map replaces `null` values with the string "null", otherwise string interpolation puts empty string
  let vals = players.map((p) => `(${p.player_id}, '${JSON.stringify(p)}')`).join(',');
  let insert = 'INSERT INTO player (player_id, player_data) VALUES ' + vals;
  sql.exec(insert);
}

export function getUndraftedCount(ctx: Ctx) {
  return ctx.sql.exec("SELECT COUNT(*) as count FROM player WHERE JSON_EXTRACT(player_data, '$.drafted_by_id') IS NULL").one()
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
        from player
        where JSON_EXTRACT(player_data, '$.drafted_by_id') is not null
        group by JSON_EXTRACT(player_data, '$.drafted_by_id');`,
      )
      .toArray()
      .map((row) => [row.client_id?.toString(), row.count?.valueOf()]),
  );
}

export function getTeamRosterCount(ctx: Ctx, clientId: ClientId): number {
  return ctx.sql
    .exec(`select count(*) as count from player where JSON_EXTRACT(player_data, '$.drafted_by_id') = ${clientId}`)
    .one()
    .count?.valueOf() as number;
}

export function getPlayerDraftedById(ctx: Ctx, playerId: number): Array<number | null> {
  return ctx.sql
    .exec(`SELECT JSON_EXTRACT(player_data, '$.drafted_by_id') as drafted_by_id FROM player WHERE player_id = ${playerId}`)
    .toArray()
    .map((row) => row.drafted_by_id?.valueOf() as number);
}

export function getRandomUndraftedPlayer(ctx: Ctx): { player_id: number } | null {
  const result = ctx.sql
    .exec("SELECT player_id FROM player WHERE JSON_EXTRACT(player_data, '$.drafted_by_id') IS NULL ORDER BY RANDOM() LIMIT 1")
    .one();
  if (result) {
    return {
      player_id: result.player_id as number,
    };
  }
  return null;
}

export function getPlayersJsonString(ctx: Ctx) {
  return ctx.sql.exec("SELECT '[' || GROUP_CONCAT(player_data) || ']' as players FROM player").one().players?.toString();
}

export function getResultsJsonString(ctx: Ctx) {
  const players = ctx.sql
    .exec(
      // build a JSON array string as the single row of the results
      `SELECT
        json_extract(player_data, '$.name') as name,
        json_extract(player_data, '$.team') as team,
        json_extract(player_data, '$.position') as position,
        json_extract(player_data, '$.drafted_by_id') as drafted_by_id,
        json_extract(player_data, '$.cost') as cost,
        json_extract(player_data, '$.keeper') as keeper
      FROM player
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
  ctx.sql.exec(
    `UPDATE player
    SET player_data = JSON_PATCH(
      player_data,
      JSON_OBJECT('drafted_by_id', ${ctx.highestBidder}, 'cost', ${ctx.currentBid})
    )
    WHERE player_id = ${ctx.selectedPlayerId}
    ;`,
  );
}

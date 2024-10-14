import os
from time import sleep
import re
import webbrowser
import xml.etree.ElementTree as ET
import httpx

client_id = os.environ.get('YAHOO_OAUTH_CLIENT_ID')
client_secret = os.environ.get('YAHOO_OAUTH_CLIENT_SECRET')

if not (client_id and client_secret):
    raise EnvironmentError('Failed to get either the `YAHOO_OAUTH_CLIENT_ID` or `YAHOO_OAUTH_CLIENT_SECRET`')

year = 2024
league_id = 'nhl.l.60602'
token_endpoint = 'https://api.login.yahoo.com/oauth2/get_token'
authorization_endpoint = f'https://api.login.yahoo.com/oauth2/request_auth?client_id={client_id}&redirect_uri=oob&response_type=code&language=en-us'
players_endpoint = lambda start: f'https://fantasysports.yahooapis.com/fantasy/v2/league/{league_id}/players;sort=OR;sdir=1;status=ALL;pos=P;count=25;start={start}/stats;type=season;season={year}'
settings_endpoint = f'https://fantasysports.yahooapis.com/fantasy/v2/league/{league_id}/settings'
auth = httpx.BasicAuth(username=client_id, password=client_secret)

# get auth token
authres = httpx.get(authorization_endpoint)
webbrowser.open(authres.headers.get('location'))
code = input('Input code from browser: ')
params = httpx.QueryParams({
    'redirect_uri': 'oob',
    'code': code,
    'grant_type': 'authorization_code'
})
token = httpx.post(
    token_endpoint,
    auth=auth,
    data=params
).json()

settings_res = httpx.get(settings_endpoint, headers={'Authorization': f'Bearer {token["access_token"]}'})
settings_res.raise_for_status()

def safe_find(el: ET.Element, path: str, xmlns: dict) -> str:
    found = el.find(path, xmlns)
    if found is None:
        return ''
    return found.text or ''

xmlns = { 'x': 'http://fantasysports.yahooapis.com/fantasy/v2/base.rng' }
settings_root = ET.fromstring(settings_res.text)
stat_map: dict[str, str] = {}
for stat in settings_root.findall('x:league/x:settings/x:stat_categories/x:stats/x:stat', xmlns):
    stat_map[safe_find(stat, 'x:name', xmlns)] = safe_find(stat, 'x:stat_id', xmlns)

STAT_PATHS = [
    'x:name/x:full',
    'x:editorial_team_full_name',
    'x:display_position',
]

# fetch players
def parse_players(xml):
    root = ET.fromstring(xml)

    players = []

    for player in root.findall('x:league/x:players/x:player', xmlns):
        player_row = []

        # first add stats with specific paths
        for path in STAT_PATHS:
            player_row.append(safe_find(player, path, xmlns))

        # then add stats with generic stat_ids (dict.values() is in insertion order, so matches header order)
        for stat_id in stat_map.values():
            val = safe_find(player, f"x:player_stats/x:stats/x:stat/x:stat_id[.='{stat_id}']/../x:value", xmlns)
            if ',' in val:
                val = '"' + val + '"'
            elif val == '-':
                val = ''
            player_row.append(val)

        players.append(','.join(player_row))
    return players

header = "name,team,position,"
# convert to snake_case when adding the header
other_stats = [stat_name.lower().replace(' ', '_') for stat_name in stat_map.keys()]
header += ','.join(other_stats)
# first line is the header
players = [header]
try:
    start = 0
    while True:
        res = httpx.get(players_endpoint(start), headers={'Authorization': f'Bearer {token["access_token"]}'})
        res.raise_for_status()

        new_players = parse_players(res.text)
        if not new_players:
            break
        players.extend(new_players)
        start += 25
        sleep(1)
except Exception as e:
    print(e)

with open('out.csv', 'w') as f:
    f.write('\n'.join(players))

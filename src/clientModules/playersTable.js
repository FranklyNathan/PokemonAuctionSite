import { getBooleanFilterButtons, toast } from './html.js';
import { playerSelected } from './clientActions.js';

function isValidNumber(s) {
  return !isNaN(+s) && !isNaN(parseFloat(s));
}

async function getPlayersJson(type) {
  // Construct a URL relative to the auction's base path.
  const url = new URL(window.location.href);
  url.pathname = `/${url.pathname.split('/')[1]}/${type}`;
  const req = new Request(url.toString());
  return await window
    .fetch(req)
    .then((response) => {
      if (!response.ok) {
        response.text().then((text) => {
          const msg = `Failed to fetch players data due to ${text}`;
          return Promise.reject(msg);
        });
      } else {
        return response.json();
      }
    })
    .catch((e) => {
      console.error(e);
    });
}

/////////////////
// table filters
/////////////////
class BooleanFilter {
  filterEl;
  eGui; //!: HTMLDivElement;
  filterActive; //!: boolean;
  filterChangedCallback; //!: (additionalEventAttributes?: any) => void;
  dataField; //!: string; // the data field that is being filtered

  // params: IFilterParams
  init(params) {
    this.eGui = document.createElement('div');
    this.eGui.style = 'padding: 0.5rem';
    this.eGui.innerHTML = getBooleanFilterButtons(params.trueName, params.falseName, params.defaultVal);
    this.filterEl = this.eGui.querySelector('sl-radio-group');
    this.filterActive = params.defaultVal == undefined ? false : true;
    this.filterEl.addEventListener('sl-change', this.onFilterChange.bind(this));
    this.filterChangedCallback = params.filterChangedCallback;
    this.dataField = params.colDef.field;
    if (params.defaultVal != undefined) {
      this.onFilterChange();
    }
  }

  onFilterChange() {
    if (this.filterEl.value == 'all') {
      this.filterActive = false;
    } else {
      this.filterActive = true;
    }
    this.filterChangedCallback();
  }

  // Not required by spec, custom method to handle the custom floating filter component.
  // Since the UI is the same for the floating filter, just update this component
  //   to match the floating filter and call onFilterChange to filter the data.
  onFloatingFilterChanged(value) {
    this.filterEl.value = value || 'all';
    this.onFilterChange();
  }

  getGui() {
    return this.eGui;
  }

  // params: IDoesFilterPassParams
  doesFilterPass(params) {
    switch (this.filterEl.value) {
      case 'all':
        return true;
      case 'true':
        return params.data[this.dataField];
      case 'false':
        return !params.data[this.dataField];
    }
  }

  isFilterActive() {
    return this.filterActive;
  }

  // This is called by the floating filter component when the this filter
  //   changes. All we need to do is return the state of the filter so the
  //   floating filter can update its UI to show the same state.
  getModel() {
    return this.filterEl.value;
  }

  setModel() {}
}

// create a custom floating filter for a boolean column (how is this not provided already??)
class BooleanFloatingFilterComponent {
  // implements IFloatingFilterComp
  eGui; // !: HTMLDivElement;
  eFilterInput; // !: HTMLInputElement;

  // params: IFloatingFilterParams & CustomParams
  init(params) {
    this.eGui = document.createElement('div');
    this.eGui.innerHTML = getBooleanFilterButtons(params.trueName, params.falseName, params.defaultVal);
    this.eFilterEl = this.eGui.querySelector('sl-radio-group');
    this.eFilterEl.addEventListener('sl-change', () => {
      // when the floating filter changes pass the new value to the
      //   parent filter, which already has logic to handle the values.
      const value = this.eFilterEl.value;
      params.parentFilterInstance((instance) => {
        instance.onFloatingFilterChanged(value);
      });
      return;
    });
    if (params.defaultVal != undefined) {
      params.parentFilterInstance((instance) => {
        instance.onFloatingFilterChanged(params.defaultVal);
      });
    }
  }

  // Gets called every time the parent filter changes. Your floating
  // filter would typically refresh its UI to reflect the new filter
  // state. The provided parentModel is what the parent filter returns
  // from its getModel() method. The event is the FilterChangedEvent
  // that the grid fires.
  onParentModelChanged(parentModelValue) {
    this.eFilterEl.value = parentModelValue || 'all';
  }

  getGui() {
    return this.eGui;
  }
}

const cols = [
  {
    field: 'name',
    headerName: 'Name',
    minWidth: 200,
    filter: 'agTextColumnFilter',
    floatingFilter: true,
    pinned: 'left',
    cellRenderer: (params) => {
      if (!params.value) {
        return '';
      }
      const pokemonName = params.value;
      const iconName = pokemonName.toLowerCase();
      const iconPath = `/MiniIcons/${iconName}.png`;
      return `
        <span style="display: flex; align-items: center; height: 100%;">
          <div style="width: 32px; display: flex; justify-content: center; align-items: center; margin-right: 8px; flex-shrink: 0;">
            <img src="${iconPath}" alt="${pokemonName}" title="${pokemonName}" style="max-height: 24px; max-width: 24px;">
          </div>
          <span>${pokemonName}</span>
        </span>
      `;
    },
  },
  {
    field: 'type',
    headerName: 'Type',
    minWidth: 200,
    filter: 'agTextColumnFilter',
    floatingFilter: true,
    cellRenderer: (params) => {
      if (!params.value) {
        return '';
      }
      const types = params.value.split('/');
      const iconsHtml = types
        .map((type) => {
          const trimmedType = type.trim();
          // Construct the path to the icon in your assets folder
          const iconPath = `/TypeIcons/${trimmedType}IC_SV.png`;
          // Log the path to the browser's developer console to help debug 404s
          console.log('Requesting type icon from:', iconPath);
          // Return an img tag for each type
          return `<img src="${iconPath}" alt="${trimmedType}" title="${trimmedType}" style="height: 16px; vertical-align: middle;">`;
        })
        .join(' ');
      return iconsHtml;
    },
  },
  {
    field: 'pickedBy',
    headerName: 'Drafted By',
    minWidth: 200,
    filter: 'agTextColumnFilter',
    floatingFilter: true,
  },
  {
    field: 'cost',
    headerName: 'Cost',
    minWidth: 100,
    valueFormatter: (params) => (params.value ? '$' + params.value : ''),
    filter: 'agNumberColumnFilter',
    floatingFilter: true,
  },
];

/////////////////////////////
// pre-results specific functions
/////////////////////////////

export function createPlayersTable(playersTableWrapperEl, ctx, playerFields) {
  const tableCols = [...cols]; // Create a local copy to avoid modifying the global `cols` array.
  // add any custom columns to the table
  const currentFields = new Set(tableCols.map((c) => c.field));
  currentFields.add('player_id').add('keeper').add('stage').add('evolution_method').add('drafted_by_id'); // don't add these to the table
  // find the extra stats fields that were added and save them to the Ctx
  ctx.extraPlayerStatsFields = playerFields.filter((fieldId) => !currentFields.has(fieldId));
  // add extra stats fields to the table
  ctx.extraPlayerStatsFields.forEach((fieldId) => {
    tableCols.push({
      field: fieldId,
      headerName: fieldId
        .replace(/^[-_]*(.)/, (_, c) => c.toUpperCase()) // Initial char (after -/_)
        .replace(/[-_]+(.)/g, (_, c) => ' ' + c.toUpperCase()), // First char after each -/_
      minWidth: 100,
      filter: true, // let ag-grid figure out the filter types
      floatingFilter: true,
    });
  });

  const playerTableOptions = {
    rowData: ctx?.playersTableData || [],
    columnDefs: tableCols,
    rowSelection: 'single',
    floatingFiltersHeight: 40,
    getRowId: (params) => params.data.type + params.data.name,
    autoSizeStrategy: {
      type: 'fitGridWidth',
    },
  };
  const playersTable = agGrid.createGrid(playersTableWrapperEl, playerTableOptions);
  return playersTable;
}

export async function loadPlayersData(ctx) {
  const playerRows = await getPlayersJson('players-data');

  const playersTableWrapperEl = document.getElementById('players-table-wrapper');
  if (!playerRows || playerRows.length === 0) {
    toast('Warning', 'No players were found for this auction. The player list will be empty.', 'warning');
    console.warn('No players were loaded for this auction.');
    ctx.playersTableData = [];
    // Create an empty table
    ctx.playersTable = createPlayersTable(playersTableWrapperEl, ctx, []);
    return;
  }

  // The server sends each player's data as a nested JSON string within the 'player_data' field.
  // We need to parse this string and merge its contents into the top-level player object.
  const processedPlayerRows = playerRows.map(row => {
    // The server now sends a clean structure where `row.player_data` contains the player's attributes.
    // We just need to merge that with the top-level `player_id`.
    const innerData = typeof row.player_data === 'string' ? JSON.parse(row.player_data) : row.player_data;
    return { ...innerData, player_id: row.player_id };
  });

  // Update the player rows with application-specific data
  processedPlayerRows.forEach((row, idx) => {
    let draftedById = row.drafted_by_id;
    let draftedByName = undefined;
    let cost = undefined;
    // if the ID matches one of the teams, add the player to their roster
    if (typeof draftedById == 'number' && Object.keys(ctx.teams).includes(draftedById.toString())) {
      draftedByName = ctx.teams?.[draftedById]?.teamName;
      if (isValidNumber(row.cost)) {
        cost = +row.cost;
      }
      // record this player as drafted by the team. we use the length of the `drafted`
      //   array to get the teams roster size and compare to max roster size.
      ctx.teams?.[draftedById]?.drafted?.push({ playerId: idx, cost: cost || 0 });
    }

    let newPlayer = {
      // The player_id from the database is the source of truth.
      playerId: row.player_id,
      name: row.name,
      type: row.type,
      // Use null for drafted_by_id if it's not a valid number.
      pickedBy: draftedByName,
      cost: cost,
      keeper: row.keeper || draftedById != null,
    };
    // Overwrite existing keys with the above values we just set. This preserves any
    //   other bonus data the auction creator passed in (other fields like `goals`, etc)
    Object.assign(row, newPlayer);
  });

  // Create a map for fast lookups by the persistent `player_id`.
  // This map contains ALL players, including evolutions.
  ctx.playerMap = new Map(processedPlayerRows.map(p => [p.player_id, p]));

  // Create a pristine, unsorted copy for evolution lookups.
  ctx.allPlayersUnsorted = processedPlayerRows;

  // For the visible table, only show auctionable (base) Pokémon.
  const basePokemon = processedPlayerRows.filter(p => p.stage === 'base');
  ctx.playersTableData = basePokemon;

  // create the players table
  const playerFields = basePokemon.length > 0 ? Object.keys(basePokemon[0]) : [];
  ctx.playersTable = createPlayersTable(playersTableWrapperEl, ctx, playerFields);
}

/////////////////////////////
// results specific functions
/////////////////////////////

function createResultsTable(playersTableWrapperEl, playersData) {
  // we are in the post auction, add column indicating drafted or keeper
  cols.push({
    field: 'keeper',
    headerName: 'Keeper',
    cellDataType: 'boolean',
    minWidth: 100,
    filter: BooleanFilter,
    filterParams: { trueName: 'Kept', falseName: 'Drafted', defaultVal: 'false' },
    suppressHeaderMenuButton: true,
    floatingFilter: true,
    floatingFilterComponent: BooleanFloatingFilterComponent,
    floatingFilterComponentParams: { trueName: 'Kept', falseName: 'Drafted', defaultVal: 'false' },
    suppressFloatingFilterButton: true,
    suppressHeaderFilterButton: true,
  });

  const playerTableOptions = {
    rowData: playersData,
    columnDefs: cols,
    rowSelection: 'single',
    floatingFiltersHeight: 40,
    getRowId: (params) => params.data.type + params.data.name,
    autoSizeStrategy: {
      type: 'fitGridWidth',
    },
  };
  const playersTable = agGrid.createGrid(playersTableWrapperEl, playerTableOptions);
  return playersTable;
}

export async function loadResultsData() {
  // download players file from r2
  const playerRows = await getPlayersJson('results-data');
  if (playerRows == undefined) {
    console.warn('Failed to load results data!');
    return;
  }

  // create the players table
  const playersTableWrapperEl = document.getElementById('players-table-wrapper');
  createResultsTable(playersTableWrapperEl, playerRows);

  // return CSV for downloading
  return Papa.unparse(
    // JSON parse / stringify to make a copy
    JSON.parse(JSON.stringify(playerRows)).map((row) => {
      // update the column header casing so its consistent snake case
      row.picked_by = row?.pickedBy;
      delete row.pickedBy;
      delete row.drafted_by_id; // no need for end users to see IDs
      return row;
    }),
  );
}

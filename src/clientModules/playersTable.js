import { getBooleanFilterButtons, toast } from './html.js';
import { playerSelected } from './clientActions.js';

function isValidNumber(s) {
  return !isNaN(+s) && !isNaN(parseFloat(s));
}

async function getPlayersJson(type) {
  const uri = window.location.origin + '/' + window.location.pathname.split('/')[1] + '/' + type;
  const req = new Request(uri);
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
  },
  {
    field: 'team',
    headerName: 'Team',
    minWidth: 200,
    filter: 'agTextColumnFilter',
    floatingFilter: true,
  },
  {
    field: 'position',
    headerName: 'Position',
    minWidth: 100,
    filter: 'agTextColumnFilter',
    floatingFilter: true,
  },
  {
    field: 'pickedBy',
    headerName: 'Picked By',
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

function createPlayersTable(playersTableWrapperEl, ctx, playerFields) {
  // show the drafted and starred cols
  cols.splice(4, 0, {
    field: 'drafted',
    headerName: 'Drafted',
    cellDataType: 'boolean',
    minWidth: 100,
    filter: BooleanFilter,
    filterParams: { trueName: 'Drafted', falseName: 'Available' },
    suppressHeaderMenuButton: true,
    floatingFilter: true,
    floatingFilterComponent: BooleanFloatingFilterComponent,
    floatingFilterComponentParams: { trueName: 'Drafted', falseName: 'Available' },
    suppressFloatingFilterButton: true,
    suppressHeaderFilterButton: true,
  });
  cols.push({
    field: 'starred',
    headerName: 'Starred',
    cellDataType: 'boolean',
    cellClass: (params) => (params.value ? 'star-checked' : 'star-unchecked'),
    cellStyle: { 'text-align': 'center' }, // Center the star in the cell
    editable: false, // suppress the double click to show checkbox functionality
    // make it editable manually
    onCellClicked: (params) => {
      const newValue = !params.value;
      params.node.setDataValue(params.column.colId, newValue);
    },
    cellRenderer: (params) => '', // Empty string to override default renderer
    cellStyle: {
      'text-align': 'center',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      height: '100%',
      'font-size': '22px',
    },
    minWidth: 100,
    filter: BooleanFilter,
    filterParams: { trueName: 'Starred', falseName: 'Not Starred' },
    suppressHeaderMenuButton: true,
    floatingFilter: true,
    floatingFilterComponent: BooleanFloatingFilterComponent,
    floatingFilterComponentParams: { trueName: 'Starred', falseName: 'Not Starred' },
    suppressFloatingFilterButton: true,
    suppressHeaderFilterButton: true,
  });
  // add any custom columns to the table
  const currentFields = new Set(cols.map((c) => c.field));
  currentFields.add('playerId').add('keeper'); // don't add these to the table
  // find the extra stats fields that were added and save them to the Ctx
  ctx.extraPlayerStatsFields = playerFields.filter((fieldId) => !currentFields.has(fieldId));
  // add extra stats fields to the table
  ctx.extraPlayerStatsFields.forEach((fieldId) => {
    cols.push({
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
    columnDefs: cols,
    rowSelection: 'single',
    floatingFiltersHeight: 60,
    getRowId: (params) => params.data.team + params.data.name,
    onRowClicked: (e) => playerSelected(ctx, e.data),
    autoSizeStrategy: {
      type: 'fitGridWidth',
    },
  };
  const playersTable = agGrid.createGrid(playersTableWrapperEl, playerTableOptions);
  return playersTable;
}

export async function loadPlayersData(ctx) {
  const playerRows = await getPlayersJson('players-data');

  // update the player rows with application specific data
  playerRows.forEach((row, idx) => {
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

    // no need to keep this around anymore
    delete row.drafted_by_id;
    delete row.player_id;

    let newPlayer = {
      playerId: row.player_id || idx,
      name: row.name,
      team: row.team,
      position: row.position,
      drafted: draftedById != null,
      pickedBy: draftedByName,
      cost: cost,
      keeper: row.keeper || draftedById != null,
      starred: false, // add the "starred" data user's can edit in the data table
    };
    // Overwrite existing keys with the above values we just set. This preserves any
    //   other bonus data the auction creator passed in (other fields like `goals`, etc)
    Object.assign(row, newPlayer);
  });

  ctx.playersTableData = playerRows;

  // create the players table
  const playersTableWrapperEl = document.getElementById('players-table-wrapper');
  const playerFields = Object.keys(playerRows[0]);
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
    floatingFiltersHeight: 60,
    getRowId: (params) => params.data.team + params.data.name,
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

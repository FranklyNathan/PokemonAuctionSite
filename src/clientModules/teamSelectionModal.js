import { onMessage } from './onMessage.js';
import {
  getTeamLowerLeftContentClass,
  showTeamConnected,
  showTeamDisconnected,
  initReadyUp,
  getTeamSelectionButton,
  addMeIcon,
  showDisconnectedModal,
  hideDisconnectedModal,
  showNoTeamsDialog,
} from './html.js';

let reconnectAttempted = false;

function setupWebsocket(ctx, clientId, wsUrl, reconnectTimeoutId) {
  if (reconnectTimeoutId != null) {
    clearTimeout(reconnectTimeoutId);
  }
  const websocket = new WebSocket(wsUrl);
  websocket.addEventListener('open', () => {
    // hide the disconnected dialog in case it was open when connecting
    hideDisconnectedModal();
    showTeamConnected(ctx.teams[clientId]);
    // if we successfully reconnected, set reconnectAttempted back to false
    //   so the app will try to reconnect again if another error occurs.
    reconnectAttempted = false;
  });
  // handle messages from server
  websocket.addEventListener('message', (e) => onMessage(e, ctx));
  // try to reconnect on errors
  websocket.addEventListener('error', (e) => {
    // show disconnected modal after 1 second to let the reconnect attempt work
    const to = setTimeout(() => {
      showDisconnectedModal();
      showTeamDisconnected(ctx.teams[clientId]);
    }, 1000);
    if (!reconnectAttempted) {
      console.warn('Trying to reconnect...');
      reconnectAttempted = true;
      setupWebsocket(ctx, clientId, wsUrl, to);
    }
  });
  websocket.addEventListener('close', (e) => {
    // close handler is always called after the error handler, but we only
    //   want to show the disconnected modal if the error handler
    //   didn't already set it to show after a timeout
    if (!reconnectAttempted) {
      showDisconnectedModal();
      showTeamDisconnected(ctx.teams[clientId]);
    }
  });
  ctx.ws = websocket;
}

// This file populates the team selection modal and opens it. Run when client loads page.
function connect(clientId, ctx) {
  // connect websocket
  let wsUrl = window.location.host + window.location.pathname + '/websocket' + '/' + clientId;
  // localhost doesn't support secure ws connection
  if (window.location.host.includes('localhost')) {
    wsUrl = 'ws://' + wsUrl;
  } else {
    wsUrl = 'wss://' + wsUrl;
  }
  setupWebsocket(ctx, clientId, wsUrl);
}

export function initTeamSelection(ctx) {
  // In resource mode (or if no teams are configured for any other reason),
  // there are no teams to select, so we should not show the dialog.
  if (ctx.isResourceMode || Object.keys(ctx.teams).length === 0) {
    return;
  }

  const dialogContentEl = document.getElementById('dialogContent');
  const teamSelectionDialogEl = document.getElementById('teamSelectionDialog');

  // prevent user closing the dialog without selecting a team
  teamSelectionDialogEl.addEventListener('sl-request-close', (event) => {
    event.preventDefault();
  });

  // remove the close button from the header (user has to select a team to close the dialog)
  teamSelectionDialogEl.shadowRoot.querySelector('sl-icon-button[part="close-button"]')?.remove();

  // add all the teams the user can choose from
  Object.values(ctx.teams)
    .sort((a, b) => a.draftPosition - b.draftPosition) // sort by draft position
    .forEach((team) => {
      // add this team to the teams section in the header
      const [content, cls] = getTeamLowerLeftContentClass(team.connected, team.ready);
      const teamEl = Object.assign(document.createElement('participant-el'), {
        id: `team${team.clientId}`,
        style: 'flex-grow: 1; max-width: 20rem',
        innerHTML: `
          <span slot="top-left-action" id="team${team.clientId}tlac"></span>
          <span slot="top-right" id="team${team.clientId}trc" style="display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 2px; width: 90px;"></span>
          <span slot="lower-left-content" id="team${team.clientId}llc">${content}</span>
          <span slot="participant-name" id="team${team.clientId}name">${team.teamName}</span>
          <span slot="remaining-funds" id="team${team.clientId}RemainingFunds">$${team.remainingFunds}</span>
        `,
      });
      document.getElementById('teamsSection').insertAdjacentElement('beforeend', teamEl);
      // set the class (can only do this after the template has been created)
      teamEl.shadowRoot.getElementById('main-content').setAttribute('class', cls);

      // add the button element
      if (team?.connected) return; // don't allow new user to select a connected team
      dialogContentEl.insertAdjacentHTML('beforeend', getTeamSelectionButton(team.clientId, team.teamName));
      // when user clicks the button set that team as the client's team, and close the modal
      const teamButtonEl = document.getElementById(`team${team.clientId}Select`);
      teamButtonEl.addEventListener('click', () => {
        ctx.myClientId = team.clientId;
        teamSelectionDialogEl.hide();

        // add dot indicator to name
        addMeIcon(team);
        connect(team.clientId, ctx);

        if (ctx.stateId == 'pre_auction' && !team.ready) {
          initReadyUp(ctx);
        }
      });
    });

  // Add spectator option
  dialogContentEl.insertAdjacentHTML('beforeend', `
    <sl-button id="spectatorSelect" variant="neutral" size="large" style="width: 100%;">
      <strong>Join as Spectator</strong>
    </sl-button>
  `);
  
  // Handle spectator selection
  const spectatorButtonEl = document.getElementById('spectatorSelect');
  spectatorButtonEl.addEventListener('click', () => {
    ctx.myClientId = -1; // Use -1 to indicate spectator
    ctx.isSpectator = true;
    teamSelectionDialogEl.hide();
    
    // Connect as spectator
    let wsUrl = window.location.host + window.location.pathname + '/websocket/spectator';
    if (window.location.host.includes('localhost')) {
      wsUrl = 'ws://' + wsUrl;
    } else {
      wsUrl = 'wss://' + wsUrl;
    }
    setupWebsocket(ctx, -1, wsUrl);
    
    // Disable bidding buttons for spectators
    document.getElementById('raise100')?.setAttribute('disabled', 'true');
    document.getElementById('raise')?.setAttribute('disabled', 'true');
    document.getElementById('raise-input')?.setAttribute('disabled', 'true');
  });

  // check if all players are already connected
  let allTeamsConnected = Object.keys(ctx.teams).length > 0 && Object.values(ctx.teams).every((t) => t.connected);
  if (allTeamsConnected) {
    // Auto-connect as spectator if all teams are full
    ctx.myClientId = -1;
    ctx.isSpectator = true;
    
    let wsUrl = window.location.host + window.location.pathname + '/websocket/spectator';
    if (window.location.host.includes('localhost')) {
      wsUrl = 'ws://' + wsUrl;
    } else {
      wsUrl = 'wss://' + wsUrl;
    }
    setupWebsocket(ctx, -1, wsUrl);
    
    // Disable bidding buttons for spectators
    document.getElementById('raise100')?.setAttribute('disabled', 'true');
    document.getElementById('raise')?.setAttribute('disabled', 'true');
    document.getElementById('raise-input')?.setAttribute('disabled', 'true');
    
    return;
  }

  // show the team selection dialog
  teamSelectionDialogEl.show();
}

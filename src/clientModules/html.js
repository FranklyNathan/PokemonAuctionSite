export function toast(title, message, variant) {
  const icon = variant == 'success' ? 'info-circle' : 'exclamation-triangle';
  const alert = Object.assign(document.createElement('sl-alert'), {
    variant,
    closable: true,
    duration: 3000,
    innerHTML: `
      <sl-icon slot="icon" name="${icon}"></sl-icon>
      <strong id="toastTitle">${title}</strong><br />
      <div style="overflow-wrap: break-word" id="toastMessage">${message}</div>
    `,
  });
  document.body.append(alert);
  alert.toast();
}

export function showDisconnectedModal() {
  const disconnectedEl = document.getElementById('disconnectedDialog');
  disconnectedEl.show();
}

export function hideDisconnectedModal() {
  const disconnectedEl = document.getElementById('disconnectedDialog');
  disconnectedEl.hide();
}

export function showNoTeamsDialog() {
  const el = document.getElementById('noTeamsDialog');
  el.show();
}

export function addMeIcon(team) {
  document.getElementById(`team${team.clientId}name`).innerHTML = `
    <div style="vertical-align: text-top;">
      <div style="
        display: inline-block;
        width: 10px;
        height: 10px;
        border: 0.5px solid black;
        border-radius: 50%;
        background: var(--sl-color-sky-400);
        margin-right: 2px;
      "></div>${team.teamName}
    </div>
  `;
}

export function updateRemainingFunds(peer) {
  // the content of the slot isn't in the shadowRoot, it's in the main document.
  document.getElementById(`team${peer.clientId}RemainingFunds`).innerHTML = '$' + peer.remainingFunds;
}

export function getBooleanFilterButtons(trueName, falseName, defaultVal) {
  // this is used in two places, the filter and the floating filter
  const defaultValue = defaultVal == undefined ? 'all' : defaultVal;
  return `<sl-radio-group value="${defaultValue}" size="small">
    <sl-radio value="all">All</sl-radio>
    <sl-radio value="true">${trueName || 'True'}</sl-radio>
    <sl-radio value="false">${falseName || 'False'}</sl-radio>
  </sl-radio-group>`;
}

export function getTeamSelectionButton(clientId, teamName) {
  return `<sl-button id="team${clientId}Select" style="min-width: 8rem" value="${clientId}">${teamName}</sl-button>`;
}

/**
 * Gets the correct content for the lower left of the team card along with the classname
 *   that colors the card based on if the team is connected.
 */
export function getTeamLowerLeftContentClass(connected, ready) {
  if (connected) {
    // update the team's visuals to indicate connected
    if (ready) {
      return ['', 'ready'];
    } else {
      return ['<sl-tooltip content="Waiting to Ready Up" hoist style="--sl-tooltip-arrow-size: 0"> W </sl-tooltip>', 'waiting'];
    }
  } else {
    return ['<sl-tooltip content="Disconnected" hoist style="--sl-tooltip-arrow-size: 0"> D </sl-tooltip>', 'disconnected'];
  }
}

export function showTeamConnected(team) {
  const shadow = document.getElementById(`team${team.clientId}`).shadowRoot;

  const [content2, cls2] = getTeamLowerLeftContentClass(true, team.ready || false);

  document.getElementById(`team${team.clientId}llc`).innerHTML = content2;
  shadow.getElementById('main-content').setAttribute('class', cls2);
}

export function showTeamDisconnected(team) {
  const shadow = document.getElementById(`team${team.clientId}`).shadowRoot;

  const [content2, cls2] = getTeamLowerLeftContentClass(false, false);

  document.getElementById(`team${team.clientId}llc`).innerHTML = content2;
  shadow.getElementById('main-content').setAttribute('class', cls2);
}

export function updateTeamConnected(team) {
  const shadow = document.getElementById(`team${team.clientId}`).shadowRoot;
  // get the content and classname for this team's connected state
  const [content, cls] = getTeamLowerLeftContentClass(team.connected, team.ready);
  // update team card
  document.getElementById(`team${team.clientId}llc`).innerHTML = content;
  shadow.getElementById('main-content').setAttribute('class', cls);
}

export function updateCurrentBid(ctx) {
  document.getElementById('current-bid').innerHTML = `$${ctx.currentBid}`;
}

export function jiggleCurrentBid() {
  document.getElementById('current-bid-animation').play = true;
}

export function updateHighestBidder(ctx) {
  const name = ctx.teams[ctx.highestBidder].teamName;
  document.getElementById('highest-bidder').innerHTML = name;
}

export function clearHighestBidder() {
  document.getElementById('current-bid').innerHTML = '';
  document.getElementById('highest-bidder').innerHTML = '';
}

export function addDraftLog(teamName, cost, playerName) {
  const log = document.getElementById('draft-log');
  log.insertAdjacentHTML(
    'afterBegin',
    `<div class="draft-item new-draft" style="display: flex; font-family: inherit; padding: 0 0.4rem">
      <span style="display: inline-block; flex: 3; font-family: inherit">${teamName}</span>
      <span style="display: inline-block; flex: 1; font-family: inherit">$${cost}</span>
      <span style="display: inline-block; flex: 4; font-family: inherit">${playerName}</span>
    </div>`,
  );
  // remove the `new-draft` class (green background) so the color fades out
  setTimeout(() => log.firstChild.classList.remove('new-draft'), 100);
}

export function updateSelectedPlayerCard(playerData, extraFields) {
  document.getElementById('waiting-msg').innerHTML = '';
  const card = document.getElementById('player');
  card.removeAttribute('hidden');
  let cardInner = `
    <div slot="header" style="display: flex; justify-content: space-between; overflow: hidden;">
      <strong>${playerData.name}</strong>
      <span style="min-width: 4rem"></span>
      <strong>${playerData.position}</strong>
    </div>
    <div style="display: grid; grid-template-columns: 2fr 3fr; grid-template-rows: 1fr 1fr; gap: 0.5rem;  font-family: 'Nimbus Mono PS', 'Courier New', monospace">
      <div style="padding: 0.2rem; display: flex; justify-content: flex-end; text-align: end; font-family: inherit">Team</div>
      <div style="padding: 0.2rem; background-color: var(--sl-color-neutral-300); font-family: inherit">${playerData.team}</div>
  `;
  // filter to just the fields that have data
  const fieldsFilter = extraFields.filter((f) => playerData[f] != undefined && playerData[f] != '');
  // only show first 10 fields
  for (const field of fieldsFilter.slice(0, 10)) {
    const colHeader = field
      .replace(/^[-_]*(.)/, (_, c) => c.toUpperCase()) // Initial char (after -/_)
      .replace(/[-_]+(.)/g, (_, c) => ' ' + c.toUpperCase()); // First char after each -/_
    cardInner += `<div style="padding: 0.2rem; display: flex; justify-content: flex-end; text-align: end; font-family: inherit">${colHeader}</div>
    <div style="padding: 0.2rem; background-color: var(--sl-color-neutral-300); font-family: inherit">${playerData[field]}</div>
    `;
  }
  card.innerHTML = cardInner + '</div>';
}

export function hideSelectedPlayerCard(teamName) {
  document.getElementById('player').setAttribute('hidden', 'true');
  if (typeof teamName == 'string') {
    document.getElementById('waiting-msg').innerHTML = `Waiting for <u>${teamName}</u> to make a bid`;
  }
}

export function disableRaiseButtons() {
  document.getElementById('raise1').setAttribute('disabled', '1');
  document.getElementById('raise2').setAttribute('disabled', '1');
  document.getElementById('raise5').setAttribute('disabled', '1');
  document.getElementById('raise10').setAttribute('disabled', '1');
  document.getElementById('raise').setAttribute('disabled', '1');
  document.getElementById('raise1').classList.remove('hover');
  document.getElementById('raise2').classList.remove('hover');
  document.getElementById('raise5').classList.remove('hover');
  document.getElementById('raise10').classList.remove('hover');
  document.getElementById('raise').classList.remove('hover');
}

export function enableRaiseButtons() {
  document.getElementById('raise1').removeAttribute('disabled');
  document.getElementById('raise2').removeAttribute('disabled');
  document.getElementById('raise5').removeAttribute('disabled');
  document.getElementById('raise10').removeAttribute('disabled');
  document.getElementById('raise').removeAttribute('disabled');
  document.getElementById('raise1').classList.add('hover');
  document.getElementById('raise2').classList.add('hover');
  document.getElementById('raise5').classList.add('hover');
  document.getElementById('raise10').classList.add('hover');
  document.getElementById('raise').classList.add('hover');
}

export function updateCurrentlySelectingTeam(ctx, previouslySelectingTeam) {
  if (ctx.currentlySelectingTeam != previouslySelectingTeam) {
    // rotate the currently selecting team's card to the start of the teams section.
    // get a static array of teams to iterate over (childNodes returns a "live" NodeList)
    const teams = Array.from(document.getElementById('teamsSection').childNodes);
    for (const team of teams) {
      // if the front team is the currently selecting team, we are done
      if (+team?.id?.replace('team', '') == ctx.currentlySelectingTeam) break;
      // move the front team to the back
      team.remove();
      document.getElementById('teamsSection').insertAdjacentElement('beforeEnd', team);
    }
  }

  // add an indicator that this team is selecting
  document.getElementById(`team${ctx.currentlySelectingTeam}`).shadowRoot.getElementById('top-right').innerHTML =
    '<sl-badge variant="primary">Selecting</sl-badge>';
}

export function removeSelectingIndicator(ctx) {
  if (typeof ctx.currentlySelectingTeam != 'number') return;
  document.getElementById(`team${ctx.currentlySelectingTeam}`).shadowRoot.getElementById('top-right').innerHTML = '';
}

export function updateTeamRosterCount(clientId, rosterCount, maxRosterSize) {
  document.getElementById(`team${clientId}lrc`).innerHTML = rosterCount + '/' + maxRosterSize;
}

export function moveTeamToCompleteSection(clientId) {
  const team = document.getElementById(`team${clientId}`);
  team.remove();
  document.getElementById('doneTeamsSection').insertAdjacentElement('beforeEnd', team);
}

export function setTimerTime(time, timeRemaining, timeLimit) {
  const timeEl = document.getElementById('time');
  const pct = (timeRemaining / timeLimit) * 100;
  timeEl.setAttribute('value', pct);
  timeEl.innerHTML = time;

  timeEl.classList.remove('low', 'lower', 'lowest');
  if (pct <= 40 && pct > 25) {
    timeEl.classList.add('low');
  } else if (pct <= 25 && pct > 15) {
    timeEl.classList.add('lower');
  } else if (pct <= 15) {
    timeEl.classList.add('lowest');
  }
}

export function resetTimerTime() {
  document.getElementById('time').setAttribute('value', 0);
  document.getElementById('time').innerHTML = '';
}

export function updateRaiseButtonsLabel(raise) {
  document.getElementById('raise-buttons-label').innerHTML = raise ? 'raise' : 'bid';
}

export function initReadyUp(ctx) {
  // teams are automatically ready if the auction has already started
  if (ctx.stateId != 'pre_auction') return;
  document.getElementById('ready-up-container').removeAttribute('hidden');
  const readyUpEl = document.getElementById('ready-up');
  readyUpEl.addEventListener('click', () => {
    ctx.ws.send(
      JSON.stringify({
        type: 'ready_up',
        stateId: ctx.stateId,
      }),
    );
    readyUpEl.remove();
  });
}

export function isValidNumber(s) {
  return !isNaN(+s) && !isNaN(parseFloat(s));
}

export function initBidButtonListeners(ctx) {
  function onClick(e) {
    if (ctx.selectedPlayerId == undefined || e.target.value == undefined) return;
    if (e.target.hasAttribute('disabled')) return;

    let bid = +e.target.value;
    // if we are in the bidding phase these buttons are a raise on the existing bid
    if (ctx.stateId == 'bidding') {
      bid = ctx.currentBid + bid;
    }

    ctx.ws.send(
      JSON.stringify({
        type: 'bid',
        stateId: ctx.stateId,
        bid: bid,
        selectedPlayerId: ctx.selectedPlayerId,
        message: 'Player selected',
      }),
    );

    // remove focus from the button so keyboard doesn't trigger an accidental bid
    e.target.blur();
  }
  document.querySelectorAll('sl-button.fixed-bet').forEach((el) => el.addEventListener('click', onClick));

  // for the custom raise button we have to get the value from the input
  document.getElementById('raise').addEventListener('click', (e) => {
    if (e.target.hasAttribute('disabled')) return;
    const raiseInputEl = document.getElementById('raise-input');
    if (ctx.selectedPlayerId == undefined || e.target.value == undefined || raiseInputEl == undefined) return;
    const bid = raiseInputEl.value;
    if (!isValidNumber(bid)) return;
    ctx.ws.send(
      JSON.stringify({
        type: 'bid',
        stateId: ctx.stateId,
        bid: +bid,
        selectedPlayerId: ctx.selectedPlayerId,
        message: 'Player selected',
      }),
    );
    // remove focus from the button so keyboard doesn't trigger an accidental bid
    e.target.blur();
  });
}

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

export function updateTeamCard(team, isDone) {
  const shadow = document.getElementById(`team${team.clientId}`).shadowRoot;
  if (isDone) {
    // If the team is done, their card is blue, and we don't show a status icon.
    document.getElementById(`team${team.clientId}llc`).innerHTML = '';
    shadow.getElementById('main-content').setAttribute('class', 'done');
  } else {
    // Otherwise, use the existing logic for connected/ready status.
    const [content, cls] = getTeamLowerLeftContentClass(team.connected, team.ready);
    // update team card
    document.getElementById(`team${team.clientId}llc`).innerHTML = content;
    shadow.getElementById('main-content').setAttribute('class', cls);
  }
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

export function updateSelectedPlayerCard(playerData, speciesInfoMap, allPlayers) {
  console.log('[Debug] updateSelectedPlayerCard called for player:', playerData);
  console.log('[Debug] speciesInfoMap available:', speciesInfoMap instanceof Map && speciesInfoMap.size > 0);
  document.getElementById('waiting-msg').innerHTML = '';
  const pokemonImageEl = document.getElementById('pokemon-image');
  const imagePath = `/images/${encodeURIComponent(playerData.name)}.png`;
  pokemonImageEl.src = imagePath;
  pokemonImageEl.alt = playerData.name;
  pokemonImageEl.style.display = 'block';
  displayPlayerAuctionInfo(playerData, speciesInfoMap, allPlayers);
  const card = document.getElementById('player');

  card.style.minHeight = 'auto'; // Allow the card to shrink to its content.

  // Parse types and create image tags for them.
  const types = playerData.type.split(/[\s,\/]+/).filter((t) => t); // Handles "Fire", "Fire/Flying", "Fire, Flying"
  const typeImagesHtml = types.map((type) => {
      const trimmedType = type.trim();
      return `<img src="/TypeIcons/${trimmedType}IC_SV.png" alt="${trimmedType}" title="${trimmedType}" style="height: 16px;">`;
    }).join('');

  card.removeAttribute('hidden');
  let cardInner = `
    <div slot="header" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; overflow: hidden;">
      <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 0;">
        <div style="width: 24px; display: flex; justify-content: center; align-items: center; flex-shrink: 0;">
          <img src="/MiniIcons/${playerData.name.toLowerCase()}.png" alt="${playerData.name}" style="max-height: 24px; max-width: 24px; vertical-align: middle;">
        </div>
        <strong style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${playerData.name}</strong>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.1rem; flex-shrink: 0;">
        ${typeImagesHtml}
      </div>
    </div>
  `;
  card.innerHTML = cardInner;
}

export function hideSelectedPlayerCard(teamName) {
  document.getElementById('player').setAttribute('hidden', 'true');
  const pokemonImageEl = document.getElementById('pokemon-image');
  pokemonImageEl.style.display = 'none';
  document.getElementById('evolution-info-container').style.display = 'none';
  if (typeof teamName == 'string') {
    document.getElementById('waiting-msg').innerHTML = `Waiting for <u>${teamName}</u> to make a bid`;
  }
}

export function disableRaiseButtons() {
  document.getElementById('raise1').setAttribute('disabled', '1');
  document.getElementById('raise5').setAttribute('disabled', '1');
  document.getElementById('raise10').setAttribute('disabled', '1');
  document.getElementById('raise').setAttribute('disabled', '1');
  document.getElementById('raise1').classList.remove('hover');
  document.getElementById('raise5').classList.remove('hover');
  document.getElementById('raise10').classList.remove('hover');
  document.getElementById('raise').classList.remove('hover');
}

export function enableRaiseButtons() {
  document.getElementById('raise1').removeAttribute('disabled');
  document.getElementById('raise5').removeAttribute('disabled');
  document.getElementById('raise10').removeAttribute('disabled');
  document.getElementById('raise').removeAttribute('disabled');
  document.getElementById('raise1').classList.add('hover');
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

export function addPlayerIconToTeamCard(clientId, playerName) {
  // Find the parent participant-el component first.
  const teamCard = document.getElementById(`team${clientId}`);
  const iconContainer = teamCard?.querySelector(`#team${clientId}trc`);
  console.log(`[Debug] addPlayerIconToTeamCard called for clientId: ${clientId}, playerName: ${playerName}`);
  if (iconContainer) {
    // Stop adding icons once the limit of 12 is reached.
    if (iconContainer.childElementCount >= 12) {
      console.log(`[Debug] Max sprites (12) reached for client ${clientId}. Not adding more.`);
      return;
    }
    console.log(`[Debug] Found icon container 'team${clientId}trc'. Appending icon.`);
    const iconName = playerName.toLowerCase();
    const iconPath = `/MiniIcons/${iconName}.png`;
    iconContainer.insertAdjacentHTML(
      'beforeend',
      `<img src="${iconPath}" alt="${playerName}" title="${playerName}" style="max-height: 20px; max-width: 20px;">`,
    );
  } else {
    console.error(`[Debug] Could not find icon container with ID 'team${clientId}trc'.`);
  }
}

export function removeSelectingIndicator(ctx) {
  if (typeof ctx.currentlySelectingTeam != 'number') return;
  document.getElementById(`team${ctx.currentlySelectingTeam}`).shadowRoot.getElementById('top-right').innerHTML = '';
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
    if (ctx.isPaused) return; // Do not allow bidding when paused
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

    // Optimistically disable buttons to prevent double-bidding or race conditions.
    console.log('[Client Bid] Optimistically disabling buttons after sending bid.');
    disableRaiseButtons();

    // remove focus from the button so keyboard doesn't trigger an accidental bid
    e.target.blur();
  }
  document.querySelectorAll('sl-button.fixed-bet').forEach((el) => el.addEventListener('click', onClick));

  // for the custom raise button we have to get the value from the input
  document.getElementById('raise').addEventListener('click', (e) => {
    if (ctx.isPaused) return; // Do not allow bidding when paused
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

    // Optimistically disable buttons to prevent double-bidding or race conditions.
    console.log('[Client Bid] Optimistically disabling buttons after sending custom bid.');
    disableRaiseButtons();

    // remove focus from the button so keyboard doesn't trigger an accidental bid
    e.target.blur();
  });
}

function getStatColor(statValue) {
  if (statValue >= 150) return '#00c853'; // green
  if (statValue >= 120) return '#aeea00'; // light-green
  if (statValue >= 90) return '#ffeb3b'; // yellow
  if (statValue >= 60) return '#ff9800'; // orange
  return '#f44336'; // red
}

/**
 * Updates the UI to display the auctioned player's image and species info.
 * Builds and displays the evolution chain for the auctioned player.
 * @param {object} player - The base player object from the players table.
 * @param {Map<string, object>} speciesInfoMap - The parsed species info for descriptions.
 * @param {Array<object>} allPlayers - The full list of player data from pok.csv.
 */
export function displayPlayerAuctionInfo(player, speciesInfoMap, allPlayers) {
  console.log('[Evo Debug] displayPlayerAuctionInfo called for player:', player, 'with allPlayers count:', allPlayers?.length);
  const infoEl = document.getElementById('species-info-text');
  const infoContainer = document.getElementById('evolution-info-container');
  infoContainer.innerHTML = ''; // Clear previous content
  infoContainer.style.display = 'none'; // Default to none, will be set to flex if evolutions exist
  infoContainer.style.flexDirection = 'column';
  infoContainer.style.gap = '1rem';
  infoEl.style.display = 'none';

  infoEl.innerHTML = ''; // Clear previous content

  if (player && player.name && allPlayers && allPlayers.length > 0) {
    let currentPokemonName = player.name;
    let info = speciesInfoMap.get(currentPokemonName);

    // Build abilities HTML for base pokemon
    const abilityDivs = [];
    if (player.ability1) abilityDivs.push(`<div>${player.ability1.trim()}</div>`);
    if (player.ability2) abilityDivs.push(`<div>${player.ability2.trim()}</div>`);
    if (player.hidden_ability) abilityDivs.push(`<div>${player.hidden_ability.trim()} (H)</div>`);
    const abilitiesHtml = abilityDivs.join('');

    // Build stats HTML for base pokemon
    const stats = [
      { label: 'HP', key: 'hp' },
      { label: 'Atk', key: 'attack' },
      { label: 'Def', key: 'defense' },
      { label: 'SpAtk', key: 'sp_attack' },
      { label: 'SpDef', key: 'sp_defense' },
      { label: 'Spd', key: 'speed' },
    ];
    const maxStat = 255;
    const statsHtml = stats
      .map((stat) => {
        const statValue = player[stat.key];
        if (!statValue) return '';
        const barWidth = (statValue / maxStat) * 100;
        const barColor = getStatColor(statValue);
        return `
          <div style="display: flex; align-items: center; gap: 4px; font-size: 0.7rem; width: 100%;">
            <span style="width: 35px; text-align: right; font-weight: bold;">${stat.label}</span>
            <span style="width: 25px; text-align: left;">${statValue}</span>
            <div style="flex-grow: 1; height: 8px;">
              <div style="width: ${barWidth}%; background-color: ${barColor}; height: 100%; border-radius: 4px;"></div>
            </div>
          </div>`;
      })
      .join('');

    // Get key moves from speciesInfoMap
    const keyMovesHtml = info && info.description ? `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${info.description}</pre>` : '';

    infoEl.innerHTML = `
      <div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem;">${player.name}</div>
      <div style="font-size: 0.8rem; display: flex; flex-direction: column; align-items: flex-start; margin-bottom: 1rem;">
        ${abilitiesHtml}
      </div>
      <div style="display: flex; flex-direction: column; gap: 2px; width: 100%; margin-bottom: 1rem;">
        ${statsHtml}
      </div>
      ${keyMovesHtml}
    `;
    infoEl.style.display = 'block';

    // Add type icons below the base pokemon's image
    const types = player.type.split(/[\s,\/]+/).filter((t) => t);
    const typeImagesHtml = types
      .map((type) => {
        const trimmedType = type.trim();
        return `<img src="/TypeIcons/${trimmedType}IC_SV.png" alt="${trimmedType}" title="${trimmedType}" style="height: 16px;">`;
      })
      .join('');
    document.getElementById('pokemon-image-types').innerHTML = typeImagesHtml;

    // Build and display evolution chain based on CSV order
    const evolutions = [];
    console.log('[Evo Debug] Starting to look for evolution chain from pok.csv structure...');

    // 1. Find the index of the base form for the selected Pokémon's family.
    const playerIndex = allPlayers.findIndex((p) => p.name === player.name);
    let baseIndex = -1;
    if (playerIndex !== -1) {
      for (let i = playerIndex; i >= 0; i--) {
        if (allPlayers[i].stage === 'base') {
          baseIndex = i;
          console.log(`[Evo Debug] Found base form '${allPlayers[i].name}' at index ${i}.`);
          break;
        }
      }
    }

    // 2. Iterate forward from the base form to find all its evolutions.
    if (baseIndex !== -1) {
      for (let i = baseIndex + 1; i < allPlayers.length; i++) {
        const nextPokemon = allPlayers[i];
        if (nextPokemon.stage === 'base') {
          console.log(`[Evo Debug] Reached next base form '${nextPokemon.name}'. Ending chain search.`);
          break; // Reached the next Pokémon family
        }
        // Any non-base Pokémon is an evolution in this family.
        // Also, make sure we don't add the currently selected pokemon to its own evolution list.
        if (nextPokemon.name !== player.name) {
          evolutions.push({ name: nextPokemon.name, info: nextPokemon });
        }
      }
    }

    console.log('[Evo Debug] Finished building evolution chain. Total evolutions found:', evolutions.length, evolutions);

    if (evolutions.length > 0) {
      console.log('[Evo Debug] Found evolutions, preparing to render them to the DOM.');
      infoContainer.style.display = 'flex'; // Show the container
      infoContainer.style.flexDirection = 'row'; // Arrange evolutions horizontally
      infoContainer.style.justifyContent = 'flex-start'; // Distribute space
      infoContainer.style.alignItems = 'flex-start'; // Align to the top

      // Add an arrow from the base pokemon to the first evolution
      const firstEvo = evolutions[0];
      const arrowHtml = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80px; gap: 0.5rem; margin-top: 1rem;">
          <img src="/generic/Arrow.png" alt="Evolves to" style="width: 24px; height: 24px;">
          <div style="font-size: 0.7rem; text-align: center; width: 70px;">${firstEvo.info.evolution_method || ''}</div>
        </div>
      `;
      infoContainer.insertAdjacentHTML('beforeend', arrowHtml);

      evolutions.forEach((evo, index) => {
        let imageName = evo.name;
        // Handle Mega Evolution naming convention ("Mega Pokemon" -> "Pokemon-Mega")
        if (imageName.startsWith('Mega ')) {
          const parts = imageName.split(' ');
          imageName = `${parts[1]}-Mega`;
        }
        imageName = imageName.replace(/[^a-zA-Z0-9-]/g, '');
        const imagePath = `/evolutions/${imageName}.png`;
        console.log(`[Evo Debug] Rendering evolution '${evo.name}'. Image path: '${imagePath}'`);

        // Get types and create vertically stacked image tags
        const types = evo.info.type.split(/[\s,\/]+/).filter((t) => t);
        const typeImagesHtml = types
          .map((type) => {
            const trimmedType = type.trim();
            return `<img src="/TypeIcons/${trimmedType}IC_SV.png" alt="${trimmedType}" title="${trimmedType}" style="height: 16px;">`;
          })
          .join('');

        // Get abilities and create vertically stacked divs
        let abilitiesHtml = '';
        const abilityDivs = [];
        if (evo.info.ability1) {
          abilityDivs.push(`<div>${evo.info.ability1.trim()}</div>`);
        }
        if (evo.info.ability2) {
          abilityDivs.push(`<div>${evo.info.ability2.trim()}</div>`);
        }
        if (evo.info.hidden_ability) {
          abilityDivs.push(`<div>${evo.info.hidden_ability.trim()} (H)</div>`);
        }
        abilitiesHtml = abilityDivs.join('');

        // Generate stats bar graph
        const stats = [
          { label: 'HP', key: 'hp' },
          { label: 'Atk', key: 'attack' },
          { label: 'Def', key: 'defense' },
          { label: 'SpAtk', key: 'sp_attack' },
          { label: 'SpDef', key: 'sp_defense' },
          { label: 'Spd', key: 'speed' },
        ];
        const maxStat = 255; // A common ceiling for base stats for scaling
        const statsHtml = stats
          .map((stat) => {
            const statValue = evo.info[stat.key];
            if (!statValue) return '';
            const barWidth = (statValue / maxStat) * 100;
            const barColor = getStatColor(statValue);
            return `
              <div style="display: flex; align-items: center; gap: 4px; font-size: 0.7rem; width: 100%;">
                <span style="width: 35px; text-align: right; font-weight: bold;">${stat.label}</span>
                <span style="width: 25px; text-align: left;">${statValue}</span>
                <div style="flex-grow: 1; height: 8px;">
                  <div style="width: ${barWidth}%; background-color: ${barColor}; height: 100%; border-radius: 4px;"></div>
                </div>
              </div>`;
          })
          .join('');
        const evolutionHtml = `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; text-align: center; width: 200px;">
            <div style="flex-shrink: 0; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;">
              <img src="${imagePath}" alt="${evo.name}" title="${evo.name}" style="max-width: 100%; max-height: 100%; object-fit: contain;"
                   onerror="this.onerror=null; this.style.display='none'; console.error('[Evo Debug] Failed to load image at path: ${imagePath}')">
            </div>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 0.1rem;">${typeImagesHtml}</div>
            <div style="font-size: 0.8rem; display: flex; flex-direction: column; align-items: center;">
              ${abilitiesHtml}
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px; width: 100%;">
              ${statsHtml}
            </div>
          </div>
        `;
        infoContainer.insertAdjacentHTML('beforeend', evolutionHtml);

        // If this is not the last evolution, add an arrow and the evolution method to get to the next one.
        if (index < evolutions.length - 1) {
          const nextEvo = evolutions[index + 1];
          const arrowHtml = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80px; gap: 0.5rem; margin-top: 1rem;">
              <img src="/generic/Arrow.png" alt="Evolves to" style="width: 24px; height: 24px;">
              <div style="font-size: 0.7rem; text-align: center; width: 70px;">${nextEvo.info.evolution_method || ''}</div>
            </div>
          `;
          infoContainer.insertAdjacentHTML('beforeend', arrowHtml);
        }
      });
    }
  } else {
    console.log('[Evo Debug] displayPlayerAuctionInfo called with no player, name, or allPlayers list. Aborting.');
  }
}

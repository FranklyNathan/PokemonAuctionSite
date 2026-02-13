export function calculateAveragePrice(playersData) {
  if (!playersData || playersData.length === 0) return 0;
  let total = 0;
  let count = 0;
  for (const p of playersData) {
    if (p.pickedBy && typeof p.cost === 'number') {
      total += p.cost;
      count++;
    }
  }
  return count === 0 ? 0 : total / count;
}

export function updateDraftCounter(count, total, average) {
  const counterEl = document.getElementById('draft-counter');
  if (counterEl) {
    let text = `Drafted: ${count} / ${total}`;
    if (typeof average === 'number' && count > 0) {
      text += ` &nbsp;&nbsp;|&nbsp;&nbsp; Avg. Sale Price: $${Math.round(average)}`;
    }
    counterEl.innerHTML = text;
  }
}

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

export function updateTeamCard(team, isDone, myClientId, flashbangedClientId, ws, stateId, highestBidder, flashbangsEnabled) {
  const teamCardEl = document.getElementById(`team${team.clientId}`);
  const shadow = teamCardEl.shadowRoot;
  // Get containers for both top-left and top-right actions.
  const topLeftActionContainer = document.getElementById(`team${team.clientId}tlac`);
  // Target the slotted span element in the light DOM, not the container in the shadow DOM.
  const topRightContainer = document.getElementById(`team${team.clientId}trc`);

  // Clear action/status indicators but preserve drafted player icons in the top right.
  topLeftActionContainer.innerHTML = '';
  const badge = topRightContainer.querySelector('sl-badge');
  if (badge) badge.remove();

  // Handle high bidder highlight by adding/removing a class on the host element
  if (highestBidder === team.clientId) {
    teamCardEl.classList.add('high-bidder');
  } else {
    teamCardEl.classList.remove('high-bidder');
  }

  if (isDone) {
    // If the team is done, their card is blue, and we don't show a status icon.
    document.getElementById(`team${team.clientId}llc`).innerHTML = '';
    shadow.getElementById('main-content').setAttribute('class', 'done');
  } else if (flashbangedClientId === team.clientId) {
    // If the team is flashbanged, show a badge and give it a special class.
    topLeftActionContainer.innerHTML = '<sl-badge variant="danger">Flashed</sl-badge>';
    shadow.getElementById('main-content').setAttribute('class', 'flashbanged');
  } else {
    // Otherwise, use the existing logic for connected/ready status.
    const [content, cls] = getTeamLowerLeftContentClass(team.connected, team.ready);
    // update team card
    document.getElementById(`team${team.clientId}llc`).innerHTML = content;
    shadow.getElementById('main-content').setAttribute('class', cls);

    // Add flashbang icon if it's not my team and we are in the bidding state.
    const isOpponentInBidding = team.clientId !== myClientId && stateId === 'bidding';

    if (isOpponentInBidding && flashbangsEnabled) {
      // Get roster counts by counting the drafted player icons.
      const myRosterCount = document.getElementById(`team${myClientId}trc`)?.childElementCount || 0;
      const targetRosterCount = topRightContainer.childElementCount;

      // Only show the flashbang option if the target has more drafted Pokémon.
      if (myRosterCount < targetRosterCount) {
        const flashbangIconHtml = `<img src="/generic/Flashbang.png" alt="Flashbang" title="Flashbang ($1)" style="height: 16px; cursor: pointer;">`;
        topLeftActionContainer.innerHTML = flashbangIconHtml;
        const flashbangIcon = topLeftActionContainer.querySelector('img');
        flashbangIcon.addEventListener('click', () => {
          console.log(`[Client Action] Sending flashbang to ${team.clientId}`);
          ws.send(JSON.stringify({ type: 'flashbang', stateId: stateId, targetClientId: team.clientId }));
        });
      }
    }
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
  document.getElementById('highest-bidder').innerHTML = `High Bidder: ${name}`;
}

export function clearHighestBidder() {
  document.getElementById('current-bid').innerHTML = '';
  document.getElementById('highest-bidder').innerHTML = 'No bids yet.';
}

export function addDraftLog(teamName, cost, playerName) {
  const log = document.getElementById('draft-log');
  log.insertAdjacentHTML(
    'afterBegin',
    `<div class="draft-item new-draft" style="display: flex; font-family: inherit; padding: 0 0.4rem">
      <span style="display: inline-block; flex: 2; font-family: inherit; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${teamName}</span>
      <span style="display: inline-block; flex: 1; font-family: inherit; text-align: left; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">$${cost}</span>
      <span style="display: inline-block; flex: 2; font-family: inherit; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${playerName}</span>
    </div>`,
  );
  // remove the `new-draft` class (green background) so the color fades out
  setTimeout(() => log.firstChild.classList.remove('new-draft'), 100);
}

export function updateSelectedPlayerCard(playerData, speciesInfoMap, allPlayers) {
  console.log('[Debug] updateSelectedPlayerCard called for player:', playerData);
  console.log('[Debug] speciesInfoMap available:', speciesInfoMap instanceof Map && speciesInfoMap.size > 0);
  document.getElementById('waiting-msg').innerHTML = '';
  // Standardize name for image files: replace problematic characters but preserve case.
  const imageName = playerData.name.replace(/\. /g, '_').replace(/ /g, '_');

  const pokemonImageEl = document.getElementById('pokemon-image');
  const imagePath = `/baseforms/${imageName}.png`;
  pokemonImageEl.src = imagePath;
  pokemonImageEl.alt = playerData.name;
  pokemonImageEl.style.display = 'block';
  pokemonImageEl.loading = 'lazy';
  pokemonImageEl.decoding = 'async';
  displayPlayerAuctionInfo(playerData, speciesInfoMap, allPlayers);
  const card = document.getElementById('player');

  card.style.minHeight = 'auto'; // Allow the card to shrink to its content.

  // Parse types and create image tags for them.
  const types = playerData.type ? playerData.type.split(/[\s,\/]+/).filter((t) => t) : [];
  const typeImagesHtml = types
    .map((type) => {
      let trimmedType = type.trim();
      if (trimmedType === '???') trimmedType = 'Egg'; // Use EggIC_SV.png for ??? type
      return `<img src="/TypeIcons/${trimmedType}IC_SV.png" alt="${trimmedType}" title="${trimmedType}" style="height: 16px;">`;
    })
    .join('');

  card.removeAttribute('hidden');
  // Mini-icons have a different naming convention: lowercase, with hyphens instead of spaces/periods.
  const miniIconName = playerData.name
    .toLowerCase()
    .replace(/\. /g, '-')
    .replace(/ /g, '-')
    .replace(/[^a-z0-9-]/g, ''); // Sanitize to match file names like 'mime-jr'

  let cardInner = `
    <div slot="header" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; overflow: hidden;">
      <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 0;">
        <div style="width: 24px; display: flex; justify-content: center; align-items: center; flex-shrink: 0;">
          <img src="/MiniIcons/${miniIconName}.png" alt="${
            playerData.name
          }" style="max-height: 24px; max-width: 24px; vertical-align: middle;"
            onerror="this.onerror=null; this.src='/MiniIcons/egg.png';"
          >
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
  document.getElementById('raise100').setAttribute('disabled', '1');
  document.getElementById('raise').setAttribute('disabled', '1');
  document.getElementById('raise100').classList.remove('hover');
  document.getElementById('raise').classList.remove('hover');
}

export function enableRaiseButtons() {
  document.getElementById('raise100').removeAttribute('disabled');
  document.getElementById('raise').removeAttribute('disabled');
  document.getElementById('raise100').classList.add('hover');
  document.getElementById('raise').classList.add('hover');
}

export function showFlashbangOverlay() {
  const messages = [
    "Uh Oh! You've been flashbanged! Wait for a bid to be placed to get back into the action.",
    'You doofus!  You\'ve been flashbanged! All your friends are having fun without you!',
    'Ooh! Somebody flashbanged you! Maybe they have a crush!',
  ];
  const randomMessage = messages[Math.floor(Math.random() * messages.length)];

  const overlay = document.getElementById('flashbang-overlay');
  overlay.style.display = 'flex';
  overlay.innerHTML = randomMessage;
}

export function hideFlashbangOverlay() {
  const overlay = document.getElementById('flashbang-overlay');
  overlay.style.display = 'none';
}

export function addPlayerIconToTeamCard(clientId, playerName) {
  // Find the parent participant-el component first.
  // The icon container is in the light DOM, so we can select it directly by its ID.
  const iconContainer = document.getElementById(`team${clientId}trc`);
  console.log(`[Debug] addPlayerIconToTeamCard called for clientId: ${clientId}, playerName: ${playerName}`);
  if (iconContainer) {
    // Stop adding icons once the limit of 12 is reached.
    if (iconContainer.childElementCount >= 12) {
      console.log(`[Debug] Max sprites (12) reached for client ${clientId}. Not adding more.`);
      return;
    }
    console.log(`[Debug] Found icon container 'team${clientId}trc'. Appending icon.`);
      // Mini-icons have a different naming convention: lowercase, with hyphens instead of spaces/periods.
    const iconName = playerName
      .toLowerCase()
      .replace(/\. /g, '-')
      .replace(/ /g, '-')
      .replace(/[^a-z0-9-]/g, ''); // Sanitize to match file names like 'mime-jr'
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
  console.log(`[Debug] setTimerTime: time=${time}, timeRemaining=${timeRemaining}, timeLimit=${timeLimit}, pct=${pct}`);
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

function sendBid(ctx, bid, originalEventTarget) {
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
  if (originalEventTarget) originalEventTarget.blur();
}

function handleBid(ctx, bid, originalEventTarget) {
  // Show confirmation if the bid raises the current value by more than 3000.
  if (bid - ctx.currentBid > 2400) {
    console.log(`[Client Bid] Bid raise > 2400 (${bid - ctx.currentBid}). Showing confirmation dialog.`);
    const dialog = document.getElementById('bidConfirmationDialog');
    const confirmBtn = document.getElementById('confirmBidButton');
    const cancelBtn = document.getElementById('cancelBidButton');
    const messageEl = document.getElementById('bidConfirmationMessage');

    messageEl.textContent = `Whoa, that's a big raise! You want to bid $${bid}?`;

    const onConfirm = () => {
      sendBid(ctx, bid, originalEventTarget);
      dialog.hide();
    };

    // Use { once: true } to automatically remove the listeners after they're invoked.
    confirmBtn.addEventListener('click', onConfirm, { once: true });
    cancelBtn.addEventListener('click', () => dialog.hide(), { once: true });

    dialog.show();
  } else {
    sendBid(ctx, bid, originalEventTarget);
  }
}

export function initBidButtonListeners(ctx) {
  function onClick(e) {
    if (ctx.isPaused) return; // Do not allow bidding when paused
    if (ctx.selectedPlayerId == undefined || e.target.value == undefined) return;
    if (e.target.hasAttribute('disabled')) return;

    // Prevent accidental high bids at the very start of a round.
    const timeSinceNewPlayer = Date.now() - ctx.newPlayerTime;
    if (ctx.currentBid === 0 && +e.target.value >= 1500 && timeSinceNewPlayer < 1000) {
      toast('Warning', 'Bid blocked in case of accident.', 'warning');
      console.log('[Client Bid] High bid blocked in case of accident.');
      return;
    }

    let bid = +e.target.value;

    // If this is a $100 raise, check if the bid jumped recently.
    if (bid === 100 && ctx.stateId === 'bidding') {
      const timeSinceLastBid = Date.now() - ctx.lastBidUpdateTime;
      const bidIncrease = ctx.currentBid - ctx.previousBid;
      if (timeSinceLastBid < 1000 && bidIncrease >= 200) {
        toast('Warning', 'Whoa! The bid increased before your raise registered.', 'warning');
        console.log('[Client Bid] Bid blocked due to rapid increase.');
        return;
      }
    }

    // if we are in the bidding phase these buttons are a raise on the existing bid
    if (ctx.stateId == 'bidding') {
      bid = ctx.currentBid + bid;
    }

    handleBid(ctx, bid, e.target);
  }
  document.querySelectorAll('sl-button.fixed-bet').forEach((el) => el.addEventListener('click', onClick));

  // for the custom raise button we have to get the value from the input
  document.getElementById('raise').addEventListener('click', (e) => {
    if (ctx.isPaused) return; // Do not allow bidding when paused
    if (e.target.hasAttribute('disabled')) return;
    const raiseInputEl = document.getElementById('raise-input');

    // Prevent accidental high bids at the very start of a round.
    const timeSinceNewPlayer = Date.now() - ctx.newPlayerTime;
    if (ctx.currentBid === 0 && +raiseInputEl.value >= 1500 && timeSinceNewPlayer < 1000) {
      toast('Warning', 'Bid blocked in case of accident.', 'warning');
      console.log('[Client Bid] Bid blocked due to being a high initial bid placed too quickly.');
      return;
    }
    if (ctx.selectedPlayerId == undefined || raiseInputEl == undefined) return;
    const bid = raiseInputEl.value;
    if (!isValidNumber(bid)) return;
    if (+bid % 100 !== 0) {
      toast('Invalid Bid', 'Bid must be a multiple of 100.', 'warning');
      return;
    }

    handleBid(ctx, +bid, e.target);
  });
}

function getStatColor(statValue) {
  if (statValue >= 130) return '#2196f3'; // blue
  if (statValue >= 95) return '#00c853'; // green
  if (statValue >= 70) return '#aeea00'; // light-green
  if (statValue >= 50) return '#ffeb3b'; // yellow
  if (statValue >= 35) return '#ff9800'; // orange
  return '#f44336'; // red
}

export const specialMechanics = {
  Castform: `Unique Mechanic: Forecast
\nStarting at level 20, Forecast gains the additional effect of setting weather whenever Castform enters the fight. The weather created depends on the type of the first move in Castform's move list:
\nWater: Rain (Drizzle)
\nFire: Sun (Drought)
\nIce: Hail (Snow Warning)`,
  Mareep: `Unique Mechanic: Milk Drink
\nWhen used outside of battle, Milk Drink levels up one other Pokémon, ignoring the level cap.
\nEach evolution line can only use Milk Drink once, so choose wisely!`,
  Miltank: `Unique Mechanic: Milk Drink
\nWhen used outside of battle, Milk Drink levels up one other Pokémon, ignoring the level cap.
\nEach evolution line can only use Milk Drink once, so choose wisely!`,
  Skiddo: `Unique Mechanics: Grass Pelt & Milk Drink
\nTerrain doesn't exist in Emerald Blitz. Instead, Grass Pelt provides its 50% defense boost in the sun.
\nWhen used outside of battle, Milk Drink levels up one other Pokémon, ignoring the level cap.
\nEach evolution line can only use Milk Drink once, so choose wisely!`,
  Smoliv: `Unique Mechanic: Seed Sower
\nTerrain doesn't exist in Emerald Blitz. Instead, Arboliva's Seed Sower ability sets Leech Seed on any Pokemon that attacks it and makes contact.`,
  Greavard: `Unique Mechanic: Last Respects
\nEach time one of your Pokemon faints, Greavard's signature move Last Respects permanently gains 15 power on top of its base 50.
\nThe fainted Pokémon counter does not reset between battles.`,
  Corsola: `Unique Mechanic: On-Death Evolution
\nWhen Corsola faints, after the battle, it will transform into Galarian Corsola and revive at full HP.`,
  Bombirdier: `Unique Mechanic: Stork's Blessing
\nAt the end of a boss battle in which your Bombirdier with Stork's Blessing participated, if you have an empty slot in your party, you receive an egg. The egg contains a random Pokémon of the 19 possible babies. They hatch at level 5 and cannot level up.`,
  Applin: `Unique Mechanic: Gym-Based Evolution
\nApplin evolves into different Pokemon depending on which gym you're in. Gyms are randomized in Emerald Blitz, so cross your fingers to get Fortree, Lavaridge, or Rustboro early,`,
  Rotom: `Unique Mechanic: Rotom Catalog
\nRotom transforms with the consumable item Rotom Catalog, available in Fortree City. You're given three Rotom Catalogs. With the ability to change forms after seeing which boss you're about to face, Rotom's versatility is unmatched.`,
  Smeargle: `Unique Mechanic: Sketch
\nSmeargle's signature move Sketch is more potent than ever before. Now, when used from the party menu, Smeargle can choose to learn one of four moves randomly selected from the Sketch pool, a collection of the strongest moves in Emerald Blitz. Happy sketching!
\nNotably, Sketch is the only move in the game that cannot be relearned via the Move Relearner.`,
  Nincada: `Tip: Shedinja
\nWith its Wonder Guard ability, Shedinja is immune to all non-super-effective damage. This makes it excellent into Brawly, who has few options to hit it.
\nTo evolve Nincada into both Ninjask and Shedinja, make sure you have an extra spot in your party when it reaches level 20.`,
  Zorua: `Tip: Illusion
\nZorua and Zoroark's signature ability causes them to take on the appearance of the last Pokemon in your party. The AI treats the Illusioned Pokemon as the Pokemon it's disguised as, but if it uses a Psychic-type move and fails to deal damage, it will realize it's up against an Illusion Pokemon and attack accordingly on subsequent turns.`,
  Minior: `Tip: Rollout!
\nMinior is the king of early game sweeps. By starting the fight using Defense Curl, Minior's STAB Rollout starts at 2x power. Then, if Minior drops below half health at any point, its Shields Down ability triggers, increasing its attack and speed stat to all but guarentee that subsequent Rollouts one hit KO.`,
  Meowth: `Tip: Pay Day
\nMeowth's signature move Pay Day is the only way in the game to earn extra money.
\nEach use of Pay Day in a gym battle earns you coins equal to 20 times the level of Meowth/Perrserker, up to a maximum of 2000.`,
  Lotad: `Tip: Delayed Evolution
\nBy delaying Lotad's evolution until level 18, it can learn Mega Drain before gym 2. Otherwise, you'll be relying on the Bullet Seed TM for Grass STAB until you gain access to the Giga Drain TM.`,
  Sableye: `Tip: Early Mega Evolution
\nMawile and Sableye are the only two Pokémon in Emerald Blitz who can Mega Evolve before the 7th gym. Their Mega stones are available from the start. However, you won't earn enough money to purchase them until after beating gym 3, since they cost a steep 10,000.`,
  Mawile: `Tip: Early Mega Evolution
\nMawile and Sableye are the only two Pokémon in Emerald Blitz who can Mega Evolve before the 7th gym. Their Mega stones are available from the start. However, you won't earn enough money to purchase them until after beating gym 3, since they cost a steep 10,000.`,
  Mankey: `Tip: Rage Fist
\nPrimeape's signature move Rage Fist begins at 50 base power and grows stronger each time Primeape is hit.
\nHowever, it's been nerfed in Emerald Blitz to cap at 100 base power instead of 350.`,
  Gastly: `Tip: Delayed Evolution
\nBy delaying Gastly's evolution until level 29, it can learn Shadow Ball before gym 4 while still evolving into Haunter. Otherwise, Haunter needs to wait all of the way until level 33, which doesn't come until two gyms later.`,
  Sewaddle: `Tip: Delayed Evolution
\nBy delaying Sewaddle's evolution until level 22, it can learn Struggle Bug before gym 3 while still evolving into Swadloon. Otherwise, Swadloon never learns the move.`,
  Treecko: `Tip: Delayed Evolution
\nNeither Grovyle nor Sceptile learn Giga Drain via level up, just Treecko. Because of this, Treecko is a rare case of a Pokemon that can benefit from delaying evolution for a full gym. By delaying evolution to Grovyle from 16 to 21, Treecko can learn Giga Drain a full two gyms earlier than it'd be able to otherwise via TM.`,
  Goomy: `Tip: Rain Evolution
\nBoth forms of Sliggoo require you find some rain to evolve them. Luckily, just east of Fortree City, Route 119 has a permanent rain shower. Use the "Evolution" option in the party menu to evolve Sliggoo when standing in the rain.`,
  Inkay: `Tip: One Crazy Contrary
\nInkay and Malamar's ability Contrary inverts all stat changes. This makes Superpower boost Malamar's stats instead of lowering them, allowing it to increase its Attack and Defense by one stage.`,
  Ponyta: `Tip: Run Away
\nRun Away now functions like Emergency Exit, forcibly switching the Pokémon out once it drops below a 1/4 HP threshold. Rapidash is the only Pokémon in Emerald Blitz who retains access to this useful ability all of the way to its final evolution.`,
  Pansear: `Tip: Acrobatics
\nFling your held King's Rock at the opponent to flinch them, then use Acrobatics for big damage? Now that's a gameplan I can get behind!
\nBut watch out! Once Pansear evolves, it stops learning moves via level up. Be sure to wait until it learns Acrobatics to use that Fire Stone!`,
  Shroodle: `Tip: Doodle
\nShroodle's signature move Doodle is something special! Now, when used from the party menu, Grafaiai can choose to swap to one of four abilities randomly selected from the Doodle pool, a collection of the strongest abilities in Emerald Blitz. Happy doodling!
\nNotably, Doodle is forgotten once used and cannot be relearned via the Move Relearner.
\nThe full Doodle pool includes: Drizzle, Drought, Dry Skin, Effect Spore, Flash Fire, Fluffy, Levitate, Illusion, Intimidate, Protean, Perish Body, Pixilate, Refrigerate, Regenerator, Sap Sipper, Seed Sower, Sheer Force, Sturdy, Tough Claws, and Volt Absorb`,
  Burmy: `Tip: Burmy Binder
\nBurmy and Wormadam change cloaks using the consumable Burmy Binder, available in the Pretty Petal Flower Shop. You're given three Burmy Binders. With the ability to change forms after seeing which boss you're about to face, and the ability to change its Hidden Power type, Wormadam has excellent versatility!`,
  "Plusle and Minun": `Tip: Two is better than One!
\nA two-for-one special! Plusle and Minun appear as one unit to be purchased together. In game, you can't pick one from the notebook without being given the other.`,
  Egg: `Tip: Baby Pokemon
\nAn egg can hatch into any baby Pokemon. The full list of babies includes Togepi, Pichu, Cleffa, Igglybuff, Smoochum, Tyrogue, Elekid, Magby, Azurill, Wynaut, Budew, Chingling, Bonsly, Mime Jr., Happiny, Munchlax, Riolu, Mantyke and Toxel.
\nThe steps required to hatch an egg have been greatly reduced. You can hatch eggs in your room before the run begins.`,
  Eevee: `Tip: The most important Pokemon of all!
\nEevee is Emerald Blitz's starter Pokemon, available to all players from the beginning of the game.
\nThere's just one catch: once a player evolves their Eevee, no other player can evolve their Eevee into that same species. This means that beating the fourth gym and gaining access to evolution stones is especially imperative!
\nEevee's ability to evolve into eight different types of Pokemon makes it invaluable for filling out your team with coverage for your draft's weaker matchups. That said, don't underestimate Eevee into the first few gyms! Its ability to lower the opponent's stats help get many early game teams over the hill.`,
};

const dangerPokemon = [
  "Absol", "Falinks", "Hawlucha", "Klawf", "Miltank", "Stonjourner", "Turtonator", "Stantler",
  "Bombirdier", "Rotom", "Sneasel", "Minior", "Scyther", "Applin", "Slakoth"
];

/**
 * Updates the UI to display the auctioned player's image and species info.
 * Builds and displays the evolution chain for the auctioned player.
 * @param {object} player - The base player object from the players table.
 * @param {Map<string, object>} speciesInfoMap - The parsed species info for descriptions.
 * @param {Array<object>} allPlayers - The full list of player data from pok.csv.
 */
export function displayPlayerAuctionInfo(player, speciesInfoMap, allPlayers) {
  const infoEl = document.getElementById('species-info-text');
  const infoContainer = document.getElementById('evolution-info-container');
  infoContainer.innerHTML = ''; // Clear previous content
  infoContainer.style.display = 'none'; // Default to none, will be set to flex if evolutions exist
  infoContainer.style.flexDirection = 'column';
  infoContainer.style.gap = '0.5rem';
  infoEl.style.display = 'none';

  // Special handling for "Egg" to prevent errors and display issues.
  if (player && player.name === 'Egg') {
    // Add type icons below the base pokemon's image
    const imageTypesContainer = document.getElementById('pokemon-image-types');
    const types = player.type.split(/[\s,\/]+/).filter((t) => t);
    const typeImagesHtml = types.map((type) => {
        let trimmedType = type.trim();
        if (trimmedType === '???') trimmedType = 'Egg'; // Use EggIC_SV.png for ??? type
        return `<img src="/TypeIcons/${trimmedType}IC_SV.png" alt="${trimmedType}" title="${trimmedType}" style="height: 16px;">`;
    }).join('');
    imageTypesContainer.innerHTML = typeImagesHtml;
    infoEl.innerHTML = `<div style="direction: ltr; text-align: left; padding-left: 1.5rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem;">
          <span>Egg</span>
          <sl-button id="special-mechanic-btn" size="small" variant="neutral" title="Special Mechanic!" style="--sl-spacing-x-small: 0rem; width: 2rem;">
            <img src="/generic/star.png" alt="Special Mechanic" style="height: 1.2rem; position: relative; top: 4px;"/>
          </sl-button>
        </div>
      </div>
    `;
    infoEl.style.display = 'block';
    infoContainer.innerHTML = '';
    infoContainer.style.display = 'none';
    // Add event listener for the special mechanic button for the Egg.
    const specialMechanicBtn = infoEl.querySelector('#special-mechanic-btn');
    if (specialMechanicBtn) {
      specialMechanicBtn.addEventListener('click', () => {
        const dialog = document.getElementById('specialMechanicDialog');
        const contentEl = document.getElementById('specialMechanicContent');
        const closeBtn = dialog.querySelector('sl-button[slot="footer"]');

        const description = specialMechanics[player.name];
        const lines = description.split('\n');
        const firstLine = lines.shift();
        const restOfLines = lines.join('\n');
        const styledDescription = `<span style="font-weight: bold; font-size: 1.1em;">${firstLine}</span>\n${restOfLines}`;
        contentEl.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${styledDescription}</pre>`;
        dialog.show();
        closeBtn.addEventListener('click', () => dialog.hide(), { once: true });
      });
    }
    console.log('[Debug] Special handling for Egg. Bypassing regular info display.');
    return; // Exit early
  }

  infoEl.innerHTML = ''; // Clear previous content

  if (player && player.name && allPlayers && allPlayers.length > 0) {
    let currentPokemonName = player.name;
    let info = speciesInfoMap.get(currentPokemonName);

    const formatAbilityForUrl = (ability) => encodeURIComponent(ability.trim().toLowerCase().replace(/[_\s-]+/g, '-'));

    // Build abilities HTML for base pokemon
    const abilityDivs = [];
    if (player.ability1) {
      const abilityName = player.ability1.trim();
      abilityDivs.push(`<div><a class="ability-link" href="/pokedex?ability=${formatAbilityForUrl(abilityName)}&pokemon=${encodeURIComponent(player.name)}" target="_blank" rel="noopener noreferrer">${abilityName}</a></div>`);
    }
    if (player.ability2) {
      const abilityName = player.ability2.trim();
      abilityDivs.push(`<div><a class="ability-link" href="/pokedex?ability=${formatAbilityForUrl(abilityName)}&pokemon=${encodeURIComponent(player.name)}" target="_blank" rel="noopener noreferrer">${abilityName}</a></div>`);
    }
    if (player.hidden_ability) {
      const abilityName = player.hidden_ability.trim();
      abilityDivs.push(
        `<div><a class="ability-link" href="/pokedex?ability=${formatAbilityForUrl(abilityName)}&pokemon=${encodeURIComponent(player.name)}" target="_blank" rel="noopener noreferrer">${abilityName}</a> (H)</div>`,
      );
    }
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
          <div style="display: flex; align-items: center; font-size: 0.7rem;">
            <span style="width: 35px; text-align: right; font-weight: bold; margin-right: 4px;">${stat.label}</span>
            <span style="width: 25px; text-align: left; margin-right: 1px;">${statValue}</span>
            <div style="width: 100px; height: 8px;">
              <div style="width: ${barWidth}%; background-color: ${barColor}; height: 100%; border-radius: 4px;"></div>
            </div>
          </div>`;
      })
      .join('');

    // Get key moves from speciesInfoMap
    let keyMovesHtml = '';
    if (info && info.description) {
      const moveLines = info.description
        .split('\n')
        .map((line) => {
          let processedLine = line;
          let leadingSpaces = '';
          // Match optional leading whitespace, then the color prefix
          const colorMatch = line.match(/^\s*(Yellow|Blue|Red|Green|Purple|Orange|Brown|Black|White|Gray|Pink|LightBlue):/i);
          let colorStyle = '';
          if (colorMatch) {
            let color = colorMatch[1].toLowerCase();
            // Map specific keywords to custom color values
            const colorMap = {
              black: 'lightgray',
              blue: '#6890F0',
              green: '#78C850',
              purple: 'plum', // A lighter shade of purple
              red: '#F08030',
              yellow: '#F8D030',
            };
            const finalColor = colorMap[color] || color;
            colorStyle = `style="color: ${finalColor};"`;
            leadingSpaces = line.match(/^\s*/)[0];
            processedLine = line.replace(colorMatch[0], '').trim();
          }

          const trimmedLine = processedLine.trim();
          if (trimmedLine.length > 0 && !trimmedLine.toLowerCase().startsWith('note:') && !trimmedLine.toLowerCase().startsWith('key moves:')) {
            const formatMoveForUrl = (move) => encodeURIComponent(move.trim().toLowerCase().replace(/[_\s-]+/g, '-'));
            const parenIndex = processedLine.indexOf('(');
            const moveName = (parenIndex !== -1 ? processedLine.substring(0, parenIndex) : processedLine).trim();

            if (moveName) {
              const url = `/pokedex?move=${formatMoveForUrl(moveName)}&pokemon=${encodeURIComponent(player.name)}`;
              const link = `<a class=\"move-link\" href=\"${url}\" target=\"_blank\" rel=\"noopener noreferrer\">${moveName}</a>`;
              processedLine = processedLine.replace(moveName, link);
            }
          }

          // Wrap the processed line in a span with the color style if a color was found
          return colorStyle ? `<span ${colorStyle}>${leadingSpaces}${processedLine}</span>` : processedLine;
        })
        .join('\n');
      keyMovesHtml = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${moveLines}</pre>`;
    }

    // Only display the info text block if there is actual info to show besides the name.
    const hasInfoContent =
      abilitiesHtml.trim() !== '' ||
      statsHtml.trim() !== '' ||
      keyMovesHtml.trim() !== '' ||
      specialMechanicHtml.trim() !== '';

    let otherInfoHtml = '';
    if (hasInfoContent) {
      otherInfoHtml = `
        <div style="font-size: 0.9rem; display: flex; flex-direction: column; align-items: flex-start; margin-bottom: 0.5rem;">
          ${abilitiesHtml}
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px; margin-bottom: 0.5rem;">
          ${statsHtml}
        </div>
        <div style="font-size: 0.9rem;">${keyMovesHtml}</div>
      `;
    }

    const isDanger = dangerPokemon.includes(player.name);

    // Always display the name, and add other info if it exists.
    infoEl.innerHTML = `
      <div style="direction: ltr; text-align: left; padding-left: 1.5rem;">
        <style>.ability-link, .move-link { color: inherit; text-decoration: none; }</style>
        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem;">
          <span>${player.name}</span>
          ${
            specialMechanics[player.name]
              ? `<sl-button id="special-mechanic-btn" size="small" variant="neutral" title="Special Mechanic!" style="--sl-spacing-x-small: 0rem; width: 2rem;">
                   <img src="/generic/star.png" alt="Special Mechanic" style="height: 1.2rem; position: relative; top: 4px;"/>
                 </sl-button>`
              : ''
          }
          ${
            isDanger
              ? `<sl-button id="danger-btn" size="small" variant="neutral" title="Warning: High BST!" style="--sl-spacing-x-small: 0rem; width: 2rem;">
                   <img src="/generic/Danger.png" alt="Warning" style="height: 1.2rem; position: relative; top: 4px;"/>
                 </sl-button>`
              : ''
          }
        </div>
        ${otherInfoHtml}
      </div>
    `;
    infoEl.style.display = 'block';

    // Add event listener for the special mechanic button if it was rendered.
    const specialMechanicBtn = infoEl.querySelector('#special-mechanic-btn');
    if (specialMechanicBtn) {
      specialMechanicBtn.addEventListener('click', () => {
        const dialog = document.getElementById('specialMechanicDialog');
        const contentEl = document.getElementById('specialMechanicContent');
        const closeBtn = dialog.querySelector('sl-button[slot="footer"]'); // This is the button inside the dialog

        const description = specialMechanics[player.name];
        const lines = description.split('\n');
        const firstLine = lines.shift(); // Get and remove the first line
        const restOfLines = lines.join('\n');

        const styledDescription = `<span style="font-weight: bold; font-size: 1.1em;">${firstLine}</span>\n${restOfLines}`;
        contentEl.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${styledDescription}</pre>`;
        dialog.show();

        closeBtn.addEventListener('click', () => dialog.hide(), { once: true }); // Close on internal button click
      });
    }

    // Add event listener for the danger button if it was rendered.
    const dangerBtn = infoEl.querySelector('#danger-btn');
    if (dangerBtn) {
      dangerBtn.addEventListener('click', () => {
        const dialog = document.getElementById('specialMechanicDialog');
        const contentEl = document.getElementById('specialMechanicContent');
        const closeBtn = dialog.querySelector('sl-button[slot="footer"]');

        const message = `Warning: High BST!\nThis Pokémon has a Base Stat Total of 430 or above. It might not obey you until you've obtained 2 gym badges. (Before obtaining two badges, this pokemon has a 50% chance to disobey your command in battle.)`;
        const lines = message.split('\n');
        const firstLine = lines.shift();
        const restOfLines = lines.join('\n');
        const styledDescription = `<span style="font-weight: bold; font-size: 1.1em; color: var(--sl-color-danger-600);">${firstLine}</span>\n${restOfLines}`;
        contentEl.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${styledDescription}</pre>`;
        dialog.show();
        closeBtn.addEventListener('click', () => dialog.hide(), { once: true });
      });
    }

    // Add type icons below the base pokemon's image
    const imageTypesContainer = document.getElementById('pokemon-image-types');
    if (player.type) {
      const types = player.type.split(/[\s,\/]+/).filter((t) => t);
      const typeImagesHtml = types
        .map((type) => {
          const trimmedType = type.trim();
          return `<img src="/TypeIcons/${trimmedType}IC_SV.png" alt="${trimmedType}" title="${trimmedType}" style="height: 16px;">`;
        })
        .join('');
      imageTypesContainer.innerHTML = typeImagesHtml;
    } else {
      imageTypesContainer.innerHTML = ''; // Clear types for typeless Pokemon
    }

    // Build and display evolution chain based on CSV order
    const evolutions = [];

    // 1. Find the index of the base form for the selected Pokémon's family.
    const playerIndex = allPlayers.findIndex((p) => p.name === player.name);
    let baseIndex = -1;
    if (playerIndex !== -1) {
      for (let i = playerIndex; i >= 0; i--) {
        if (allPlayers[i].stage === 'base') {
          baseIndex = i;
          break;
        }
      }
    }

    // 2. Iterate forward from the base form to find all its evolutions.
    if (baseIndex !== -1) {
      for (let i = baseIndex + 1; i < allPlayers.length; i++) {
        const potentialEvo = allPlayers[i];
        // An evolution must not be a 'base' stage. Also, if the base form is a 'Basic' pokemon (like Mawile), it has no evolutions.
        if (potentialEvo.stage === 'base' || player.stage === 'Basic') {
          console.log(`[Evo Debug] Reached next base form '${potentialEvo.name}' or current is 'Basic'. Ending chain search.`);
          break; // Reached the next Pokémon family
        }
        // Any non-base Pokémon is considered an evolution in this family.
        if (potentialEvo.name !== player.name) {
          evolutions.push({ name: potentialEvo.name, info: potentialEvo });
        }
      }
    }

    console.log('[Evo Debug] Finished building evolution chain. Total evolutions found:', evolutions.length, evolutions);

    if (evolutions.length > 0) {
      console.log('[Evo Debug] Found evolutions, preparing to render them to the DOM.');
      infoContainer.style.display = 'flex'; // Show the container
      infoContainer.style.flexDirection = 'row'; // Arrange evolutions horizontally
      infoContainer.style.justifyContent = 'flex-start'; // Align to the start
      infoContainer.style.alignItems = 'flex-start'; // Align to the top

      // Configuration for all form changes.
      const formChanges = {
        Aggron: ['Mega Aggron'],
        Ampharos: ['Mega Ampharos'],
        Banette: ['Mega Banette'],
        Blaziken: ['Mega Blaziken'],
        Camerupt: ['Mega Camerupt'],
        Chandelure: ['Mega Chandelure'],
        Chesnaught: ['Mega Chesnaught'],
        Clefable: ['Mega Clefable'],
        Delphox: ['Mega Delphox'],
        Dragalge: ['Mega Dragalge'],
        Excadrill: ['Mega Excadrill'],
        Feraligatr: ['Mega Feraligatr'],
        Froslass: ['Mega Froslass'],
        Gallade: ['Mega Gallade'],
        Garchomp: ['Mega Garchomp'],
        Gardevoir: ['Mega Gardevoir'],
        Glalie: ['Mega Glalie'],
        Greninja: ['Mega Greninja'],
        Houndoom: ['Mega Houndoom'],
        Lopunny: ['Mega Lopunny'],
        Lucario: ['Mega Lucario'],
        Manectric: ['Mega Manectric'],
        Mawile: ['Mega Mawile'],
        Metagross: ['Mega Metagross'],
        Sableye: ['Mega Sableye'],
        Salamence: ['Mega Salamence'],
        Sceptile: ['Mega Sceptile'],
        Scizor: ['Mega Scizor'],
        Scolipede: ['Mega Scolipede'],
        Sharpedo: ['Mega Sharpedo'],
        Starmie: ['Mega Starmie'],
        Swampert: ['Mega Swampert'],
        Aegislash: ['Aegislash-Blade'],
        Castform: ['Castform-Sunny', 'Castform-Rainy', 'Castform-Snowy'],
        Minior: ['Minior-Core'],
        Rotom: ['Rotom-Heat', 'Rotom-Wash', 'Rotom-Frost', 'Rotom-Fan', 'Rotom-Mow'],
        Wishiwashi: ['Wishiwashi-School'],
      };

      // Configuration for special one-off arrows.
      const specialArrows = {
        Shedinja: 'Plus.png',
      };

      // Configuration for all split evolutions.
      // `base` is the Pokémon that has the split.
      // `branches` are the direct results of the split.
      const splitEvolutions = {
        Applin: ['Flapple', 'Appletun', 'Dipplin'],
        Cubone: ['Marowak', 'Marowak-Alola'],
        Dartrix: ['Decidueye', 'Decidueye-Hisui'],
        Espurr: ['Meowstic-M', 'Meowstic-F'],
        Exeggcute: ['Exeggutor', 'Exeggutor-Alola'],
        Eevee: ['Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
        Gloom: ['Vileplume', 'Bellossom'],
        Goomy: ['Sliggoo', 'Sliggoo-Hisui'],
        Kirlia: ['Gardevoir', 'Gallade'],
        'Mime Jr': ['Mr. Mime', 'Mr. Rime'],
        Pikachu: ['Raichu', 'Raichu-Alola'],
        Poliwhirl: ['Poliwrath', 'Politoed'],
        Rockruff: ['Lycanroc-Midday', 'Lycanroc-Midnight'],
        Scyther: ['Scizor', 'Kleavor'],
        Slowpoke: ['Slowbro-Galar', 'Slowking-Galar'],
        Snorunt: ['Glalie', 'Froslass'],
        Toxel: ['Toxtricity-Amped', 'Toxtricity-Low_Key'],
        Tyrogue: ['Hitmonlee', 'Hitmonchan', 'Hitmontop'],
      };
      const evoNames = evolutions.map(evo => evo.name);
      let splitBranches = [];
      let isSplit = false;
      let formBranches = [];
      let isFormChange = false;

      // Find if the current evolution chain contains a defined split.
      for (const base in formChanges) {
        const branches = formChanges[base];
        if (branches.every(branch => evoNames.includes(branch))) {
          isFormChange = true;
          formBranches = branches;
          break;
        }
      }

      for (const base in splitEvolutions) {
        const branches = splitEvolutions[base];
        // Check if all defined branches for a base are present in the evolution list.
        if (branches.every(branch => evoNames.includes(branch))) {
          isSplit = true;
          splitBranches = branches;
          break;
        }
      }

      evolutions.forEach((evo, index) => {
        // Determine which arrow to use for this specific evolution.
        let arrowImage = 'Arrow.png'; // Default to the standard arrow.
        if (specialArrows[evo.name]) {
          arrowImage = specialArrows[evo.name];
        } else if (isFormChange && formBranches.includes(evo.name)) {
          arrowImage = 'FormArrow.png';
        } else if (isSplit && splitBranches.includes(evo.name)) {
          arrowImage = 'SplitArrow.png';
        }

        const arrowHtml = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80px; gap: 0.5rem; margin-top: 1rem; margin-left: 0.1rem; margin-right: 0.1rem;">
            <img src="/generic/${arrowImage}" alt="Evolves to" style="width: 24px; height: 24px;">
            <div style="font-size: 0.7rem; text-align: center; width: 70px;">${evo.info.evolution_method || ''}</div>
          </div>
        `;
        infoContainer.insertAdjacentHTML('beforeend', arrowHtml);

        let imageName = evo.name;
        // Handle Mega Evolution naming convention ("Mega Pokemon" -> "Pokemon-Mega")
        if (imageName.startsWith('Mega ')) {
          console.log(`[Mega Debug] Detected Mega Evolution: '${evo.name}'.`);
          const parts = imageName.split(' ');
          imageName = `${parts[1]}-Mega`;
          console.log(`[Mega Debug] Transformed name to: '${imageName}'.`);
        }
        // Standardize name for image files: replace problematic characters but preserve case.
        imageName = imageName.replace(/\. /g, '_').replace(/ /g, '_');
        const imagePath = `/evolutions/${imageName}.png`;
        console.log(`[Evo Debug] Rendering evolution '${evo.name}'. Image path: '${imagePath}'`);

        // Get types and create vertically stacked image tags
        let typeImagesHtml = '';
        if (evo.info.type) {
          const types = evo.info.type.split(/[\s,\/]+/).filter((t) => t);
          typeImagesHtml = types
            .map((type) => {
              const trimmedType = type.trim();
              return `<img src="/TypeIcons/${trimmedType}IC_SV.png" alt="${trimmedType}" title="${trimmedType}" style="height: 16px;">`;
            })
            .join('');
        }

        // Get abilities and create vertically stacked divs
        const evoAbilityDivs = [];
        if (evo.info.ability1) {
          const abilityName = evo.info.ability1.trim();
          evoAbilityDivs.push(`<div><a class="ability-link" href="/pokedex?ability=${formatAbilityForUrl(abilityName)}&pokemon=${encodeURIComponent(evo.name)}" target="_blank" rel="noopener noreferrer">${abilityName}</a></div>`);
        }
        if (evo.info.ability2) {
          const abilityName = evo.info.ability2.trim();
          evoAbilityDivs.push(`<div><a class="ability-link" href="/pokedex?ability=${formatAbilityForUrl(abilityName)}&pokemon=${encodeURIComponent(evo.name)}" target="_blank" rel="noopener noreferrer">${abilityName}</a></div>`);
        }
        if (evo.info.hidden_ability) {
          const abilityName = evo.info.hidden_ability.trim();
          evoAbilityDivs.push(
            `<div><a class="ability-link" href="/pokedex?ability=${formatAbilityForUrl(abilityName)}&pokemon=${encodeURIComponent(evo.name)}" target="_blank" rel="noopener noreferrer">${abilityName}</a> (H)</div>`,
          );
        }
        const abilitiesHtml = evoAbilityDivs.join('');

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
              <div style="display: flex; align-items: center; font-size: 0.7rem;">
                <span style="width: 35px; text-align: right; font-weight: bold; margin-right: 4px;">${stat.label}</span>
                <span style="width: 25px; text-align: left; margin-right: 1px;">${statValue}</span>
                <div style="width: 100px; height: 8px;">
                  <div style="width: ${barWidth}%; background-color: ${barColor}; height: 100%; border-radius: 4px;"></div>
                </div>
              </div>`;
          })
          .join('');
        const evolutionHtml = `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; text-align: center; width: 140px;">
            <div style="flex-shrink: 0; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;">
              <img src="${imagePath}" alt="${evo.name}" title="${evo.name}" style="max-width: 100%; max-height: 100%; object-fit: contain;"
                   loading="lazy" decoding="async" onerror="this.onerror=null; this.style.display='none'; console.error('[Evo Debug] Failed to load image at path: ${imagePath}')" />
            </div>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 0.1rem;">${typeImagesHtml}</div>
            <div style="font-size: 0.8rem; display: flex; flex-direction: column; align-items: center;">
              ${abilitiesHtml}
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-left: 3rem;">
              ${statsHtml}
            </div>
          </div>
        `;
        infoContainer.insertAdjacentHTML('beforeend', evolutionHtml);
      });
    }
  } else {
    console.log('[Evo Debug] displayPlayerAuctionInfo called with no player, name, or allPlayers list. Aborting.');
  }
}

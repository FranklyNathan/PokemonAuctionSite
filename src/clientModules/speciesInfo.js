/**
 * Fetches and parses the speciesinfo.txt file.
 * The file is expected to have blocks of text for each Pokémon,
 * with the Pokémon's name on a line by itself.
 * @returns {Promise<Map<string, string>>} A map of Pokémon names to their info.
 */
export async function fetchAndParseSpeciesInfo() {
  const speciesInfoMap = new Map();
  try {
    const response = await fetch('/assets/speciesinfo.txt');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    // Each Pokémon entry is separated by at least one blank line.
    const pokemonBlocks = text.split(/\r?\n\s*\r?\n/);

    for (const block of pokemonBlocks) {
      if (block.trim() === '') continue;
      const blockLines = block.split(/\r?\n/);
      // The first line of a block is the Pokémon's name.
      const pokemonName = blockLines[0].trim();
      // The rest of the lines are the info.
      const info = blockLines.slice(1).join('\n');
      if (pokemonName) {
        speciesInfoMap.set(pokemonName, info.trim());
      }
    }
  } catch (e) {
    console.error('Failed to load or parse speciesinfo.txt:', e);
  }
  return speciesInfoMap;
}

/**
 * Updates the UI to display the auctioned player's image and species info.
 * @param {object} player - The player object from the players table.
 * @param {Map<string, string>} speciesInfoMap - The parsed species info.
 */
export function displayPlayerAuctionInfo(player, speciesInfoMap) {
  const imageEl = document.getElementById('pokemon-image');
  const infoEl = document.getElementById('species-info-text');

  if (player && player.name) {
    const info = speciesInfoMap.get(player.name);
    infoEl.textContent = info || 'No additional info available.';
    infoEl.style.display = 'block';
  } else {
    infoEl.style.display = 'none';
  }
}
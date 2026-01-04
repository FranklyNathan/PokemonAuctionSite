const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const csvPath = path.join(root, 'Pok.csv');
const speciesPath = path.join(root, 'assets', 'speciesinfo.txt');
const gen7Path = path.join(root, 'src', 'data', 'gen_7.h');
const teachablePath = path.join(root, 'src', 'data', 'teachable_learnsets.h');
const outPath = path.join(root, 'src', 'data', 'pokedex.json');

// List of TMs available at Slateport Market
const SLATEPORT_TMS = [
  'BULLET_SEED', 'HAIL', 'SAFEGUARD', 'SANDSTORM', 'SKILL_SWAP', 'STEEL_WING', 
  'THIEF', 'TORMENT', 'TRICK_ROOM', 'DOUBLE_TEAM', 'LIGHT_SCREEN', 'REFLECT', 
  'REST', 'BRICK_BREAK', 'DAZZLING_GLEAM', 'DIG', 'DRAGON_CLAW', 'GIGA_DRAIN', 
  'HYPER_BEAM', 'IRON_TAIL', 'RAIN_DANCE', 'SHADOW_BALL', 'SNARL', 'SOLAR_BEAM', 
  'SUNNY_DAY', 'X_SCISSOR', 'BLIZZARD', 'FIRE_BLAST', 'FLAMETHROWER', 'ICE_BEAM', 
  'SLUDGE_BOMB', 'THUNDERBOLT', 'THUNDER', 'PROTECT', 'PSYCHIC', 'EARTHQUAKE', 
  'HONE_CLAWS'
];

// HMs we use
const VALID_HMS = ['FLY', 'SURF', 'ROCK_SMASH', 'WATERFALL'];

function readCSV(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(',');
  return lines.map((line) => {
    const parts = line.split(',');
    const row = {};
    header.forEach((h, i) => (row[h] = parts[i] ?? ''));
    return row;
  });
}

function parseSpeciesInfo(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const map = new Map();
  let current = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line === 'Key Moves:') continue;
    
    // Pokemon name line
    if (!line.startsWith('-') && !line.startsWith('*') && !line.includes('(') && !line.startsWith('   ')) {
      current = line.trim();
      map.set(current, []);
      continue;
    }
    
    // Egg move line
    if (current && line.startsWith('') && /\(Egg\)/i.test(line)) {
      const entry = line.replace(/^[-*\s]+/, '');
      if (!entry) continue;
      const moveName = entry.split('(')[0].trim();
      map.get(current).push(moveName);
    }
  }
  return map;
}

function parseLevelUpMoves(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const map = new Map();
  let currentSpecies = null;
  let currentMoves = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Match learnset definition: "static const struct LevelUpMove sBulbasaurLevelUpLearnset[] = {"
    const learnsetMatch = line.match(/static const struct LevelUpMove s(\w+)LevelUpLearnset\[\]/);
    if (learnsetMatch) {
      // Save previous species if exists
      if (currentSpecies && currentMoves.length > 0) {
        map.set(currentSpecies, currentMoves);
      }
      currentSpecies = learnsetMatch[1];
      currentMoves = [];
      continue;
    }
    
    // Match move line: "LEVEL_UP_MOVE(25, MOVE_FIRE_FANG),"
    const moveMatch = line.match(/LEVEL_UP_MOVE\(\s*(\d+),\s*MOVE_(\w+)\)/);
    if (moveMatch && currentSpecies) {
      const level = parseInt(moveMatch[1]);
      const move = moveMatch[2];
      // Convert MOVE_FIRE_FANG -> Fire Fang
      const moveName = move.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
      currentMoves.push({ level, name: moveName });
    }
    
    // End of learnset
    if (line.includes('LEVEL_UP_END') && currentSpecies) {
      map.set(currentSpecies, currentMoves);
      currentSpecies = null;
      currentMoves = [];
    }
  }
  
  return map;
}

function parseTeachableMoves(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const map = new Map();
  let currentSpecies = null;
  let inTeachableBlock = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Match: "static const u16 sBulbasaurTeachableLearnset[] = {"
    const teachableMatch = line.match(/static const u16 s(\w+)TeachableLearnset\[\]/);
    if (teachableMatch) {
      if (currentSpecies && map.has(currentSpecies)) {
        // Species done
      }
      currentSpecies = teachableMatch[1];
      map.set(currentSpecies, []);
      inTeachableBlock = true;
      continue;
    }
    
    // End of teachable block
    if (line === '};' && inTeachableBlock) {
      inTeachableBlock = false;
      currentSpecies = null;
      continue;
    }
    
    // Match move: "MOVE_HONE_CLAWS,"
    if (inTeachableBlock && currentSpecies) {
      const moveMatch = line.match(/MOVE_(\w+)/);
      if (moveMatch) {
        const move = moveMatch[1];
        // Check if it's a valid TM or HM
        if (SLATEPORT_TMS.includes(move) || VALID_HMS.includes(move)) {
          const moveName = move.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
          map.get(currentSpecies).push(moveName);
        }
      }
    }
  }
  
  return map;
}

console.log('Reading CSV...');
const rows = readCSV(csvPath).filter(row => row.name !== 'Egg');

console.log('Parsing egg moves...');
const eggMoves = parseSpeciesInfo(speciesPath);

console.log('Parsing level-up moves...');
const levelUpMoves = parseLevelUpMoves(gen7Path);

console.log('Parsing TM/HM moves...');
const teachableMoves = parseTeachableMoves(teachablePath);

// Load hardcoded evolution data
const evolutionsPath = path.join(__dirname, '../src/data/evolutions.json');
let evolutionFamilies = {};
if (fs.existsSync(evolutionsPath)) {
  const evolutionData = JSON.parse(fs.readFileSync(evolutionsPath, 'utf-8'));
  evolutionFamilies = evolutionData.families || {};
}

// Create a lookup map: pokemon name -> family key
const pokemonToFamily = {};
for (const familyKey in evolutionFamilies) {
  const family = evolutionFamilies[familyKey];
  family.members.forEach(member => {
    pokemonToFamily[member] = familyKey;
  });
}

// Split evolution configuration - same as frontend
const SPLIT_EVOLUTIONS = {
  Applin: ['Flapple', 'Appletun', 'Dipplin'],
  Cubone: ['Marowak', 'Marowak-Alola'],
  Dartrix: ['Decidueye', 'Decidueye-Hisui'],
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

// Helper function to find evolution chain for a given pokémon
function getEvolutionsForPokemon(currentIdx) {
  const currentRow = rows[currentIdx];
  const currentName = currentRow.name;
  
  // Check if this Pokémon belongs to a hardcoded family
  const familyKey = pokemonToFamily[currentName];
  if (familyKey && evolutionFamilies[familyKey]) {
    const family = evolutionFamilies[familyKey];
    const tree = family.tree;
    const currentIndex = tree.findIndex(e => e.name === currentName);
    
    if (currentIndex !== -1) {
      // Build the evolution array with proper isBase flags
      const allEvos = tree.map((evo, idx) => {
        let imageName = evo.name;
        if (imageName.startsWith('Mega ')) {
          const parts = imageName.split(' ');
          imageName = `${parts[1]}-Mega`;
        }
        imageName = imageName.replace(/ /g, '_');
        
        return {
          name: evo.name,
          method: evo.method,
          image: `${imageName}.png`,
          isBase: idx < currentIndex
        };
      }).filter((e, idx) => idx !== currentIndex); // Exclude current Pokémon
      
      return allEvos;
    }
  }
  
  // Fall back to auto-generation if not hardcoded
  const allInFamily = [];
  
  // Find the base form of this evolution family
  let baseIdx = currentIdx;
  
  // If this is an evolved form, search backwards to find the base form
  if (currentRow.stage && currentRow.stage !== 'base') {
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (rows[i].stage === 'base') {
        baseIdx = i;
        break;
      }
    }
  }
  
  // Build the full family list first
  const fullFamily = [];
  
  // Add the base form
  const baseRow = rows[baseIdx];
  let baseImageName = baseRow.name;
  if (baseImageName.startsWith('Mega ')) {
    const parts = baseImageName.split(' ');
    baseImageName = `${parts[1]}-Mega`;
  }
  baseImageName = baseImageName.replace(/ /g, '_');
  
  fullFamily.push({
    name: baseRow.name,
    method: '',
    image: `${baseImageName}.png`,
    idx: baseIdx
  });
  
  // Add all evolutions from the base form
  for (let i = baseIdx + 1; i < rows.length; i++) {
    const potentialEvo = rows[i];
    
    // Stop if we hit the next base form
    if (potentialEvo.stage === 'base') {
      break;
    }
    
    let imageName = potentialEvo.name;
    // Handle Mega Evolution naming: "Mega Aggron" -> "Aggron-Mega"
    if (imageName.startsWith('Mega ')) {
      const parts = imageName.split(' ');
      imageName = `${parts[1]}-Mega`;
    }
    // Standardize underscores for spaces
    imageName = imageName.replace(/ /g, '_');
    
    fullFamily.push({
      name: potentialEvo.name,
      method: potentialEvo.evolution_method || '',
      image: `${imageName}.png`,
      idx: i
    });
  }
  
  // Check if current pokemon is part of a split branch
  let isInBranch = false;
  let branchBase = null;
  let siblingBranches = [];
  
  for (const base in SPLIT_EVOLUTIONS) {
    const branches = SPLIT_EVOLUTIONS[base];
    if (branches.includes(currentName)) {
      // We're viewing a branch member - filter out siblings and their descendants
      isInBranch = true;
      branchBase = base;
      siblingBranches = branches.filter(b => b !== currentName);
      break;
    }
  }
  
  // Filter the family based on split evolution logic
  let filteredFamily = fullFamily;
  
  if (isInBranch) {
    // We're in a specific branch - remove siblings and their Mega forms
    filteredFamily = fullFamily.filter(member => {
      // Keep if it's not a sibling
      if (siblingBranches.includes(member.name)) {
        return false;
      }
      
      // Check if it's a Mega of a sibling
      if (member.name.startsWith('Mega ')) {
        const megaBase = member.name.substring(5).split(' ')[0];
        if (siblingBranches.includes(megaBase)) {
          return false;
        }
      } else if (member.name.includes('-Mega')) {
        const megaBase = member.name.split('-')[0];
        if (siblingBranches.includes(megaBase)) {
          return false;
        }
      }
      
      return true;
    });
  }
  // If not in a branch, show everything (ancestors before split see all branches and their megas)
  
  // Now filter to exclude current Pokémon and mark pre/post evolutions
  return filteredFamily
    .filter(p => p.idx !== currentIdx)
    .map(p => ({
      name: p.name,
      method: p.method,
      image: p.image,
      isBase: p.idx < currentIdx  // Mark as "base" if it comes before current in the chain
    }));
}

console.log('Building result...');
const result = rows.map((row, idx) => {
  const name = row.name || `Unknown-${idx + 1}`;
  const types = (row.type || '').split('/').filter(Boolean);
  
  // Parse abilities with hidden flag
  const abilities = [];
  if (row.ability1) abilities.push({ name: row.ability1, hidden: false });
  if (row.ability2) abilities.push({ name: row.ability2, hidden: false });
  if (row.hidden_ability) abilities.push({ name: row.hidden_ability, hidden: true });
  
  const stats = {
    hp: Number(row.hp) || 0,
    atk: Number(row.attack) || 0,
    def: Number(row.defense) || 0,
    spa: Number(row.sp_attack) || 0,
    spd: Number(row.sp_defense) || 0,
    spe: Number(row.speed) || 0,
  };
  
  // Check if this is a mega form
  const isMega = row.stage === 'mega' || name.startsWith('Mega ') || name.includes('-Mega');
  let baseFormName = name;
  
  // Find base form name for mega forms
  if (isMega) {
    if (name.startsWith('Mega ')) {
      // "Mega Charizard" -> "Charizard"
      baseFormName = name.substring(5).split(' ')[0];
    } else if (name.includes('-Mega')) {
      // "Charizard-Mega_X" -> "Charizard"
      baseFormName = name.split('-')[0];
    }
  }
  
  // Get level-up moves (use base form for megas)
  const levelMoves = levelUpMoves.get(isMega ? baseFormName : name) || [];
  const moves = levelMoves.map(m => ({
    name: m.name,
    type: types[0] || 'Normal',
    category: 'Status',
    power: 0,
    accuracy: 0,
    pp: 0,
    source: 'Level',
    level: m.level,
  }));
  
  // Get egg moves from the base form of the family for all members
  let familyBaseName = name;
  // Try to get the family key for this mon
  const famKey = pokemonToFamily[name];
  if (famKey && evolutionFamilies[famKey] && evolutionFamilies[famKey].tree && evolutionFamilies[famKey].tree.length > 0) {
    familyBaseName = evolutionFamilies[famKey].tree[0].name;
  } else if (isMega) {
    familyBaseName = baseFormName;
  }
  const eggs = eggMoves.get(familyBaseName) || [];
  eggs.forEach(moveName => {
    moves.push({
      name: moveName,
      type: types[0] || 'Normal',
      category: 'Status',
      power: 0,
      accuracy: 0,
      pp: 0,
      source: 'Egg',
      level: null,
    });
  });
  
  // Get TM/HM moves (use base form for megas)
  const tms = teachableMoves.get(isMega ? baseFormName : name) || [];
  const tmList = tms.map(moveName => ({
    name: moveName,
    type: types[0] || 'Normal',
    category: 'Status',
    power: 0,
    accuracy: 0,
    pp: 0,
    source: 'TM',
    level: null,
  }));
  
  // Add TMs to moves array too
  moves.push(...tmList);

  // Build evolution chain (use base form for megas)
  let evolutions = getEvolutionsForPokemon(idx);
  
  // For mega forms, also copy evolutions from base form
  if (isMega && evolutions.length === 0) {
    // Find the base form in the rows
    const baseFormIdx = rows.findIndex(r => r.name === baseFormName && r.stage !== 'mega');
    if (baseFormIdx !== -1) {
      evolutions = getEvolutionsForPokemon(baseFormIdx);
    }
  }

  return {
    dex: Number(row.dex_number) || -1,
    name,
    types,
    abilities,
    stats,
    moves,
    tm: tmList,
    stage: row.stage || '',
    evolution_method: row.evolution_method || '',
    mega: row.mega || '',
    meta: 'dummy dex; move stats dummy when not available',
  };
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`✓ Wrote ${result.length} entries to ${outPath}`);
console.log(`✓ Parsed ${levelUpMoves.size} level-up learnsets`);
console.log(`✓ Parsed ${eggMoves.size} egg move sets`);
console.log(`✓ Parsed ${teachableMoves.size} TM/HM learnsets`);

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const csvPath = path.join(root, 'Pok.csv');
const speciesPath = path.join(root, 'assets', 'speciesinfo.txt');
const gen7Path = path.join(root, 'src', 'data', 'gen_7.h');
const teachablePath = path.join(root, 'src', 'data', 'teachable_learnsets.h');
const outPath = path.join(root, 'src', 'data', 'pokedex.json');
const evolutionsPath = path.join(root, 'src', 'data', 'evolutions.json');

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

let evolutionFamilies = {};
if (fs.existsSync(evolutionsPath)) {
  const evolutionData = JSON.parse(fs.readFileSync(evolutionsPath, 'utf-8'));
  evolutionFamilies = evolutionData.families || {};
}

// Create a lookup map: pokemon name -> family key
const pokemonToFamily = {};
for (const familyKey in evolutionFamilies) {
  const family = evolutionFamilies[familyKey];
  if (family.members) {
    family.members.forEach(member => {
      pokemonToFamily[member] = familyKey;
    });
  }
}

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
    
    // Egg move line (handles (Egg), (Egg/TM), (Egg/MR), etc)
    if (current && /\(Egg(\/|,|\)| )/i.test(line)) {
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
    
    // Ignore commented out LEVEL_UP_MOVE lines
    if (/^\s*\/\/\s*LEVEL_UP_MOVE/.test(line)) {
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


console.log('Building result...');
const result = rows.map((row, idx) => {
  let name = row.name || `Unknown-${idx + 1}`;
  // Special case for Mega Charizard X and Mega Raichu X
  if (name.toLowerCase() === 'charizard-mega_x') name = 'Mega Charizard X';
  if (name.toLowerCase() === 'raichu-mega_x') name = 'Mega Raichu X';
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
  
  // Normalize form names for gen_7.h lookup (e.g., Ninetales-Alola -> NinetalesAlola)
  function normalizeFormName(n) {
    // Hardcoded base forms that need to lookup their Galarian/Alolan movesets
    const hardcodedForms = {
      Sandshrew: 'SandshrewAlola',
      Zigzagoon: 'ZigzagoonGalar',
      Vulpix: 'VulpixAlola',
      Slowpoke: 'SlowpokeGalar',
      'Mr. Mime': 'MrMime',
      'Mr. Mime-Galar': 'MrMimeGalar',
      'Mime Jr': 'MimeJr',
      'Mr. Rime': 'MrRime'
    };
    if (hardcodedForms[n]) return hardcodedForms[n];
    return n.replace(/-(Alola|Galar)$/i, (_, form) => form.charAt(0).toUpperCase() + form.slice(1));
  }
  const lookupName = normalizeFormName(isMega ? baseFormName : name);
  const levelMoves = levelUpMoves.get(lookupName) || [];
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
  
  // Get egg moves for all members of the same family
  let famKey = null;
  if (typeof pokemonToFamily !== 'undefined' && pokemonToFamily[name]) {
    famKey = pokemonToFamily[name]; 
  }
  let familyMembers = famKey && evolutionFamilies[famKey] ? evolutionFamilies[famKey].members : [name];
  let eggMoveSet = new Set(); 
  familyMembers.forEach(member => {
    if(name === "Mega Charizard X"){
      eggMoveSet.add("Dragon Dance");
    } else if(name === "Corsola-Galar" || name === "Cursola"){
      eggMoveSet.add("Destiny Bond");
    } else {
      const memberEggs = eggMoves.get(member) || [];
      memberEggs.forEach(move => eggMoveSet.add(move));
    }
    
  });
  
  eggMoveSet.forEach(moveName => {
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
  
  // Get TM/HM moves (use normalized name as for level-up moves)
  const tmLookupName = normalizeFormName(isMega ? baseFormName : name);
  const tms = teachableMoves.get(tmLookupName) || [];
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

  return {
    dex: Number(row.dex_number) || -1,
    name,
    types,
    abilities,
    stats,
    moves,
    tm: tmList,
    stage: row.stage || '',
  };
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`✓ Wrote ${result.length} entries to ${outPath}`);
console.log(`✓ Parsed ${levelUpMoves.size} level-up learnsets`);
console.log(`✓ Parsed ${eggMoves.size} egg move sets`);
console.log(`✓ Parsed ${teachableMoves.size} TM/HM learnsets`);

const fs = require('fs');
const path = require('path');

const dataFile = path.resolve(__dirname, '../data.json');
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

// 1. Extract 30 Brush Fill Presets as first-class materials
const brushFillMaterials = {};
for (const [id, bf] of Object.entries(data.brushFillPresets || {})) {
  const matId = id.startsWith('bf_') ? id : `bf_${id}`;
  brushFillMaterials[matId] = {
    $schema: 'esenho/material/v1',
    id: matId,
    name: bf.name,
    category: 'brushfills',
    desc: bf.desc || 'Procedural vector brush stroke fill with dynamic physics',
    color: bf.color || (bf.brushFill?.colorPalette && bf.brushFill.colorPalette[0]) || '#fabd2f',
    mode: 'brushfill',
    brushFill: {
      ...bf.brushFill,
      enabled: true
    },
    builtin: true
  };
}

// 2. Rich Standard Materials across Categories
const standardMaterials = {
  // ── Artistic & Traditional ──
  art_watercolor: {
    $schema: 'esenho/material/v1',
    id: 'art_watercolor',
    name: 'Soft Watercolor Wash',
    category: 'artistic',
    desc: 'Organic translucent watercolor wash with paper grain and soft edge bleed',
    color: '#83a598',
    alpha: 0.85,
    mode: 'standard',
    texture: {
      mode: 8, // Perlin Liquid
      scale: 120,
      angle: 0,
      contrast: 110,
      grain: 40,
      hardness: 25,
      hardnessIntensity: 80,
      warpStrength: 10,
      warpFreq: 15,
      noiseDistort: 5
    },
    filter: {
      enabled: true,
      plugin: 'oil_paint',
      target: 'fill',
      p1: 4,
      p2: 8,
      opacity: 0.9
    },
    builtin: true
  },
  art_impasto: {
    $schema: 'esenho/material/v1',
    id: 'art_impasto',
    name: 'Kuwahara Impasto Oil',
    category: 'artistic',
    desc: 'Thick painterly oil impasto brushwork with Kuwahara anisotropic smoothing',
    color: '#fabd2f',
    mode: 'standard',
    texture: {
      mode: 36, // Impasto Knife Peaks
      scale: 100,
      contrast: 130,
      grain: 45,
      hardness: 95
    },
    filter: {
      enabled: true,
      plugin: 'kuwahara',
      target: 'fill',
      p1: 5,
      p2: 0,
      opacity: 1.0
    },
    builtin: true
  },
  art_palette_knife: {
    $schema: 'esenho/material/v1',
    id: 'art_palette_knife',
    name: 'Oil Paint Palette Knife',
    category: 'artistic',
    desc: 'Expressive knife ridges with rich relief and heavy impasto peaks',
    color: '#d79921',
    mode: 'standard',
    texture: {
      mode: 36,
      scale: 130,
      angle: 25,
      contrast: 140,
      grain: 50,
      hardness: 95
    },
    filter: {
      enabled: true,
      plugin: 'oil_paint',
      target: 'fill',
      p1: 6,
      p2: 12,
      opacity: 1.0
    },
    builtin: true
  },
  art_matte_gouache: {
    $schema: 'esenho/material/v1',
    id: 'art_matte_gouache',
    name: 'Matte Designer Gouache',
    category: 'artistic',
    desc: 'Opaque flat gouache with soft chalk tooth and velvet surface finish',
    color: '#fb4934',
    mode: 'standard',
    texture: {
      mode: 32, // Noise Dissolve
      scale: 85,
      contrast: 115,
      grain: 35,
      hardness: 90
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  art_charcoal: {
    $schema: 'esenho/material/v1',
    id: 'art_charcoal',
    name: 'Vine Charcoal on Cold-Press',
    category: 'artistic',
    desc: 'Deep carbon crumbly sketch texture with rough paper grain tooth',
    color: '#1d2021',
    alpha: 0.95,
    mode: 'standard',
    texture: {
      mode: 32,
      scale: 110,
      contrast: 150,
      grain: 80,
      hardness: 60,
      noiseDistort: 25
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  art_manga_cel: {
    $schema: 'esenho/material/v1',
    id: 'art_manga_cel',
    name: 'Manga Screentone Cel',
    category: 'artistic',
    desc: 'Authentic 45° dot screentone matrix with crisp cel threshold',
    color: '#ebdbb2',
    mode: 'standard',
    texture: {
      mode: 31, // Dot Screentone
      scale: 80,
      angle: 45,
      contrast: 200,
      grain: 0,
      hardness: 100,
      posterize: 3
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  art_comic_cel: {
    $schema: 'esenho/material/v1',
    id: 'art_comic_cel',
    name: '4-Level Comic Cel Shading',
    category: 'artistic',
    desc: 'Sharp stepped pop-art cel shading bands with halftone dot matrix',
    color: '#fe8019',
    mode: 'standard',
    texture: {
      mode: 31,
      scale: 70,
      angle: 30,
      contrast: 180,
      hardness: 100,
      posterize: 4
    },
    filter: {
      enabled: true,
      plugin: 'halftone',
      target: 'fill',
      p1: 6,
      p2: 45,
      opacity: 1.0
    },
    builtin: true
  },
  art_engraving: {
    $schema: 'esenho/material/v1',
    id: 'art_engraving',
    name: 'Vintage Copperplate Engraving',
    category: 'artistic',
    desc: 'Fine hatched antique parchment etching with warm sepia tonality',
    color: '#ebdbb2',
    mode: 'standard',
    texture: {
      mode: 38, // Hatch Diagonal
      scale: 110,
      angle: 45,
      contrast: 180,
      grain: 10,
      hardness: 100,
      warpStrength: 5,
      warpFreq: 20
    },
    filter: {
      enabled: true,
      plugin: 'sepia',
      target: 'fill',
      p1: 85,
      p2: 0,
      opacity: 0.95
    },
    builtin: true
  },
  art_crosshatch: {
    $schema: 'esenho/material/v1',
    id: 'art_crosshatch',
    name: 'Crosshatch Ink Sketch',
    category: 'artistic',
    desc: 'Crisp technical pen crosshatch grid with algorithmic filter alignment',
    color: '#282828',
    mode: 'standard',
    texture: {
      mode: 38,
      scale: 90,
      angle: 0,
      contrast: 160,
      grain: 15
    },
    filter: {
      enabled: true,
      plugin: 'crosshatch',
      target: 'fill',
      p1: 4,
      p2: 0,
      opacity: 1.0
    },
    builtin: true
  },
  art_sumie: {
    $schema: 'esenho/material/v1',
    id: 'art_sumie',
    name: 'Sumi-e Charcoal Ink Wash',
    category: 'artistic',
    desc: 'Japanese carbon ink dispersion on raw fibrous Xuan rice paper',
    color: '#1d2021',
    alpha: 0.9,
    mode: 'standard',
    texture: {
      mode: 8,
      scale: 110,
      contrast: 160,
      grain: 30,
      hardness: 40,
      hardnessIntensity: 70
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  art_pastel: {
    $schema: 'esenho/material/v1',
    id: 'art_pastel',
    name: 'Chalk & Pastel Grain',
    category: 'artistic',
    desc: 'Dry crumbly chalkboard pastel pigment with velvety surface tooth',
    color: '#fbf1c7',
    mode: 'standard',
    texture: {
      mode: 32,
      scale: 90,
      contrast: 130,
      grain: 75,
      hardness: 60,
      noiseDistort: 30
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  art_linocut: {
    $schema: 'esenho/material/v1',
    id: 'art_linocut',
    name: 'Japanese Linocut Woodblock',
    category: 'artistic',
    desc: 'Hand-carved relief printing gouges with high contrast black ink stamping',
    color: '#282828',
    mode: 'standard',
    texture: {
      mode: 42,
      scale: 95,
      angle: 15,
      contrast: 175,
      grain: 20,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'dither',
      target: 'fill',
      p1: 60,
      p2: 0,
      opacity: 0.85
    },
    builtin: true
  },
  art_denim: {
    $schema: 'esenho/material/v1',
    id: 'art_denim',
    name: 'Heavy Denim Twill Weave',
    category: 'artistic',
    desc: 'Diagonal indigo textile weave with slub yarn texture',
    color: '#458588',
    mode: 'standard',
    texture: {
      mode: 35,
      scale: 90,
      angle: 45,
      contrast: 120,
      grain: 30,
      hardness: 95
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  art_burlap: {
    $schema: 'esenho/material/v1',
    id: 'art_burlap',
    name: 'Coarse Jute Burlap',
    category: 'artistic',
    desc: 'Rough interlocking rustic fiber sackcloth textile',
    color: '#a89984',
    mode: 'standard',
    texture: {
      mode: 41,
      scale: 100,
      contrast: 135,
      grain: 55,
      hardness: 90
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  vintage_paper: {
    $schema: 'esenho/material/v1',
    id: 'vintage_paper',
    name: 'Vintage Canvas Paper',
    category: 'artistic',
    desc: 'Tea-stained antique animal skin parchment with natural micro-creasing',
    color: '#ebdbb2',
    mode: 'standard',
    texture: {
      mode: 8,
      scale: 130,
      contrast: 110,
      grain: 45,
      hardness: 50,
      warpStrength: 8,
      warpFreq: 12
    },
    filter: {
      enabled: true,
      plugin: 'sepia',
      target: 'fill',
      p1: 60,
      p2: 0,
      opacity: 0.8
    },
    builtin: true
  },

  // ── Metals & Shaders ──
  solid_gold: {
    $schema: 'esenho/material/v1',
    id: 'solid_gold',
    name: '24K Brushed Gold Ingot',
    category: 'metal',
    desc: 'Polished yellow gold with fine directional milling streaks and warm bloom luster',
    color: '#fabd2f',
    mode: 'standard',
    texture: {
      mode: 38,
      scale: 60,
      angle: 15,
      contrast: 140,
      grain: 20,
      hardness: 95
    },
    filter: {
      enabled: true,
      plugin: 'bloom',
      target: 'fill',
      p1: 15,
      p2: 90,
      opacity: 0.95
    },
    builtin: true
  },
  metal_liquid_mercury: {
    $schema: 'esenho/material/v1',
    id: 'metal_liquid_mercury',
    name: 'Liquid Chrome Mercury',
    category: 'metal',
    desc: 'Molten reflective liquid mercury with warped fluid surface ripples',
    color: '#ebdbb2',
    mode: 'standard',
    texture: {
      mode: 8,
      scale: 150,
      angle: 0,
      contrast: 160,
      grain: 0,
      hardness: 100,
      warpStrength: 25,
      warpFreq: 30
    },
    filter: {
      enabled: true,
      plugin: 'bloom',
      target: 'fill',
      p1: 20,
      p2: 110,
      opacity: 1.0
    },
    builtin: true
  },
  metal_damascus_steel: {
    $schema: 'esenho/material/v1',
    id: 'metal_damascus_steel',
    name: 'Forged Damascus Steel',
    category: 'metal',
    desc: 'Ancient folded high-carbon blade steel with organic topographic ripples',
    color: '#665c54',
    mode: 'standard',
    texture: {
      mode: 42,
      scale: 85,
      angle: 45,
      contrast: 170,
      grain: 30,
      hardness: 95,
      warpStrength: 20,
      warpFreq: 25
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  metal_anodized_bismuth: {
    $schema: 'esenho/material/v1',
    id: 'metal_anodized_bismuth',
    name: 'Rainbow Anodized Titanium',
    category: 'metal',
    desc: 'Iridescent thermal oxide rainbow sheen with prismatic chromatic fringing',
    color: '#b16286',
    mode: 'standard',
    texture: {
      mode: 67,
      scale: 100,
      contrast: 130,
      grain: 20,
      hardness: 95
    },
    filter: {
      enabled: true,
      plugin: 'chromatic',
      target: 'fill',
      p1: 8,
      p2: 0,
      opacity: 0.95
    },
    builtin: true
  },
  metal_weathered_bronze: {
    $schema: 'esenho/material/v1',
    id: 'metal_weathered_bronze',
    name: 'Antique Verdigris Bronze',
    category: 'metal',
    desc: 'Oxidized ancient bronze casting with turquoise mineral patina and rough pits',
    color: '#8ec07c',
    mode: 'standard',
    texture: {
      mode: 39,
      scale: 90,
      contrast: 145,
      grain: 60,
      hardness: 85
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  metal_brushed_aluminum: {
    $schema: 'esenho/material/v1',
    id: 'metal_brushed_aluminum',
    name: 'Aerospace Brushed Aluminum',
    category: 'metal',
    desc: 'Precision CNC milled satin aluminum with horizontal micro-grain',
    color: '#a89984',
    mode: 'standard',
    texture: {
      mode: 38,
      scale: 50,
      angle: 0,
      contrast: 110,
      grain: 15,
      hardness: 95
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  metal_rusted_iron: {
    $schema: 'esenho/material/v1',
    id: 'metal_rusted_iron',
    name: 'Corroded Cast Iron Rust',
    category: 'metal',
    desc: 'Deep orange ferric oxide corrosion with crumbly pitted surface relief',
    color: '#d65d0e',
    mode: 'standard',
    texture: {
      mode: 32,
      scale: 120,
      contrast: 165,
      grain: 70,
      hardness: 75,
      noiseDistort: 40
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  metal_polished_obsidian: {
    $schema: 'esenho/material/v1',
    id: 'metal_polished_obsidian',
    name: 'Polished Obsidian Mirror',
    category: 'metal',
    desc: 'Vitreous volcanic glass with mirror reflection and deep black depth',
    color: '#141617',
    mode: 'standard',
    texture: {
      mode: 8,
      scale: 180,
      contrast: 120,
      grain: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'bloom',
      target: 'fill',
      p1: 10,
      p2: 80,
      opacity: 0.9
    },
    builtin: true
  },
  metal_hammered_copper: {
    $schema: 'esenho/material/v1',
    id: 'metal_hammered_copper',
    name: 'Hammered Copper Sheet',
    category: 'metal',
    desc: 'Artisanal beaten copper kettle relief with warm specular luster',
    color: '#fe8019',
    mode: 'standard',
    texture: {
      mode: 50,
      scale: 80,
      contrast: 135,
      grain: 20,
      hardness: 95
    },
    filter: {
      enabled: true,
      plugin: 'bloom',
      target: 'fill',
      p1: 12,
      p2: 70,
      opacity: 0.85
    },
    builtin: true
  },
  metal_gunmetal_steel: {
    $schema: 'esenho/material/v1',
    id: 'metal_gunmetal_steel',
    name: 'Tactical Gunmetal Alloy',
    category: 'metal',
    desc: 'Dark blued firearm steel with satin matte finish and scratch resistance',
    color: '#3c3836',
    mode: 'standard',
    texture: {
      mode: 38,
      scale: 70,
      angle: 90,
      contrast: 125,
      grain: 25,
      hardness: 90
    },
    filter: {
      enabled: false
    },
    builtin: true
  },

  // ── Nature & Textures ──
  nat_magma: {
    $schema: 'esenho/material/v1',
    id: 'nat_magma',
    name: 'Molten Magma Volcano',
    category: 'nature',
    desc: 'Fiery incandescent basalt fissures with pulsing thermal lava bloom',
    color: '#fe8019',
    mode: 'standard',
    texture: {
      mode: 65,
      scale: 130,
      contrast: 180,
      grain: 40,
      hardness: 95,
      warpStrength: 30,
      warpFreq: 25
    },
    filter: {
      enabled: true,
      plugin: 'bloom',
      target: 'fill',
      p1: 30,
      p2: 120,
      opacity: 1.0
    },
    builtin: true
  },
  nat_marble: {
    $schema: 'esenho/material/v1',
    id: 'nat_marble',
    name: 'Warped Liquid Marble',
    category: 'nature',
    desc: 'Elegantly swirled Italian marble with organic grey calcite veins',
    color: '#fbf1c7',
    mode: 'standard',
    texture: {
      mode: 8,
      scale: 140,
      contrast: 130,
      grain: 10,
      hardness: 90,
      warpStrength: 45,
      warpFreq: 20
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  nat_mud: {
    $schema: 'esenho/material/v1',
    id: 'nat_mud',
    name: 'Cracked Mud Fissures',
    category: 'nature',
    desc: 'Arid polygonal mud fissures with baked clay silt grain',
    color: '#d79921',
    mode: 'standard',
    texture: {
      mode: 42,
      scale: 100,
      contrast: 170,
      grain: 65,
      hardness: 95
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  nat_dragon: {
    $schema: 'esenho/material/v1',
    id: 'nat_dragon',
    name: 'Mythic Dragon Scales',
    category: 'nature',
    desc: 'Interlocking reptilian emerald scales with glossy iridescent sheen',
    color: '#8ec07c',
    mode: 'standard',
    texture: {
      mode: 50,
      scale: 90,
      angle: 45,
      contrast: 160,
      grain: 15,
      hardness: 100
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  nat_granite: {
    $schema: 'esenho/material/v1',
    id: 'nat_granite',
    name: 'Granite Bedrock',
    category: 'nature',
    desc: 'Coarse intrusive igneous rock with quartz, feldspar and biotite crystal flecks',
    color: '#928374',
    mode: 'standard',
    texture: {
      mode: 39,
      scale: 80,
      contrast: 140,
      grain: 75,
      hardness: 90
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  nat_abyss: {
    $schema: 'esenho/material/v1',
    id: 'nat_abyss',
    name: 'Deep Oceanic Abyss',
    category: 'nature',
    desc: 'Deep benthic ocean void with glowing cyan plankton bloom and fluid currents',
    color: '#076678',
    mode: 'standard',
    texture: {
      mode: 8,
      scale: 160,
      contrast: 140,
      grain: 20,
      hardness: 70,
      warpStrength: 35,
      warpFreq: 15
    },
    filter: {
      enabled: true,
      plugin: 'bloom',
      target: 'fill',
      p1: 25,
      p2: 100,
      opacity: 0.9
    },
    builtin: true
  },
  nat_wood: {
    $schema: 'esenho/material/v1',
    id: 'nat_wood',
    name: 'Walnut Wood Grain',
    category: 'nature',
    desc: 'Rich hardwood grain with annual growth rings and natural oil finish',
    color: '#7c6f64',
    mode: 'standard',
    texture: {
      mode: 38,
      scale: 120,
      angle: 85,
      contrast: 155,
      grain: 25,
      hardness: 90,
      warpStrength: 15,
      warpFreq: 10
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  nat_emerald: {
    $schema: 'esenho/material/v1',
    id: 'nat_emerald',
    name: 'Emerald Geode Crystal',
    category: 'nature',
    desc: 'Faceted beryl gemstone crystals embedded in rough volcanic host rock',
    color: '#b8bb26',
    mode: 'standard',
    texture: {
      mode: 51,
      scale: 90,
      contrast: 165,
      grain: 30,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'bloom',
      target: 'fill',
      p1: 18,
      p2: 85,
      opacity: 0.95
    },
    builtin: true
  },
  nat_glacial_ice: {
    $schema: 'esenho/material/v1',
    id: 'nat_glacial_ice',
    name: 'Arctic Glacial Blue Ice',
    category: 'nature',
    desc: 'Compacted polar ice shelf with internal micro-fractures and optical frost',
    color: '#83a598',
    alpha: 0.85,
    mode: 'standard',
    texture: {
      mode: 42,
      scale: 110,
      contrast: 130,
      grain: 20,
      hardness: 85,
      warpStrength: 12,
      warpFreq: 18
    },
    filter: {
      enabled: true,
      plugin: 'frosted_glass',
      target: 'fill',
      p1: 15,
      p2: 80,
      opacity: 0.9
    },
    builtin: true
  },
  nat_desert_dunes: {
    $schema: 'esenho/material/v1',
    id: 'nat_desert_dunes',
    name: 'Windblown Sahara Dunes',
    category: 'nature',
    desc: 'Sweeping undulating desert sand ridges with fine sparkling silica grain',
    color: '#d79921',
    mode: 'standard',
    texture: {
      mode: 38,
      scale: 130,
      angle: 35,
      contrast: 125,
      grain: 45,
      hardness: 80,
      warpStrength: 25,
      warpFreq: 15
    },
    filter: {
      enabled: false
    },
    builtin: true
  },

  // ── Sci-Fi & Cyber ──
  sci_circuit: {
    $schema: 'esenho/material/v1',
    id: 'sci_circuit',
    name: 'Cyber Circuit Motherboard',
    category: 'scifi',
    desc: 'Dense PCB copper bus traces with glowing neon terminal nodes and bloom',
    color: '#00ffcc',
    mode: 'standard',
    texture: {
      mode: 43,
      scale: 85,
      contrast: 190,
      grain: 10,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'bloom',
      target: 'fill',
      p1: 25,
      p2: 120,
      opacity: 1.0
    },
    builtin: true
  },
  sci_hologram_shield: {
    $schema: 'esenho/material/v1',
    id: 'sci_hologram_shield',
    name: 'Holographic Energy Barrier',
    category: 'scifi',
    desc: 'Cyan plasma forcefield with horizontal raster scanlines and chromatic dispersion',
    color: '#83a598',
    alpha: 0.8,
    mode: 'standard',
    texture: {
      mode: 38,
      scale: 40,
      angle: 0,
      contrast: 160,
      grain: 10,
      hardness: 95
    },
    filter: {
      enabled: true,
      plugin: 'chromatic',
      target: 'fill',
      p1: 12,
      p2: 0,
      opacity: 1.0
    },
    builtin: true
  },
  sci_carbon: {
    $schema: 'esenho/material/v1',
    id: 'sci_carbon',
    name: 'Carbon Fiber Twill Weave',
    category: 'scifi',
    desc: 'Structural aerospace composite twill weave with deep diagonal gloss pattern',
    color: '#282828',
    mode: 'standard',
    texture: {
      mode: 35,
      scale: 75,
      angle: 45,
      contrast: 175,
      grain: 20,
      hardness: 100
    },
    filter: {
      enabled: false
    },
    builtin: true
  },
  sci_glitch_matrix: {
    $schema: 'esenho/material/v1',
    id: 'sci_glitch_matrix',
    name: 'Glitch Heatwave Matrix',
    category: 'scifi',
    desc: 'Corrupted cybernetic memory buffer with digital scan artifacts and heatwave glitch',
    color: '#fe8019',
    mode: 'standard',
    texture: {
      mode: 67,
      scale: 90,
      contrast: 170,
      grain: 45,
      hardness: 90,
      warpStrength: 35,
      warpFreq: 40
    },
    filter: {
      enabled: true,
      plugin: 'glitch',
      target: 'fill',
      p1: 30,
      p2: 70,
      opacity: 1.0
    },
    builtin: true
  },
  sci_synthwave_grid: {
    $schema: 'esenho/material/v1',
    id: 'sci_synthwave_grid',
    name: '80s Synthwave Sunset Grid',
    category: 'scifi',
    desc: 'Retro outrun perspective neon grid with CRT scanlines and magenta bloom',
    color: '#d3869b',
    mode: 'standard',
    texture: {
      mode: 43,
      scale: 110,
      angle: 0,
      contrast: 180,
      grain: 10,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'scanline',
      target: 'fill',
      p1: 8,
      p2: 60,
      opacity: 0.95
    },
    builtin: true
  },
  sci_black_hole: {
    $schema: 'esenho/material/v1',
    id: 'sci_black_hole',
    name: 'Black Hole Event Horizon',
    category: 'scifi',
    desc: 'Extreme relativistic gravitational light vortex swirling into darkness',
    color: '#141617',
    mode: 'standard',
    texture: {
      mode: 51,
      scale: 120,
      contrast: 190,
      grain: 10,
      hardness: 100,
      pinchSwirl: 70
    },
    filter: {
      enabled: true,
      plugin: 'swirl',
      target: 'fill',
      p1: 150,
      p2: 90,
      opacity: 1.0
    },
    builtin: true
  },
  sci_quantum_flux: {
    $schema: 'esenho/material/v1',
    id: 'sci_quantum_flux',
    name: 'Quantum Flux Plasma Field',
    category: 'scifi',
    desc: 'High-frequency subatomic energy fluctuations with prismatic dispersion',
    color: '#83a598',
    mode: 'standard',
    texture: {
      mode: 65,
      scale: 90,
      contrast: 150,
      grain: 60,
      hardness: 85,
      warpStrength: 40,
      warpFreq: 35
    },
    filter: {
      enabled: true,
      plugin: 'chromatic',
      target: 'fill',
      p1: 15,
      p2: 0,
      opacity: 1.0
    },
    builtin: true
  },
  sci_xray: {
    $schema: 'esenho/material/v1',
    id: 'sci_xray',
    name: 'Inverted X-Ray Negative',
    category: 'scifi',
    desc: 'High-energy radiographic film negative with skeletal density inversion',
    color: '#ebdbb2',
    mode: 'standard',
    texture: {
      mode: 47,
      scale: 100,
      contrast: 190,
      grain: 20,
      hardness: 100,
      invert: true
    },
    filter: {
      enabled: true,
      plugin: 'invert',
      target: 'fill',
      p1: 100,
      p2: 0,
      opacity: 1.0
    },
    builtin: true
  },
  sci_alien_biomass: {
    $schema: 'esenho/material/v1',
    id: 'sci_alien_biomass',
    name: 'Bioluminescent Alien Spore',
    category: 'scifi',
    desc: 'Organic extraterrestrial cellular membrane with pulsating bio-glow',
    color: '#b8bb26',
    mode: 'standard',
    texture: {
      mode: 50,
      scale: 95,
      contrast: 160,
      grain: 35,
      hardness: 80,
      warpStrength: 30,
      warpFreq: 20
    },
    filter: {
      enabled: true,
      plugin: 'bloom',
      target: 'fill',
      p1: 22,
      p2: 95,
      opacity: 0.95
    },
    builtin: true
  },
  sci_hex_nanotech: {
    $schema: 'esenho/material/v1',
    id: 'sci_hex_nanotech',
    name: 'Hexagonal Nanotech Armor',
    category: 'scifi',
    desc: 'Self-assembling microscopic carbon honeycomb plates with energy dissipation',
    color: '#282828',
    mode: 'standard',
    texture: {
      mode: 67,
      scale: 70,
      contrast: 180,
      grain: 15,
      hardness: 100
    },
    filter: {
      enabled: false
    },
    builtin: true
  },

  // ── Optical Lenses (WASM FX) ──
  lens_fisheye: {
    $schema: 'esenho/material/v1',
    id: 'lens_fisheye',
    name: 'Fisheye Barrel Lens',
    category: 'lenses',
    desc: 'Ultra-wide curved optical sphere refraction magnifying underlying elements',
    color: '#83a598',
    alpha: 0.9,
    mode: 'standard',
    texture: {
      mode: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'fisheye',
      target: 'backdrop',
      isLens: true,
      p1: 35,
      p2: 110,
      opacity: 1.0
    },
    builtin: true
  },
  lens_vortex: {
    $schema: 'esenho/material/v1',
    id: 'lens_vortex',
    name: 'Cosmic Vortex Swirl Lens',
    category: 'lenses',
    desc: 'Gravitational whirlpool light bending distorting background vectors',
    color: '#b16286',
    alpha: 0.9,
    mode: 'standard',
    texture: {
      mode: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'swirl',
      target: 'backdrop',
      isLens: true,
      p1: 120,
      p2: 85,
      opacity: 1.0
    },
    builtin: true
  },
  lens_ripple: {
    $schema: 'esenho/material/v1',
    id: 'lens_ripple',
    name: 'Water Ripple Caustics Lens',
    category: 'lenses',
    desc: 'Dynamic undulating liquid pool refraction animating backdrop surfaces',
    color: '#458588',
    alpha: 0.85,
    mode: 'standard',
    texture: {
      mode: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'ripple',
      target: 'backdrop',
      isLens: true,
      p1: 25,
      p2: 10,
      opacity: 1.0
    },
    builtin: true
  },
  lens_kaleidoscope: {
    $schema: 'esenho/material/v1',
    id: 'lens_kaleidoscope',
    name: 'Kaleidoscope Octa-Prism Lens',
    category: 'lenses',
    desc: '8-fold radial symmetry mirror lens multiplying underlying artwork',
    color: '#d3869b',
    mode: 'standard',
    texture: {
      mode: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'kaleidoscope',
      target: 'backdrop',
      isLens: true,
      p1: 8,
      p2: 30,
      opacity: 1.0
    },
    builtin: true
  },
  lens_frosted: {
    $schema: 'esenho/material/v1',
    id: 'lens_frosted',
    name: 'Frosted Gaussian Glass Lens',
    category: 'lenses',
    desc: 'Heavy architectural sandblasted glass diffusing background light',
    color: '#83a598',
    alpha: 0.8,
    mode: 'standard',
    texture: {
      mode: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'frosted_glass',
      target: 'backdrop',
      isLens: true,
      p1: 20,
      p2: 80,
      opacity: 0.95
    },
    builtin: true
  },
  lens_scanline: {
    $schema: 'esenho/material/v1',
    id: 'lens_scanline',
    name: 'Retro CRT Scanlines Lens',
    category: 'lenses',
    desc: 'Vintage arcade CRT monitor phosphor scanlines over viewport content',
    color: '#8ec07c',
    alpha: 0.85,
    mode: 'standard',
    texture: {
      mode: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'scanline',
      target: 'backdrop',
      isLens: true,
      p1: 6,
      p2: 70,
      opacity: 1.0
    },
    builtin: true
  },
  lens_glitch: {
    $schema: 'esenho/material/v1',
    id: 'lens_glitch',
    name: 'VHS Magnetic Glitch Lens',
    category: 'lenses',
    desc: 'Analog video tape tracking error with horizontal line displacement',
    color: '#fe8019',
    alpha: 0.9,
    mode: 'standard',
    texture: {
      mode: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'glitch',
      target: 'backdrop',
      isLens: true,
      p1: 35,
      p2: 60,
      opacity: 1.0
    },
    builtin: true
  },
  lens_duotone: {
    $schema: 'esenho/material/v1',
    id: 'lens_duotone',
    name: 'Cyberpunk Duotone Lens',
    category: 'lenses',
    desc: 'High-contrast neon two-tone color grading lens transforming background',
    color: '#00ffcc',
    mode: 'standard',
    texture: {
      mode: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'duotone',
      target: 'backdrop',
      isLens: true,
      p1: 40,
      p2: 80,
      opacity: 1.0
    },
    builtin: true
  },
  lens_thermal: {
    $schema: 'esenho/material/v1',
    id: 'lens_thermal',
    name: 'Thermal Predator Infrared Lens',
    category: 'lenses',
    desc: 'FLIR infrared thermography heat signature visualization lens',
    color: '#cc241d',
    mode: 'standard',
    texture: {
      mode: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'thermal',
      target: 'backdrop',
      isLens: true,
      p1: 50,
      p2: 0,
      opacity: 1.0
    },
    builtin: true
  },
  lens_bloom: {
    $schema: 'esenho/material/v1',
    id: 'lens_bloom',
    name: 'Neon Bloom Dispersion Lens',
    category: 'lenses',
    desc: 'High dynamic range optical bloom scattering bright background lights',
    color: '#fabd2f',
    mode: 'standard',
    texture: {
      mode: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'bloom',
      target: 'backdrop',
      isLens: true,
      p1: 30,
      p2: 120,
      opacity: 1.0
    },
    builtin: true
  },
  lens_chromatic: {
    $schema: 'esenho/material/v1',
    id: 'lens_chromatic',
    name: 'Chromatic Fringe Prism Lens',
    category: 'lenses',
    desc: 'Prismatic optical dispersion splitting RGB channels at shape boundaries',
    color: '#ebdbb2',
    mode: 'standard',
    texture: {
      mode: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'chromatic',
      target: 'backdrop',
      isLens: true,
      p1: 15,
      p2: 0,
      opacity: 1.0
    },
    builtin: true
  },
  lens_dither_matrix: {
    $schema: 'esenho/material/v1',
    id: 'lens_dither_matrix',
    name: 'Bayer Retro Dither Lens',
    category: 'lenses',
    desc: 'Ordered 8-bit Bayer dot matrix dithering underlying vector graphics',
    color: '#ebdbb2',
    mode: 'standard',
    texture: {
      mode: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'dither',
      target: 'backdrop',
      isLens: true,
      p1: 75,
      p2: 0,
      opacity: 0.9
    },
    builtin: true
  },
  lens_ascii_terminal: {
    $schema: 'esenho/material/v1',
    id: 'lens_ascii_terminal',
    name: 'ASCII Terminal Matrix Lens',
    category: 'lenses',
    desc: 'Retro character luminance quantization rendering shapes as terminal glyphs',
    color: '#b8bb26',
    mode: 'standard',
    texture: {
      mode: 0,
      hardness: 100
    },
    filter: {
      enabled: true,
      plugin: 'ascii',
      target: 'backdrop',
      isLens: true,
      p1: 8,
      p2: 0,
      opacity: 1.0
    },
    builtin: true
  }
};

// 3. Assemble unified materials catalog
const allMaterials = {
  ...brushFillMaterials,
  ...standardMaterials
};

console.log(`Total materials assembled: ${Object.keys(allMaterials).length}`);
data.materials = allMaterials;
if (data.stats) {
  data.stats.materials = Object.keys(allMaterials).length;
}

fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
console.log('Successfully updated data.json with rich materials catalog!');

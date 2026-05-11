// SandstonePlots - LSE QuickJS
const PLOT_SIZE = 512;
const Y_LEVEL = -60;
const CHUNK_RADIUS = 4;

const FILL_BLOCK = "minecraft:sandstone";
const BORDER_TOP = "minecraft:stone_bricks";
const BORDER_UNDER = "minecraft:border_block";

let processed = new Set();

// Force-generation timers
let forceGenUntil = {}; // playerName -> timestamp

// PLOT STORAGE
const DATA_FILE = "plugins/SandstonePlots/playerPlots.json";

let playerPlots = {};
try {
    let txt = file.readFrom(DATA_FILE);
    if (txt && txt.length > 0) {
        playerPlots = JSON.parse(txt);
    }
} catch (e) {
    playerPlots = {};
}

function savePlots() {
    file.writeTo(DATA_FILE, JSON.stringify(playerPlots));
}

// SPIRAL PLOT ASSIGNMENT
function getNextFreePlot() {
    let layer = 0;

    while (true) {
        for (let dx = -layer; dx <= layer; dx++) {
            for (let dz = -layer; dz <= layer; dz++) {

                if (Math.abs(dx) !== layer && Math.abs(dz) !== layer) continue;

                let key = dx + "," + dz;

                let used = false;
                let names = Object.keys(playerPlots);
                for (let i = 0; i < names.length; i++) {
                    if (playerPlots[names[i]] === key) {
                        used = true;
                        break;
                    }
                }

                if (!used) {
                    return { px: dx, pz: dz };
                }
            }
        }
        layer++;
    }
}

// PLOT TELEPORT
function tpToPlot(player, px, pz) {
    let x = Math.floor(px * PLOT_SIZE + PLOT_SIZE / 2);
    let z = Math.floor(pz * PLOT_SIZE + PLOT_SIZE / 2);
    let y = -50;

    let dim = player.pos.dimid;

    player.teleport(x, y, z, dim);
}

// WORLD GENERATION
function processChunk(dimId, chunkX, chunkZ, force) {
    const key = dimId + ":" + chunkX + ":" + chunkZ;

    // Bypass processed check if force == true
    if (!force && processed.has(key)) return;

    processed.add(key);

    const startX = chunkX * 16;
    const startZ = chunkZ * 16;

    for (let dx = 0; dx < 16; dx++) {
        for (let dz = 0; dz < 16; dz++) {
            const x = startX + dx;
            const z = startZ + dz;

            const plotX = Math.floor(x / PLOT_SIZE);
            const plotZ = Math.floor(z / PLOT_SIZE);

            const localX = x - plotX * PLOT_SIZE;
            const localZ = z - plotZ * PLOT_SIZE;

            const isBorder =
                localX === 0 ||
                localZ === 0 ||
                localX === PLOT_SIZE - 1 ||
                localZ === PLOT_SIZE - 1;

            if (isBorder) {
                mc.setBlock(x, Y_LEVEL, z, dimId, BORDER_TOP, 0);
                mc.setBlock(x, Y_LEVEL - 1, z, dimId, BORDER_UNDER, 0);
            } else {
                mc.setBlock(x, Y_LEVEL, z, dimId, FILL_BLOCK, 0);
            }
        }
    }
}

// GENERATE AROUND PLAYERS
mc.listen("onTick", () => {
    const players = mc.getOnlinePlayers();

    for (const p of players) {
        const pos = p.pos;
        const dimId = pos.dimid;

        const baseCx = Math.floor(pos.x / 16);
        const baseCz = Math.floor(pos.z / 16);

        // Check if this player is in force-generation mode
        const force = Date.now() < (forceGenUntil[p.realName] || 0);

        for (let ox = -CHUNK_RADIUS; ox <= CHUNK_RADIUS; ox++) {
            for (let oz = -CHUNK_RADIUS; oz <= CHUNK_RADIUS; oz++) {
                processChunk(dimId, baseCx + ox, baseCz + oz, force);
            }
        }
    }
});

// ASSIGN PLOT ON JOIN
mc.listen("onJoin", function(player) {
    let name = player.realName;

    // Activate force-generation for 5 seconds
    forceGenUntil[name] = Date.now() + 5000;

    if (!playerPlots[name]) {
        let plot = getNextFreePlot();
        let key = plot.px + "," + plot.pz;
        playerPlots[name] = key;
        savePlots();

        player.tell("You have been assigned plot " + key);
        tpToPlot(player, plot.px, plot.pz);
    } else {
        let parts = playerPlots[name].split(",");
        let px = parseInt(parts[0]);
        let pz = parseInt(parts[1]);
        tpToPlot(player, px, pz);
    }
});

// Remove TNT minecarts efficiently
mc.listen("onTick", function () {
    const carts = mc.getAllEntities("minecraft:tnt_minecart");
    for (const c of carts) c.kill();
});

mc.listen("onUseItem", function (player, item) {
    if (!item) return;

    const id = item.type;

    // Ender pearl
    if (id === "minecraft:ender_pearl") {
        player.tell("Ender pearls are disabled.");
        return false;
    }

    // Chorus fruit
    if (id === "minecraft:chorus_fruit") {
        player.tell("Chorus fruit teleporting is disabled.");
        return false;
    }
});

mc.listen("onUseItemOn", function (player, item, block) {
    if (!item) return;

    if (item.type.endsWith("_spawn_egg")) {
        player.tell("Spawn eggs are disabled.");
        return false;
    }
});

// /kit COMMAND
mc.regPlayerCmd("kit", "Gives a basic redstone kit", function (player, args) {
    const name = player.realName; // exact in‑game name

    const cmds = [
        `give "${name}" repeater 1`,
        `give "${name}" white_wool 1`,
        `give "${name}" redstone 1`,
        `give "${name}" white_stained_glass 1`,
        `give "${name}" redstone_torch 1`,
        `give "${name}" comparator 1`,
        `give "${name}" wooden_axe 1`,
        `give "${name}" target 1`,
        `give "${name}" stone_slab 1`
    ];

    for (const c of cmds) {
        mc.runcmdEx(c);
    }

    player.tell("§aYou received your redstone kit!");
});

// FIRST JOIN TAGGING SYSTEM
const FIRST_JOIN_FILE = "plugins/firstJoin.json";
let firstJoinData = {};

// Load existing data
try {
    let txt = file.readFrom(FIRST_JOIN_FILE);
    if (txt && txt.length > 0) {
        firstJoinData = JSON.parse(txt);
    }
} catch (e) {
    firstJoinData = {};
}

function saveFirstJoin() {
    file.writeTo(FIRST_JOIN_FILE, JSON.stringify(firstJoinData));
}

// Give worldedit tag on first join
mc.listen("onJoin", function (player) {
    const name = player.realName;

    if (!firstJoinData[name]) {
        // Mark as joined
        firstJoinData[name] = true;
        saveFirstJoin();

        // Run the tag command
        mc.runcmdEx(`tag "${name}" add worldedit`);

        player.tell("§aYou have been granted the worldedit tag for the first time!");
    }
});
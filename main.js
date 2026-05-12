const PLOT_SIZE = 512;
const Y_LEVEL = -60;
const CHUNK_RADIUS = 5;

const FILL_BLOCK = "minecraft:sandstone";
const BORDER_TOP = "minecraft:stone_bricks";
const BORDER_UNDER = "minecraft:border_block";

const DATA_FILE = "plugins/SandstonePlots/playerPlots.json";
const FIRST_JOIN_FILE = "plugins/firstJoin.json";

const MAX_PROCESSED = 20000;

let processed = new Set();
let processedQueue = [];
let forceGenUntil = {};
let playerPlots = {};
let usedPlots = new Set();
let firstJoinData = {};
let tickCounter = 0;

try {
    let txt = file.readFrom(DATA_FILE);
    if (txt && txt.length > 0) playerPlots = JSON.parse(txt);
} catch (e) {}

for (let n in playerPlots) usedPlots.add(playerPlots[n]);

try {
    let txt = file.readFrom(FIRST_JOIN_FILE);
    if (txt && txt.length > 0) firstJoinData = JSON.parse(txt);
} catch (e) {}

function savePlots() {
    file.writeTo(DATA_FILE, JSON.stringify(playerPlots));
}

function saveFirstJoin() {
    file.writeTo(FIRST_JOIN_FILE, JSON.stringify(firstJoinData));
}

function trackProcessed(key) {
    if (processed.has(key)) return;
    processed.add(key);
    processedQueue.push(key);
    if (processedQueue.length > MAX_PROCESSED) {
        const old = processedQueue.shift();
        if (old) processed.delete(old);
    }
}

function getNextFreePlot() {
    let layer = 0;
    while (true) {
        for (let dx = -layer; dx <= layer; dx++) {
            for (let dz = -layer; dz <= layer; dz++) {
                if (Math.abs(dx) !== layer && Math.abs(dz) !== layer) continue;
                let key = dx + "," + dz;
                if (!usedPlots.has(key)) {
                    usedPlots.add(key);
                    return { px: dx, pz: dz };
                }
            }
        }
        layer++;
    }
}

function tpToPlot(player, px, pz) {
    let x = Math.floor(px * PLOT_SIZE + PLOT_SIZE / 2);
    let z = Math.floor(pz * PLOT_SIZE + PLOT_SIZE / 2);
    let y = Y_LEVEL + 2;
    player.teleport(x, y, z, player.pos.dimid);
}

function processChunk(dimId, chunkX, chunkZ, force) {
    const key = dimId + ":" + chunkX + ":" + chunkZ;
    if (!force && processed.has(key)) return;
    trackProcessed(key);
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

function preGeneratePlot(dimId, px, pz) {
    const centerX = Math.floor(px * PLOT_SIZE + PLOT_SIZE / 2);
    const centerZ = Math.floor(pz * PLOT_SIZE + PLOT_SIZE / 2);
    const baseCx = Math.floor(centerX / 16);
    const baseCz = Math.floor(centerZ / 16);
    for (let ox = -CHUNK_RADIUS; ox <= CHUNK_RADIUS; ox++) {
        for (let oz = -CHUNK_RADIUS; oz <= CHUNK_RADIUS; oz++) {
            processChunk(dimId, baseCx + ox, baseCz + oz, true);
        }
    }
}

mc.listen("onTick", () => {
    tickCounter++;
    if (tickCounter % 2 !== 0) return;
    const players = mc.getOnlinePlayers();
    for (const p of players) {
        const pos = p.pos;
        const dimId = pos.dimid;
        const baseCx = Math.floor(pos.x / 16);
        const baseCz = Math.floor(pos.z / 16);
        const force = Date.now() < (forceGenUntil[p.realName] || 0);
        for (let ox = -CHUNK_RADIUS; ox <= CHUNK_RADIUS; ox++) {
            for (let oz = -CHUNK_RADIUS; oz <= CHUNK_RADIUS; oz++) {
                processChunk(dimId, baseCx + ox, baseCz + oz, force);
            }
        }
    }
    const carts = mc.getAllEntities("minecraft:tnt_minecart");
    for (const c of carts) c.kill();
});

mc.listen("onJoin", function(player) {
    let name = player.realName;
    forceGenUntil[name] = Date.now() + 5000;
    const dimId = player.pos.dimid;
    if (!playerPlots[name]) {
        let plot = getNextFreePlot();
        let key = plot.px + "," + plot.pz;
        playerPlots[name] = key;
        savePlots();
        preGeneratePlot(dimId, plot.px, plot.pz);
        tpToPlot(player, plot.px, plot.pz);
    } else {
        let parts = playerPlots[name].split(",");
        let px = parseInt(parts[0]);
        let pz = parseInt(parts[1]);
        preGeneratePlot(dimId, px, pz);
        tpToPlot(player, px, pz);
    }
    if (!firstJoinData[name]) {
        firstJoinData[name] = { firstJoin: Date.now() };
        saveFirstJoin();
    }
});

mc.listen("onUseItem", function(player, item) {
    if (!item) return;
    const id = item.type;
    if (id === "minecraft:ender_pearl") {
        player.tell("Ender pearls are disabled.");
        return false;
    }
    if (id === "minecraft:chorus_fruit") {
        player.tell("Chorus fruit teleporting is disabled.");
        return false;
    }
});

mc.listen("onUseItemOn", function(player, item, block) {
    if (!item) return;
    if (item.type.endsWith("_spawn_egg")) {
        player.tell("Spawn eggs are disabled.");
        return false;
    }
});

mc.regPlayerCmd("kit", "Gives a basic redstone kit", function(player, args) {
    const name = player.realName;
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
    for (const c of cmds) mc.runcmdEx(c);
    player.tell("§aYou received your enhanced redstone kit!");
});
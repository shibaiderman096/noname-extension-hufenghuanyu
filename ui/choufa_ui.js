/**
 * 筹伐 · 三技能点亮 UI + 枭据觉醒特效（只读 UI 层，不改任何技能逻辑）
 *
 * 做了什么：
 *  - 在武将牌上沿放三个节点：决 / 擅 / 镇（决势 / 擅兵 / 镇骨），初始灰色
 *  - 读取 player.storage.choufa_skills，每获得一个技能就点亮对应节点（各有专属颜色）
 *  - 枭据觉醒（player.awakenSkill("hfhy_xiaoju")）时，按“已选了哪几个技能”触发专属特效：
 *      屏幕正中（与游戏自带觉醒动画同处）升起对应颜色的火焰 + 冲击环 + 称号；
 *      武将牌上的已亮节点各自燃起火焰，没选到的节点因势力变群而“封”住
 *  - 通过“包装” player.markSkill / awakenSkill 刷新：筹伐每次加标记、选技能后都会 markSkill("hfhy_choufa")
 *
 * 不会做的事：不改 skill.js，不触发/拦截任何事件，不写入 storage。
 */
import { lib, game, ui, get, ai, _status } from "noname";

const SKILL = "hfhy_choufa";
const AWAKEN_SKILL = "hfhy_xiaoju";
const KEY = "_hfhyChoufaUI";
const STYLE_ID = "hfhy-choufa-ui-style";

// 三个节点：顺序与 derivation 一致。c = 主色，cl = 高光色
const NODES = [
    { skill: "hfhy_jueshi", char: "决", name: "决势", c: "#ffb81f", cd: "#e07b00", cl: "#fff1b0" },
    { skill: "hfhy_shanbing", char: "擅", name: "擅兵", c: "#ff4d3d", cd: "#b3150a", cl: "#ffc2b8" },
    { skill: "hfhy_zhengu", char: "镇", name: "镇骨", c: "#3fa2ff", cd: "#1558c0", cl: "#c2e4ff" },
];

// 觉醒时的 8 种组合（键 = 决势/擅兵/镇骨 是否已获得）。想改称号、颜色，只改这张表。
const COMBOS = {
    "000": { title: "枭据 · 孤势", glow: "#cfd3ff" },
    "100": { title: "枭据 · 谋势", glow: "#ffb81f" },
    "010": { title: "枭据 · 锋势", glow: "#ff4d3d" },
    "001": { title: "枭据 · 骨势", glow: "#3fa2ff" },
    "110": { title: "枭据 · 霸势", glow: "#ff8a2a" },
    "101": { title: "枭据 · 略势", glow: "#35d0a8" },
    "011": { title: "枭据 · 铁势", glow: "#a97cff" },
    "111": { title: "枭据 · 三势归一", glow: "#ffd24a" },
};


// 无选择时（孤势）用的紫色火焰；三势归一时中央再加一团金焰
const FLAME_VIOLET = { c: "#8b6bff", cd: "#3a1c8c", cl: "#e6dcff" };
const FLAME_GOLD = { c: "#ffd24a", cd: "#e8a800", cl: "#fff4c2" };

// 火焰图形：只保留外焰一层（孤胆 UI 的外焰轮廓）
const FLAME_BODY = `M12 1c.5 4.8 4 6.9 6.1 9.8C19.7 12.9 21 15 21 17.3c0 4.9-4 8.9-9 8.9s-9-4-9-8.9c0-2.4 1.2-4.3 2.6-6.4C7.9 8 11.5 5.8 12 1z`;
const flameCache = {};
function flameUrl({ c, cd, cl }) {
    const key = c + cd + cl;
    if (!flameCache[key]) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 30"><defs>` +
            `<linearGradient id="fo" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${cd}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${cl}"/></linearGradient>` +
            `</defs><path fill="url(#fo)" d="${FLAME_BODY}"/></svg>`;
        flameCache[key] = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    return flameCache[key];
}

const CSS = `
.hfhy-choufa-ui{
    position:absolute !important; left:50%; top:var(--hfhy-choufa-top,-20px);
    transform:translateX(-50%);
    display:flex !important; flex-direction:row !important; align-items:center; justify-content:center;
    padding:4px 8px; border-radius:999px;
    background:rgba(0,0,0,.58);
    box-shadow:0 0 0 1px rgba(255,255,255,.12), 0 1px 4px rgba(0,0,0,.6);
    pointer-events:none; z-index:20; white-space:nowrap;
    opacity:0; transition:opacity .25s, background .4s, box-shadow .4s;
    width:auto !important; height:auto !important; box-sizing:border-box !important;
}
.hfhy-choufa-ui.show{ opacity:1; }
.player.dead > .hfhy-choufa-ui{ display:none; }

.hfhy-choufa-node{
    position:relative !important; left:auto !important; top:auto !important; right:auto !important; bottom:auto !important;
    flex:0 0 auto !important; display:flex !important; align-items:center !important; justify-content:center !important;
    margin:0 10px !important; width:18px !important; height:18px !important;
    border-radius:50%; font-size:11px; line-height:1; font-weight:bold;
    background:#6f6f6f; color:#d4d4d4; text-shadow:0 1px 1px rgba(0,0,0,.55);
    box-shadow:0 0 0 1px rgba(0,0,0,.55), inset 0 0 2px rgba(0,0,0,.5);
    transition:background .35s, color .35s, box-shadow .35s, opacity .35s, transform .35s;
}
/* 已获得：点亮，带专属颜色 */
.hfhy-choufa-node[data-state="lit"]{
    background:radial-gradient(circle at 35% 30%, var(--cl) 0%, var(--c) 62%);
    color:#2a1600; text-shadow:0 1px 0 rgba(255,255,255,.55);
    box-shadow:0 0 0 1px rgba(0,0,0,.45), 0 0 5px 1px var(--c), 0 0 11px 3px var(--c);
    transform:scale(1.12);
}
.hfhy-choufa-node[data-state="lit"]::after{
    content:""; position:absolute; left:0; top:0; right:0; bottom:0; border-radius:50%;
    border:2px solid var(--c); pointer-events:none;
    animation:hfhy-choufa-ripple .8s ease-out;
}
/* 觉醒后没选到的：封住（势力变群，筹伐不再给技能） */
.hfhy-choufa-node[data-state="sealed"]{
    background:#2a2a33; color:transparent; opacity:.5; font-size:0;
    box-shadow:0 0 0 1px rgba(0,0,0,.6), inset 0 0 3px rgba(0,0,0,.8);
}
.hfhy-choufa-node[data-state="sealed"]::after{
    content:"封"; font-size:9px; color:#8d8d9a; position:static; border:0; animation:none;
}

/* 觉醒后常驻：群势力暗紫底 + 已亮节点各自燃起火焰 */
.hfhy-choufa-ui.awakened{
    background:rgba(16,6,26,.72);
    box-shadow:0 0 0 1px rgba(255,255,255,.14), 0 0 12px 2px var(--hfhy-choufa-glow,#cfd3ff);
}
/* 去掉 transform，避免节点自成层叠上下文，火焰才能垫在节点后面 */
.hfhy-choufa-ui.awakened .hfhy-choufa-node[data-state="lit"]{
    transform:none; width:20px !important; height:20px !important;
    box-shadow:0 0 0 1px rgba(0,0,0,.45), 0 0 6px 2px var(--c), 0 0 14px 4px var(--c);
}
.hfhy-choufa-ui.awakened .hfhy-choufa-node[data-state="lit"]::before{
    content:""; position:absolute; left:50%; bottom:35%; width:30px; height:38px; margin-left:-15px;
    z-index:-1; pointer-events:none;
    background-image:var(--flame); background-repeat:no-repeat; background-position:center bottom; background-size:contain;
    transform-origin:50% 100%;
    animation:hfhy-choufa-flicker .7s ease-in-out infinite;
    filter:drop-shadow(0 0 3px var(--c)) drop-shadow(0 0 7px var(--c));
}
.hfhy-choufa-ui.awakened .hfhy-choufa-node[data-state="lit"]:nth-child(2)::before{ animation-delay:-.25s; }
.hfhy-choufa-ui.awakened .hfhy-choufa-node[data-state="lit"]:nth-child(3)::before{ animation-delay:-.5s; }

/* 觉醒瞬间：已亮节点涌动 */
.hfhy-choufa-ui.awakening .hfhy-choufa-node[data-state="lit"]{ animation:hfhy-choufa-surge .9s ease-in-out; }

/* 屏幕正中的觉醒特效（与游戏自带觉醒动画同处）。--hfhy-choufa-fx-y 可调垂直位置 */
.hfhy-choufa-fx{
    position:absolute !important; left:50%; top:var(--hfhy-choufa-fx-y,50%); width:0; height:0;
    pointer-events:none; z-index:50;
    animation:hfhy-choufa-fxlife 3.2s linear forwards;
}
.hfhy-choufa-fx > div{ position:absolute !important; pointer-events:none; }
.hfhy-choufa-shock{
    left:-60px; top:-60px; width:120px !important; height:120px !important; border-radius:50%;
    border:3px solid var(--g); box-shadow:0 0 14px var(--g), inset 0 0 14px var(--g);
    opacity:0; animation:hfhy-choufa-shock 1.1s ease-out forwards;
}
.hfhy-choufa-bigflame{
    left:calc(var(--x) - 45px); bottom:-30px; width:90px !important; height:117px !important;
    background-image:var(--flame); background-repeat:no-repeat; background-position:center bottom; background-size:contain;
    transform-origin:50% 100%; opacity:0;
    filter:drop-shadow(0 0 8px var(--g)) drop-shadow(0 0 18px var(--g));
    animation:hfhy-choufa-grow .8s cubic-bezier(.2,1.2,.4,1) var(--d,0s) forwards, hfhy-choufa-flicker .6s ease-in-out calc(var(--d,0s) + .8s) infinite;
}
.hfhy-choufa-ember{
    left:var(--ex); top:0; width:5px !important; height:5px !important; border-radius:50%;
    background:var(--ec); box-shadow:0 0 6px 2px var(--ec); opacity:0;
    animation:hfhy-choufa-ember var(--et) ease-out var(--ed) forwards;
}
.hfhy-choufa-title{
    left:0; top:42px; transform:translateX(-50%); white-space:nowrap;
    font-size:26px; font-weight:bold; letter-spacing:6px; color:#fff;
    text-shadow:0 0 8px var(--g), 0 0 18px var(--g), 0 2px 2px rgba(0,0,0,.7);
    opacity:0; animation:hfhy-choufa-title .7s ease-out .55s forwards;
}
.hfhy-choufa-title::after{
    content:""; position:absolute; left:0; right:0; bottom:-6px; height:3px; border-radius:3px;
    background:var(--hfhy-choufa-ring);
}

@keyframes hfhy-choufa-ripple{ 0%{transform:scale(1);opacity:.9} 100%{transform:scale(2.2);opacity:0} }
@keyframes hfhy-choufa-surge{ 0%{transform:scale(1)} 35%{transform:scale(1.6);filter:brightness(1.5)} 100%{transform:scale(1);filter:none} }
@keyframes hfhy-choufa-flicker{
    0%,100%{ transform:scale(1,1) rotate(0deg); }
    25%{ transform:scale(.92,1.1) rotate(-2.5deg); }
    50%{ transform:scale(1.07,.93) rotate(0deg); }
    75%{ transform:scale(.95,1.06) rotate(2.5deg); }
}
@keyframes hfhy-choufa-grow{ 0%{opacity:0;transform:scale(.1,.05)} 60%{opacity:1;transform:scale(1.15,1.25)} 100%{opacity:1;transform:scale(1,1)} }
@keyframes hfhy-choufa-shock{ 0%{opacity:.95;transform:scale(.3)} 100%{opacity:0;transform:scale(5.5)} }
@keyframes hfhy-choufa-ember{ 0%{opacity:0;transform:translateY(20px)} 15%{opacity:1} 100%{opacity:0;transform:translateY(-150px) translateX(var(--ex2))} }
@keyframes hfhy-choufa-title{ 0%{opacity:0;transform:translateX(-50%) scale(.5)} 60%{opacity:1;transform:translateX(-50%) scale(1.15)} 100%{opacity:1;transform:translateX(-50%) scale(1)} }
@keyframes hfhy-choufa-fxlife{ 0%,82%{opacity:1} 100%{opacity:0} }
`;

function ensureStyle() {
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }
}

/** 已获得的技能 → ["1","0","1"] 形式的组合键 */
function comboKey(lit) {
    return lit.map(v => (v ? "1" : "0")).join("");
}

/** 称号下划线的渐变：所选技能的颜色依次排开 */
function ringGradient(lit) {
    const colors = NODES.filter((n, i) => lit[i]).map(n => n.c);
    if (colors.length === 0) return "linear-gradient(90deg,#9aa0c8,#e6e8ff,#9aa0c8)";
    if (colors.length === 1) {
        const n = NODES.find((n, i) => lit[i]);
        return `linear-gradient(90deg,${n.c},${n.cl},${n.c})`;
    }
    return `linear-gradient(90deg,${colors.join(",")})`;
}

function isAwakened(player) {
    return Array.isArray(player.awakenedSkills) && player.awakenedSkills.includes(AWAKEN_SKILL);
}

function getLit(player) {
    const gained = Array.isArray(player.storage && player.storage.choufa_skills) ? player.storage.choufa_skills : [];
    return NODES.map(n => gained.includes(n.skill));
}

function build(player, c) {
    const el = document.createElement("div");
    el.className = "hfhy-choufa-ui";
    c.nodes = NODES.map(n => {
        const dot = document.createElement("div");
        dot.className = "hfhy-choufa-node";
        dot.dataset.state = "dim";
        dot.style.setProperty("--c", n.c);
        dot.style.setProperty("--cl", n.cl);
        dot.style.setProperty("--flame", flameUrl(n));
        dot.textContent = n.char;
        el.appendChild(dot);
        return dot;
    });
    player.appendChild(el);
    c.el = el;
    requestAnimationFrame(() => el.classList.add("show"));
}

function paint(c, lit, awakened) {
    c.nodes.forEach((dot, i) => {
        const state = lit[i] ? "lit" : awakened ? "sealed" : "dim";
        if (dot.dataset.state !== state) dot.dataset.state = state;
    });
    if (awakened) {
        const combo = COMBOS[comboKey(lit)];
        c.el.style.setProperty("--hfhy-choufa-glow", combo.glow);
        c.el.classList.add("awakened");
    } else {
        c.el.classList.remove("awakened");
    }
}

function destroy(player) {
    const c = player[KEY];
    if (!c) return;
    player[KEY] = null;
    if (c.el) {
        c.el.classList.remove("show");
        setTimeout(() => c.el.remove(), 300);
    }
}

/** 根据 storage 同步 UI（只读） */
function sync(player) {
    if (!player || !player.storage) return;
    // 筹伐的 init 会把 storage 置为数字；没有筹伐的角色不画 UI
    // （没用 hasSkill 判断：筹伐是魏势力技，觉醒改群后可能被判为“不拥有”，那样觉醒态反而画不出来）
    if (typeof player.storage[SKILL] !== "number") {
        destroy(player);
        return;
    }
    let c = player[KEY];
    if (!c) {
        c = player[KEY] = { el: null, nodes: [], awakened: false, timer: 0 };
        build(player, c);
    }
    c.awakened = c.awakened || isAwakened(player);
    paint(c, getLit(player), c.awakened);
}

/** 觉醒瞬间的一次性特效：屏幕正中升起火焰，与游戏自带的觉醒动画同处 */
function playAwaken(player) {
    sync(player);
    const c = player[KEY];
    if (!c || c.awakenPlayed) return;
    c.awakenPlayed = true;
    c.awakened = true;
    const lit = getLit(player);
    paint(c, lit, true);
    const combo = COMBOS[comboKey(lit)];

    // 武将牌上的节点涌动
    c.el.classList.add("awakening");
    setTimeout(() => c.el.classList.remove("awakening"), 1000);

    // 屏幕正中的特效层
    const litNodes = NODES.filter((n, i) => lit[i]);
    const fx = document.createElement("div");
    fx.className = "hfhy-choufa-fx";
    fx.style.setProperty("--g", combo.glow);
    fx.style.setProperty("--hfhy-choufa-ring", ringGradient(lit));

    [0, 0.18].forEach(delay => {
        const ring = document.createElement("div");
        ring.className = "hfhy-choufa-shock";
        ring.style.animationDelay = delay + "s";
        fx.appendChild(ring);
    });

    // 火焰：每个已选技能一团；三势归一时中央再加一团大金焰垫底
    const flames = litNodes.length ? litNodes.map(n => ({ col: n, glow: n.c })) : [{ col: FLAME_VIOLET, glow: FLAME_VIOLET.c }];
    const xs = { 1: [0], 2: [-34, 34], 3: [-62, 0, 62] }[flames.length];
    const addFlame = (col, glow, x, delay, scale) => {
        const f = document.createElement("div");
        f.className = "hfhy-choufa-bigflame";
        f.style.setProperty("--flame", flameUrl(col));
        f.style.setProperty("--g", glow);
        f.style.setProperty("--x", x + "px");
        f.style.setProperty("--d", delay + "s");
        if (scale !== 1) {
            f.style.width = 90 * scale + "px";
            f.style.height = 117 * scale + "px";
            f.style.left = `calc(${x}px - ${45 * scale}px)`;
        }
        fx.appendChild(f);
    };
    if (flames.length === 3) addFlame(FLAME_GOLD, FLAME_GOLD.c, 0, 0.1, 1.5);
    flames.forEach((f, i) => addFlame(f.col, f.glow, xs[i], 0.25 + i * 0.12, 1));

    // 火星：颜色取自所选技能
    const emberColors = (litNodes.length ? litNodes : [FLAME_VIOLET]).map(n => n.cl);
    for (let i = 0; i < 10; i++) {
        const e = document.createElement("div");
        e.className = "hfhy-choufa-ember";
        e.style.setProperty("--ex", ((i * 37) % 120) - 60 + "px");
        e.style.setProperty("--ex2", (((i * 53) % 40) - 20) + "px");
        e.style.setProperty("--ec", emberColors[i % emberColors.length]);
        e.style.setProperty("--et", 1.4 + (i % 4) * 0.25 + "s");
        e.style.setProperty("--ed", 0.4 + (i % 5) * 0.2 + "s");
        fx.appendChild(e);
    }

    const title = document.createElement("div");
    title.className = "hfhy-choufa-title";
    title.textContent = combo.title;
    fx.appendChild(title);

    (ui.window || ui.arena || document.body).appendChild(fx);
    setTimeout(() => fx.remove(), 3300);
}

function wrap(target, name, after) {
    const orig = target[name];
    if (typeof orig !== "function" || orig._hfhyChoufa) return;
    const wrapped = function (...args) {
        const result = orig.apply(this, args);
        try {
            after(this, args);
        } catch (e) {
            console.error("[筹伐UI]", e);
        }
        return result;
    };
    wrapped._hfhyChoufa = true;
    target[name] = wrapped;
}

/** 在 extension 的 precontent 里调用一次（必须早于玩家节点创建） */
export function initChoufaUI() {
    ensureStyle();
    // 新版 lib.element.Player 是 class，旧版是 lib.element.player 对象，两个都尝试
    const targets = new Set([lib.element && lib.element.Player && lib.element.Player.prototype, lib.element && lib.element.player].filter(Boolean));
    for (const target of targets) {
        wrap(target, "markSkill", (player, args) => {
            if (args[0] === SKILL) sync(player);
        });
        wrap(target, "unmarkSkill", (player, args) => {
            if (args[0] === SKILL) sync(player);
        });
        wrap(target, "awakenSkill", (player, args) => {
            if (args[0] === AWAKEN_SKILL) playAwaken(player);
        });
        wrap(target, "removeSkill", (player, args) => {
            const name = args[0];
            if (name === SKILL || (Array.isArray(name) && name.includes(SKILL))) destroy(player);
        });
    }
}

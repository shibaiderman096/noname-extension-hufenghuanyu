/**
 * 孤胆 · 胆标记进度条 UI（只读 UI 层，不改任何技能逻辑）
 *
 * 做了什么：
 *  - 读取 player.countMark("hfhy_gudan")，在武将牌上沿画一条进度条
 *  - 每个待解锁技能是一个节点（2 龙胆 / 6 绝境 / 10 怀幼 / 14 破围）
 *  - 未解锁 = 灰色圆点；达到解锁数 = 橙色 + 静态火苗；14 枚全部解锁 = 进度条转金色
 *  - 通过“包装” player.markSkill 刷新：孤胆每次加标记后都会 markSkill("hfhy_gudan")
 *
 * 不会做的事：不改 skill.js，不触发/拦截任何事件，不写入 storage。
 */
import { lib, game, ui, get, ai, _status } from "noname";

const SKILL = "hfhy_gudan";
const MARK = "hfhy_gudan";
const KEY = "_hfhyGudanUI";
const STYLE_ID = "hfhy-gudan-ui-style";
const MAX = 14; // 胆标记上限

// 需解锁的技能节点：达到 need 枚“胆”时解锁
const NODES = [
    { name: "龙胆", need: 2 },
    { name: "绝境", need: 6 },
    { name: "怀幼", need: 10 },
    { name: "破围", need: 14 },
];

const CSS = `
.hfhy-gudan-ui{
    position:absolute !important; left:50%; top:var(--hfhy-gudan-top,-20px);
    transform:translateX(-50%);
    display:flex !important; flex-direction:row !important; align-items:center; justify-content:center;
    padding:7px 9px 5px; border-radius:999px;
    background:rgba(0,0,0,.58);
    box-shadow:0 0 0 1px rgba(255,255,255,.12), 0 1px 4px rgba(0,0,0,.6);
    pointer-events:none; z-index:20; white-space:nowrap;
    opacity:0; transition:opacity .25s, background .3s, box-shadow .3s;
    width:auto !important; height:auto !important; box-sizing:border-box !important;
}
.hfhy-gudan-ui.show{ opacity:1; }
.hfhy-gudan-ui.complete{
    background:rgba(46,34,0,.75);
    box-shadow:0 0 0 1px rgba(255,214,92,.8), 0 0 10px rgba(255,196,60,.55);
}
.player.dead > .hfhy-gudan-ui{ display:none; }

.hfhy-gudan-track{
    position:relative !important; left:auto !important; top:auto !important; right:auto !important; bottom:auto !important;
    display:block !important; flex:0 0 auto !important; margin:0 3px !important;
    width:var(--hfhy-gudan-width,190px) !important; height:6px !important;
    border-radius:999px; background:rgba(255,255,255,.16);
    box-shadow:inset 0 0 2px rgba(0,0,0,.6);
    transition:box-shadow .3s;
}
.hfhy-gudan-ui.complete .hfhy-gudan-track{
    box-shadow:inset 0 0 2px rgba(0,0,0,.6), 0 0 6px rgba(255,196,60,.6);
}

.hfhy-gudan-fill{
    position:absolute !important; left:0; top:0; bottom:0;
    width:0; border-radius:999px;
    background:linear-gradient(to right,#8a8a8a,#bcbcbc);
    transition:width .3s ease, background .3s;
}
.hfhy-gudan-ui.complete .hfhy-gudan-fill{
    background:linear-gradient(to right,#ffd76a,#ffb300);
}

.hfhy-gudan-node{
    position:absolute !important; top:50%; margin:0 !important;
    display:flex !important; align-items:center !important; justify-content:center !important;
    width:17px !important; height:17px !important;
    border-radius:50%;
    transform:translate(-50%,-50%);
    font-size:11px; line-height:1; font-weight:bold;
    background:#6f6f6f; color:#d8d8d8;
    text-shadow:0 1px 1px rgba(0,0,0,.55);
    box-shadow:0 0 0 1px rgba(0,0,0,.55), inset 0 0 2px rgba(0,0,0,.5);
    transition:background .3s, box-shadow .3s, transform .3s, color .3s;
}
/* 达到解锁数：橙色 + 静态火苗 */
.hfhy-gudan-node[data-state="unlocked"]{
    background:radial-gradient(circle at 50% 72%, #ffe08a 0%, #ff9d2e 48%, #ff6a00 100%);
    color:#401f00; text-shadow:0 1px 0 rgba(255,235,190,.6);
    box-shadow:0 0 0 1px rgba(120,40,0,.65), 0 0 6px 2px rgba(255,140,0,.85), 0 0 12px 4px rgba(255,90,0,.45);
    transform:translate(-50%,-50%) scale(1.12);
}
.hfhy-gudan-node[data-state="unlocked"]::after{
    content:""; position:absolute !important; left:50%; top:-8px; margin-left:-3.5px;
    width:7px; height:9px;
    background:linear-gradient(to top,#ff6a00,#ffd76a);
    border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);
    box-shadow:0 0 5px rgba(255,150,0,.9);
}
/* 全部解锁：进度条与节点转金色 */
.hfhy-gudan-ui.complete .hfhy-gudan-node[data-state="unlocked"]{
    background:radial-gradient(circle at 50% 72%, #fff6c9 0%, #ffd24a 48%, #f0a500 100%);
    color:#4a3200; text-shadow:0 1px 0 rgba(255,255,255,.6);
    box-shadow:0 0 0 1px rgba(120,80,0,.7), 0 0 6px 2px rgba(255,214,92,.95), 0 0 13px 5px rgba(255,196,60,.55);
}
.hfhy-gudan-ui.complete .hfhy-gudan-node[data-state="unlocked"]::after{
    background:linear-gradient(to top,#f0a500,#fff6c9);
    box-shadow:0 0 6px rgba(255,214,92,.95);
}
`;

function ensureStyle() {
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }
}

function build(player, c) {
    const el = document.createElement("div");
    el.className = "hfhy-gudan-ui";
    const width = player.offsetWidth || 220;
    el.style.setProperty("--hfhy-gudan-width", Math.max(70, Math.min(width - 18, 210)) + "px");

    const track = document.createElement("div");
    track.className = "hfhy-gudan-track";
    const fill = document.createElement("div");
    fill.className = "hfhy-gudan-fill";
    track.appendChild(fill);

    c.nodes = NODES.map(node => {
        const dot = document.createElement("div");
        dot.className = "hfhy-gudan-node";
        dot.dataset.state = "locked";
        dot.style.left = ((node.need / MAX) * 100).toFixed(2) + "%";
        dot.title = `${node.name}（${node.need}胆）`;
        // 节点上显示技能首字
        dot.textContent = node.name[0];
        track.appendChild(dot);
        return dot;
    });

    el.appendChild(track);
    player.appendChild(el);
    c.el = el;
    c.fill = fill;
    requestAnimationFrame(() => el.classList.add("show"));
}

function paint(c, marks) {
    c.nodes.forEach((dot, i) => {
        const state = marks >= NODES[i].need ? "unlocked" : "locked";
        if (dot.dataset.state !== state) dot.dataset.state = state;
    });
    c.fill.style.width = (Math.max(0, Math.min(marks, MAX)) / MAX) * 100 + "%";
    c.el.classList.toggle("complete", marks >= MAX);
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

/** 根据标记数同步 UI（只读） */
function sync(player) {
    if (!player || !player.node) return;
    if (typeof player.hasSkill == "function" && !player.hasSkill(SKILL)) {
        destroy(player);
        return;
    }
    const marks = (typeof player.countMark == "function" && player.countMark(MARK)) || 0;
    let c = player[KEY];
    if (!c) {
        c = player[KEY] = { el: null, fill: null, nodes: [] };
        build(player, c);
    }
    paint(c, marks);
}

function wrap(target, name, after) {
    const orig = target[name];
    if (typeof orig !== "function" || orig._hfhyGudan) return;
    const wrapped = function (...args) {
        const result = orig.apply(this, args);
        try {
            after(this, args);
        } catch (e) {
            console.error("[孤胆UI]", e);
        }
        return result;
    };
    wrapped._hfhyGudan = true;
    target[name] = wrapped;
}

/** 在 extension 的 precontent 里调用一次（必须早于玩家节点创建） */
export function initGudanUI() {
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
        wrap(target, "removeSkill", (player, args) => {
            const name = args[0];
            if (name === SKILL || (Array.isArray(name) && name.includes(SKILL))) destroy(player);
        });
    }
}

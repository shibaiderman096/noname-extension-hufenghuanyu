/**
 * 顾曲 · 花色谱 UI（只读 UI 层，不改任何技能逻辑）
 *
 * 做了什么：
 *  - 读取 player.storage 里的 hfhy_guqu_pu / hfhy_guqu_pos / hfhy_guqu_correct
 *  - 在武将牌上沿显示一排花色：空心 = 未验证 / 当前位，实心 = 合律，变暗保持空心 = 未合律（跳过）
 *  - 通过“包装” player.markSkill 来刷新：顾曲每推进一格、生成新谱，都会调用 markSkill("hfhy_guqu")
 *
 * 不会做的事：不改 skill.js，不触发/拦截任何事件，不写入 storage。
 */
import { lib, game, ui, get, ai, _status } from "noname";

const SKILL = "hfhy_guqu";
const KEY = "_hfhyGuquUI";
const STYLE_ID = "hfhy-guqu-ui-style";
const DEFS_ID = "hfhy-guqu-ui-defs";
const FINISH_SHOW_MS = 1600; // 验证完毕后，结果停留多久再收起
const FX_SHOW_MS = 6000; // 全部命中特效停留时长

// 四种花色的形状（24x24 视窗内，整体缩到 80% 留出描边空间）
const SHAPES = {
    spade: `<path d="M12 1.5C12 1.5 3 9 3 14c0 3 2.3 4.8 4.6 4.8 1.7 0 3-.8 3.7-2-.1 2.7-1.1 4.2-3.3 5.7h8c-2.2-1.5-3.2-3-3.3-5.7.7 1.2 2 2 3.7 2 2.3 0 4.6-1.8 4.6-4.8C21 9 12 1.5 12 1.5z"/>`,
    heart: `<path d="M12 21.5C5 15.5 2 12 2 8.2 2 5.2 4.3 3 7 3c2 0 3.9 1.1 5 3 1.1-1.9 3-3 5-3 2.7 0 5 2.2 5 5.2 0 3.8-3 7.3-10 13.3z"/>`,
    club: `<circle cx="12" cy="6.8" r="4.6"/><circle cx="6.4" cy="14" r="4.6"/><circle cx="17.6" cy="14" r="4.6"/><path d="M12 11l-2.6 11.5h5.2z"/>`,
    diamond: `<path d="M12 1.5L21 12l-9 10.5L3 12z"/>`,
};
const SHAPE_TRANSFORM = "translate(2.4 2.4) scale(.8)";
const RED = { heart: true, diamond: true };

const CSS = `
.hfhy-guqu-ui{
    position:absolute; left:50%; top:var(--hfhy-guqu-top,-18px);
    transform:translateX(-50%);
    display:flex !important; flex-direction:row !important; align-items:center; justify-content:center; gap:3px;
    padding:1px 5px; border-radius:999px;
    background:rgba(0,0,0,.58);
    box-shadow:0 0 0 1px rgba(255,255,255,.12), 0 1px 4px rgba(0,0,0,.6);
    pointer-events:none; z-index:20; white-space:nowrap;
    opacity:0; transition:opacity .25s;
}
.hfhy-guqu-ui.show{ opacity:1; }
.player.dead > .hfhy-guqu-ui{ display:none; }

.hfhy-guqu-ui{ box-sizing:border-box !important; width:auto !important; height:auto !important; }
.hfhy-guqu-slot{
    position:relative !important; left:auto !important; top:auto !important; right:auto !important; bottom:auto !important;
    flex:0 0 auto !important; display:block !important; margin:0 !important;
    width:var(--hfhy-guqu-size,16px) !important; height:var(--hfhy-guqu-size,16px) !important;
    color:#e8e8e8; transition:opacity .25s, color .25s, transform .25s;
}
.hfhy-guqu-slot.red{ color:#ff5a5a; }
.hfhy-guqu-slot svg{ width:100%; height:100%; display:block; overflow:visible; }
.hfhy-guqu-slot .fill{ opacity:0; transform-box:fill-box; transform-origin:center; transition:opacity .2s; }

.hfhy-guqu-slot[data-state="pending"]{ opacity:.8; }
.hfhy-guqu-slot[data-state="current"]{ transform:scale(1.18); filter:drop-shadow(0 0 3px #ffd54a); animation:hfhy-guqu-pulse 1.1s ease-in-out infinite; }
.hfhy-guqu-slot[data-state="hit"]{ filter:drop-shadow(0 0 3px currentColor); }
.hfhy-guqu-slot[data-state="hit"] .fill{ opacity:1; animation:hfhy-guqu-pop .5s cubic-bezier(.2,1.4,.4,1); }
.hfhy-guqu-slot[data-state="miss"]{ color:#8a8a8a; opacity:.35; }

@keyframes hfhy-guqu-pop{ 0%{transform:scale(.2)} 60%{transform:scale(1.35)} 100%{transform:scale(1)} }
@keyframes hfhy-guqu-pulse{ 50%{ opacity:.55; } }
/* ---- 全部命中：屏幕正中的绿色扇形 + 四花色 ---- */
.hfhy-guqu-fx{
    position:absolute; left:50%; top:var(--hfhy-guqu-fx-y,50%); width:0; height:0;
    pointer-events:none; z-index:50;
    animation:hfhy-guqu-fxlife ${FX_SHOW_MS}ms linear forwards;
}
.hfhy-guqu-fx > div{ position:absolute; pointer-events:none; }
.hfhy-guqu-fan{
    left:-150px; top:-150px; width:300px !important; height:300px !important;
    background:conic-gradient(from 180deg at 50% 100%, transparent 0deg, rgba(38,166,91,.15) 24deg, rgba(64,196,110,.55) 90deg, rgba(38,166,91,.15) 156deg, transparent 180deg);
    border-radius:50%;
    -webkit-mask:radial-gradient(circle at 50% 100%, transparent 0 26%, #000 38% 96%, transparent 100%);
    mask:radial-gradient(circle at 50% 100%, transparent 0 26%, #000 38% 96%, transparent 100%);
    transform-origin:50% 100%;
    opacity:0;
    animation:hfhy-guqu-fan 1.6s cubic-bezier(.25,.9,.3,1) .15s forwards, hfhy-guqu-fanfade 1s ease-in 4.2s forwards;
}
.hfhy-guqu-fan::after{
    content:""; position:absolute; inset:0; border-radius:50%;
    background:conic-gradient(from 180deg at 50% 100%, transparent 0deg, rgba(212,255,224,.5) 60deg, rgba(212,255,224,.9) 90deg, rgba(212,255,224,.5) 120deg, transparent 180deg);
    -webkit-mask:radial-gradient(circle at 50% 100%, transparent 0 30%, #000 36% 40%, transparent 46%);
    mask:radial-gradient(circle at 50% 100%, transparent 0 30%, #000 36% 40%, transparent 46%);
}
.hfhy-guqu-fxsuit{
    left:0; top:0; width:44px !important; height:44px !important; margin:-22px 0 0 -22px;
    color:var(--c,#eee);
    filter:drop-shadow(0 0 4px var(--c,#eee)) drop-shadow(0 0 10px rgba(60,200,120,.6));
    opacity:0;
    animation:hfhy-guqu-suit 1.1s cubic-bezier(.25,1.2,.35,1) var(--d,0s) forwards, hfhy-guqu-fxout .8s ease-in 5s forwards;
}
.hfhy-guqu-fxsuit svg{ width:100%; height:100%; display:block; overflow:visible; }
.hfhy-guqu-fxsuit .fill{ opacity:1; }
@keyframes hfhy-guqu-fxlife{ 0%,94%{opacity:1} 100%{opacity:0} }
@keyframes hfhy-guqu-fan{
    0%{ transform:scale(.35) rotate(-26deg); opacity:0; }
    50%{ opacity:.9; }
    100%{ transform:scale(1) rotate(0deg); opacity:1; }
}
@keyframes hfhy-guqu-fanfade{ to{ opacity:.15; } }
@keyframes hfhy-guqu-suit{
    0%{ transform:scale(.25); opacity:0; }
    45%{ transform:scale(1.22); opacity:1; }
    70%{ transform:scale(.96); opacity:1; }
    100%{ transform:scale(1); opacity:1; }
}
@keyframes hfhy-guqu-fxout{ to{ transform:scale(.9); opacity:0; } }
`;

/** 注入样式，以及共享的 <defs>（形状 + 镜像遮罩，用来画“空心”轮廓） */
function ensureAssets() {
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
    }
    if (!document.getElementById(DEFS_ID)) {
        let defs = "";
        for (const [suit, body] of Object.entries(SHAPES)) {
            defs += `<g id="hfhy-guqu-shape-${suit}" transform="${SHAPE_TRANSFORM}">${body}</g>`;
            // 遮罩：把形状内部挖掉，只留向外扩出的一圈 → 空心轮廓
            defs += `<mask id="hfhy-guqu-mask-${suit}" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">` +
                `<rect width="24" height="24" fill="#fff"/>` +
                `<use href="#hfhy-guqu-shape-${suit}" xlink:href="#hfhy-guqu-shape-${suit}" fill="#000" stroke="none"/>` +
                `</mask>`;
        }
        const holder = document.createElement("div");
        holder.id = DEFS_ID;
        holder.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;";
        holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0"><defs>${defs}</defs></svg>`;
        (document.body || document.documentElement).appendChild(holder);
    }
}

function slotHTML(suit) {
    const ref = `#hfhy-guqu-shape-${suit}`;
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
        `<g mask="url(#hfhy-guqu-mask-${suit})"><use href="${ref}" xlink:href="${ref}" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></g>` +
        `<use class="fill" href="${ref}" xlink:href="${ref}" fill="currentColor"/>` +
        `</svg>`;
}

/** 全部命中：在屏幕正中播放一次“绿色扇形 + 四花色”特效（只读展示，不改技能） */
function showAllHitFx(player) {
    // 只创建一次，避免 markSkill 连续触发时叠加
    if (document.querySelector(".hfhy-guqu-fx")) return;
    const fx = document.createElement("div");
    fx.className = "hfhy-guqu-fx";
    // 与“一身是胆”特效同挂载点，确保屏幕正中
    (ui.window || ui.arena || document.body).appendChild(fx);
    setTimeout(() => fx.remove(), FX_SHOW_MS + 200);

    const fan = document.createElement("div");
    fan.className = "hfhy-guqu-fan";
    fx.appendChild(fan);

    const suits = ["spade", "heart", "club", "diamond"];
    // 花色沿扇形弧线分布：半径 120px，角度从 205° 到 335°（180° 是正右，270° 是正上）
    const suitColors = { spade: "#e8e8e8", heart: "#ff5a5a", club: "#9ad48a", diamond: "#ff5a5a" };
    suits.forEach((suit, i) => {
        const angle = 205 + i * 43;
        const rad = angle * Math.PI / 180;
        const x = 120 * Math.cos(rad);
        const y = 120 * Math.sin(rad);
        const el = document.createElement("div");
        el.className = "hfhy-guqu-fxsuit";
        el.style.setProperty("--c", suitColors[suit]);
        el.style.setProperty("--d", 0.7 + i * 0.28 + "s");
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.left = x + "px";
        el.style.top = y + "px";
        el.innerHTML = slotHTML(suit);
        fx.appendChild(el);
    });
}

function build(player, c) {
    const el = document.createElement("div");
    el.className = "hfhy-guqu-ui";
    const n = c.pu.length;
    const width = player.offsetWidth || 0;
    // 谱越长，格子越小，保证不超出武将牌宽度
    const size = width ? Math.max(10, Math.min(18, Math.floor((width - 14) / n) - 2)) : 16;
    el.style.setProperty("--hfhy-guqu-size", size + "px");
    c.slots = c.pu.map(suit => {
        const slot = document.createElement("div");
        slot.className = "hfhy-guqu-slot" + (RED[suit] ? " red" : "");
        slot.dataset.state = "pending";
        slot.innerHTML = slotHTML(suit);
        el.appendChild(slot);
        return slot;
    });
    player.appendChild(el);
    c.el = el;
    // 下一帧再加 show，触发淡入
    requestAnimationFrame(() => el.classList.add("show"));
}

function paint(c, pos) {
    c.slots.forEach((slot, i) => {
        let state;
        if (i < c.results.length) state = c.results[i] ? "hit" : "miss";
        else if (i === pos) state = "current";
        else state = "pending";
        if (slot.dataset.state !== state) slot.dataset.state = state;
    });
}

function destroy(player) {
    const c = player[KEY];
    if (!c) return;
    player[KEY] = null;
    clearTimeout(c.timer);
    if (c.el) {
        c.el.classList.remove("show");
        setTimeout(() => c.el.remove(), 300);
    }
}

/** 根据 storage 同步 UI（只读） */
function sync(player) {
    if (!player) return;
    const st = player.storage || {};
    const pu = Array.isArray(st.hfhy_guqu_pu) ? st.hfhy_guqu_pu : [];
    const pos = st.hfhy_guqu_pos || 0;
    const correct = st.hfhy_guqu_correct || 0;
    let c = player[KEY];

    if (!pu.length) {
        // 结算中的结果由定时器收起，其余情况（技能被移除、谱被清空）直接收起
        if (c && !c.finishing) destroy(player);
        return;
    }

    // 谱数组是技能生成的新对象 → 视为新一轮谱，重建
    if (!c || c.pu !== pu) {
        if (c) destroy(player);
        c = player[KEY] = { pu, results: [], hits: 0, el: null, slots: [], finishing: false, timer: 0 };
        build(player, c);
    }

    // 逐格补全结果：正确数每增加 1 → 该格合律；没增加 → 该格未合律（跳过）
    const upTo = Math.min(pos, pu.length);
    while (c.results.length < upTo) {
        const hit = correct > c.hits;
        if (hit) c.hits++;
        c.results.push(hit);
    }
    paint(c, pos);

    // 最后一格验证完：停留片刻再收起（技能那边随后会清空谱）
    if (pos >= pu.length && !c.finishing) {
        c.finishing = true;
        // 全部命中：屏幕正中播放绿色扇形特效
        if (c.results.length === pu.length && c.results.every(Boolean)) {
            showAllHitFx(player);
        }
        c.timer = setTimeout(() => {
            if (player[KEY] === c) destroy(player);
        }, FINISH_SHOW_MS);
    }
}

function wrap(target, name, after) {
    const orig = target[name];
    if (typeof orig !== "function" || orig._hfhyGuqu) return;
    const wrapped = function (...args) {
        const result = orig.apply(this, args);
        try {
            after(this, args);
        } catch (e) {
            console.error("[顾曲UI]", e);
        }
        return result;
    };
    wrapped._hfhyGuqu = true;
    target[name] = wrapped;
}

/** 在 extension 的 precontent 里调用一次（必须早于玩家节点创建） */
export function initGuquUI() {
    ensureAssets();
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

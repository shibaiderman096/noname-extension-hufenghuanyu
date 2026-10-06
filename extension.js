import { lib, game, ui, get, ai, _status } from "noname";
import { skills } from "./skill.js";
import { cards, cardSkills } from "./card.js";
import { changelog, changelogLatest } from "./changelog.js";
import dynamicTranslates from "./dynamicTranslates.js"

const CHARACTER_PREFIXES = {
    kuang: "狂",
    shang: "商",
    ming: "命",
    po: "魄",
    yong: "勇",
};
const CHARACTER_NAMES = {
    kuang_dongzhuo: "董卓",
    shang_mizhu: "麋竺",
    kuang_zhonghui: "钟会",
    shang_zhangfei: "张飞",
    ming_zhugeliang: "诸葛亮",
    kuang_guanyu: "关羽",
    po_dengai: "邓艾",
    kuang_lvbu: "吕布",
    ming_zhangjiao: "张角",
    po_ganning: "甘宁",
    ming_jiangwei: "姜维",
    po_machao: "马超",
    kuang_huangzhong: "黄忠",
    shang_caohong: "曹洪",
    yong_huangyueying: "黄月英",
    yong_xiaoqiao: "小乔",
    yong_sunshangxiang: "孙尚香",
    po_huanggai: "黄盖",
    po_zhaoyun: "赵云",
    ming_guojia: "郭嘉",
};
// 主名与短前缀分离，运行时拼成“狂董卓”并写入 _prefix 供引擎拆分显示
const characterTranslates = Object.fromEntries(
    Object.entries(CHARACTER_NAMES).flatMap(([id, name]) => {
        const prefix = CHARACTER_PREFIXES[id.split("_")[0]];
        return [
            [id, prefix + name],
            [`${id}_prefix`, prefix],
        ];
    })
);
const CHARACTER_PREFIX_STYLES = {
    "狂": { color: "#e74c3c" },
    "商": { color: "#d4af37" },
    "命": { color: "#4fc3f7" },
    "魄": { color: "#9b8cff" },
    "勇": { color: "#35c76f" },
};

const REPO_URL = "https://github.com/shibaiderman096/noname-extension-hufenghuanyu";
// 用系统默认浏览器打开链接：Electron 的 window.open 会开内嵌窗口，须走 shell.openExternal；
// 多级回退：@electron/remote → electron remote → child_process start → game.open
function openExternal(url) {
    const getRequire = () => {
        try {
            if (typeof require === "function") return require;
        } catch (e) {}
        return window.require || globalThis.require || null;
    };
    const candidates = ["@electron/remote", "electron"];
    for (const name of candidates) {
        try {
            const req = getRequire();
            if (!req) break;
            const remote = req(name);
            const shell = remote && (remote.shell || (remote.default && remote.default.shell));
            if (shell && typeof shell.openExternal === "function") {
                shell.openExternal(url);
                return;
            }
        } catch (e) {}
    }
    try {
        const req = getRequire();
        if (req) {
            const cp = req("child_process");
            if (cp && typeof cp.exec === "function") {
                cp.exec(`start "" "${url}"`);
                return;
            }
        }
    } catch (e) {}
    game.open(url);
}
// 版本号比较：返回 1(a>b) / -1(a<b) / 0
function compareVersion(a, b) {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x > y) return 1;
        if (x < y) return -1;
    }
    return 0;
}
function getCurrentVersion() {
    return (lib.extensionPack["呼风唤雨"] || lib.extensionPack["extension_呼风唤雨"] || {}).version || "1.0";
}
export const type = "extension";
export default function(){
	return {name:"呼风唤雨",editable:false,connect:false,arenaReady:function(){

	},content:function(config,pack){
            Object.assign(lib.dynamicTranslate, dynamicTranslates);
            for (const [prefix, style] of Object.entries(CHARACTER_PREFIX_STYLES)) {
                lib.namePrefix.set(prefix, style);
            }
	},prepare:function(){

	},precontent:function(config){
        lib.characterSubstitute["kuang_zhonghui"] = [
        ["qun_kuang_zhonghui", ["ext:/呼风唤雨/image/kuang_zhonghui1.jpg", ""]]
    ];
        lib.characterSubstitute["shang_zhangfei"] = [
        ["shu_shang_zhangfei", ["ext:/呼风唤雨/image/shang_zhangfei1.jpg", ""]]
    ];
        lib.characterSubstitute["ming_zhugeliang"] = [
        ["1_ming_zhugeliang", ["ext:/呼风唤雨/image/ming_zhugeliang1.png", ""]],
        ["2_ming_zhugeliang", ["ext:/呼风唤雨/image/ming_zhugeliang2.png", ""]],
    ];
        lib.characterSubstitute["kuang_guanyu"] = [
        ["1_kuang_guanyu", ["ext:/呼风唤雨/image/kuang_guanyu1.png", ""]],
    ];
        lib.characterSubstitute["ming_zhangjiao"] = [
        ["1_ming_zhangjiao", ["ext:/呼风唤雨/image/ming_zhangjiao1.png", ""]],
    ];
        lib.characterSubstitute["ming_jiangwei"] = [
        ["1_ming_jiangwei", ["ext:/呼风唤雨/image/ming_jiangwei1.png", ""]],
    ];
        lib.characterSubstitute["yong_sunshangxiang"] = [
        ["shu_yong_sunshangxiang", ["ext:/呼风唤雨/image/yong_sunshangxiang1.png", ""]]
    ];
	},help:{},config:{
    "版本号": {
        // getter 延迟求值：模块加载时 lib.extensionPack 尚未注册，直接拼接会显示兜底的 1.0
        get name() {
            return "当前版本：v" + getCurrentVersion();
        },
        clear: true,
        nopointer: true,
        onclick() {
            return false;
        },
    },
    "最新更新": {
        // clear 条目支持 HTML：展示最新一版的更新摘要（由 _gen_changelog.cjs 自动生成）
        name: changelogLatest,
        clear: true,
        nopointer: true,
        onclick() {
            return false;
        },
    },
    "更新日志": {
        name: "更新日志",
        clear: true,
        intro: "查看历次版本更新内容",
        onclick() {
            if (ui.changelogPanel) {
                ui.changelogPanel.remove();
            }
            const panel = ui.create.div(".dialog.static", changelog);
            panel.style.cssText += ";position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,86%);max-height:72%;overflow-y:auto;z-index:9999;";
            const close = ui.create.div(".menubutton.large", "关闭", panel);
            close.style.cssText += ";position:sticky;top:4px;float:right;margin-right:6px;";
            close.onclick = () => panel.remove();
            panel.onclick = e => {
                if (e.target === panel) {
                    panel.remove();
                }
            };
            ui.window.appendChild(panel);
            ui.changelogPanel = panel;
            // 返回 false 防止菜单项开关状态闪烁
            return false;
        },
    },
    "检查更新": {
        name: "检查更新",
        clear: true,
        intro: "联网检查 GitHub 上的最新版本",
        onclick() {
            const current = getCurrentVersion();
            const handleTag = tag => {
                const cmp = compareVersion(tag, current);
                if (cmp > 0) {
                    if (confirm(`发现新版本 v${tag}（当前 v${current}），是否打开发布页下载？`)) {
                        openExternal(`${REPO_URL}/releases/tag/v${tag}`);
                    }
                } else if (cmp === 0) {
                    alert(`当前已是最新版本 v${current}`);
                } else {
                    alert(`当前版本 v${current} 比线上 v${tag} 更新`);
                }
            };
            // 第二级：GitHub API（有 60 次/小时的未认证限流，限流时展示其 message）
            const tryApi = () => {
                const xhr = new XMLHttpRequest();
                xhr.open("GET", `https://api.github.com/repos/shibaiderman096/noname-extension-hufenghuanyu/releases/latest`);
                xhr.onload = () => {
                    try {
                        const info = JSON.parse(xhr.responseText);
                        const tag = (info.tag_name || "").replace(/^v/, "");
                        if (tag) {
                            handleTag(tag);
                        } else {
                            alert("检查更新失败：" + (info.message || "未获取到版本信息"));
                        }
                    } catch (e) {
                        alert("检查更新失败：无法解析版本信息");
                    }
                };
                xhr.onerror = () => alert("检查更新失败：无法连接 GitHub（可能需要网络代理）");
                xhr.send();
            };
            try {
                // 第一级：releases 页面（无限流），/releases/latest 会 302 到 /releases/tag/vX.Y.Z，
                // 从最终 URL（responseURL）解析最新版本号；CORS 拦截或异常时退回 API
                const xhr = new XMLHttpRequest();
                xhr.open("GET", REPO_URL + "/releases/latest");
                xhr.onload = () => {
                    const m = (xhr.responseURL || "").match(/\/releases\/tag\/v?([0-9][0-9.]*)/);
                    if (m) {
                        handleTag(m[1]);
                    } else {
                        tryApi();
                    }
                };
                xhr.onerror = tryApi;
                xhr.send();
            } catch (e) {
                tryApi();
            }
            return false;
        },
    },
    "仓库地址": {
        // clear 条目的显示文本即 name：提示点击跳转浏览器，完整链接放悬停提示
        name: "仓库地址（点击跳转）",
        clear: true,
        nopointer: false,
        intro: REPO_URL,
        onclick() {
            openExternal(REPO_URL);
            return false;
        },
    },
},package:{
    character: {
        character: {
            "kuang_dongzhuo": {
                sex: "male",
                group: "qun",
                hp: 3,
                maxHp: 4,
                hujia: 1,
                skills: ["hfhy_kuangzhan","hfhy_tuxi","hfhy_poji"],
                img: "extension/呼风唤雨/image/kuang_dongzhuo.jpg",
                dieAudios: ["new_yj_dongzhuo.mp3"],
            },
            "shang_mizhu": {
                sex: "male",
                group: "shu",
                hp: 4,
                maxHp: 4,
                hujia: 0,
                skills: ["hfhy_shanglue","hfhy_liancai","hfhy_quedi"],
                img: "extension/呼风唤雨/image/shang_mizhu.jpg",
                dieAudios: ["mizhu.mp3"],
            },
            "kuang_zhonghui": {
                sex: "male",
                group: "wei",
                hp: 3,
                maxHp: 3,
                hujia: 1,
                skills: ["hfhy_xiaoju","hfhy_choufa"],
                img: "extension/呼风唤雨/image/kuang_zhonghui.jpg",
                doubleGroup: ["wei","qun"],
                dieAudios: ["re_zhonghui.mp3"],
            },
            "shang_zhangfei":{
                sex:"male",
                group:"qun",
                hp:3,
                maxHp:3,
                skills:["hfhy_jizi","hfhy_jiace","hfhy_guihan","hfhy_wandi"],
                img:"extension/呼风唤雨/image/shang_zhangfei.jpg",
                doubleGroup:["qun","shu"],
                dieAudios: ["sb_zhangfei.mp3"],
            },
            "ming_zhugeliang":{
                sex:"male",
                group:"qun",
                hp:3,
                maxHp:5,
                skills:["hfhy_sangu","hfhy_zhongwang","hfhy_mzgl_bagua"],
                img:"extension/呼风唤雨/image/ming_zhugeliang.png",
                doubleGroup:["qun","shu"],
                names: "诸葛|亮",
                dieAudios: ["friend_zhugeliang.mp3"],
            },
            "kuang_guanyu":{
                sex:"male",
                group:"wei",
                hp:4,
                maxHp:4,
                skills:["hfhy_danqi","hfhy_zhanjiang","hfhy_wusheng"],
                doubleGroup:["wei","shu"],
                img:"extension/呼风唤雨/image/kuang_guanyu.png",
                dieAudios: ["ext:呼风唤雨/audio/po_guanyu.mp3"],
            },
            "po_dengai":{
                sex:"male",
                group:"wei",
                hp:4,
                maxHp:4,
                skills:["hfhy_zaoxian","hfhy_tuntian","hfhy_poshu"],
                img:"extension/呼风唤雨/image/po_dengai.png",
                dieAudios: ["pot_dengai.mp3"],
            },
            "kuang_lvbu":{
                sex:"male",
                group:"qun",
                hp:4,
                maxHp:5,
                skills:["hfhy_wushuang","hfhy_chengxiong","hfhy_shiyong"],
                img:"extension/呼风唤雨/image/kuang_lvbu.png",                
                dieAudios: ["sb_lvbu.mp3"],
            },
            "ming_zhangjiao": {
                sex: "male",
                group: "qun",
                hp: 3,
                maxHp: 3,
		        isZhugong: true,
                skills: ["hfhy_yingtian", "hfhy_budao","hfhy_huangtian","hfhy_tianli"],
                dieAudios: ["sp_zhangjiao.mp3"],
                img: "extension/呼风唤雨/image/ming_zhangjiao.png",
            },
            "po_ganning": {
                sex: "male",
                group: "wu",
                hp: 3,
                maxHp: 3,
                skills: ["hfhy_jieying","hfhy_talang"],
                dieAudios: ["sb_ganning.mp3"],
                img: "extension/呼风唤雨/image/po_ganning.png",
            },
            "ming_jiangwei": {
                sex: "male",
                group: "shu",
                hp: 4,
                maxHp: 4,
                skills: ["hfhy_jizhi"],
                doubleGroup: ["shu", "wei"],
                img: "extension/呼风唤雨/image/ming_jiangwei.png",
                dieAudios:["sp_jiangwei.mp3"]
            },
            "po_machao": {
                sex: "male",
                group: "qun",
                hp: 4,
                maxHp: 4,
                skills: ["hfhy_tieji","hfhy_mashu","hfhy_qiangzhu","hfhy_xuechou"],
                doubleGroup: ["qun", "shu"],
                dieAudios:["sp_machao.mp3","sb_machao.mp3"],
                img: "extension/呼风唤雨/image/po_machao.png",
            },
            "kuang_huangzhong": {
                sex: "male",
                group: "shu",
                hp: 4,
                maxHp: 4,
                skills: ["hfhy_muxiong","hfhy_dingjun"],
                img: "extension/呼风唤雨/image/kuang_huangzhong.png",
                dieAudios:["sb_huangzhong.mp3"],
            },
            "shang_caohong": {
                sex: "male",
                group: "wei",
                hp: 3,
                maxHp: 3,
                skills: ["hfhy_jicai","hfhy_tongshang","hfhy_jikun"],
                img: "extension/呼风唤雨/image/shang_caohong.png",
                dieAudios:["caohong.mp3"]
            },
            "yong_huangyueying": {
                sex: "female",
                group: "shu",
                hp: 3,
                maxHp: 3,
                skills: ["hfhy_qiaosi","hfhy_tiangong"],
                img: "extension/呼风唤雨/image/yong_huangyueying.png",
                dieAudios: ["sb_huangyueying.mp3"],
            },
            "yong_xiaoqiao": {
                sex: "female",
                group: "wu",
                hp: 3,
                maxHp: 3,
                skills: ["hfhy_guqu","hfhy_tianxiang"],
                img: "extension/呼风唤雨/image/yong_xiaoqiao.png",
                dieAudios: ["sb_xiaoqiao.mp3"],
            },
            "yong_sunshangxiang": {
                sex: "female",
                group: "wu",
                hp: 3,
                maxHp: 3,
                skills: ["hfhy_lianyin","hfhy_xiaoji"],
                doubleGroup: ["wu","shu"],
                img: "extension/呼风唤雨/image/yong_sunshangxiang.png",
                dieAudios: ["sb_sunshangxiang.mp3"],
            },
            "po_huanggai": {
                sex: "male",
                group: "wu",
                hp: 4,
                maxHp: 4,
                skills: ["hfhy_kurou","hfhy_zhaxiang","hfhy_fenqu"],
                img: "extension/呼风唤雨/image/po_huanggai.png",
                dieAudios: ["dc_sb_huanggai.mp3"],
            },
            "po_zhaoyun": {
                sex: "male",
                group: "shu",
                hp: 2,
                maxHp: 3,
                skills: ["hfhy_gudan"],
                img: "extension/呼风唤雨/image/po_zhaoyun.jpg",
                dieAudios: ["sb_zhaoyun.mp3"],
            },
            "ming_guojia": {
                sex: "male",
                group: "wei",
                hp: 3,
                maxHp: 4,
                skills: ["hfhy_tiandu","hfhy_shisheng","hfhy_yiji"],
                img: "extension/呼风唤雨/image/ming_guojia.png",
                dieAudios: ["guojia.mp3"],
            },

        },
        characterSort: {
            "呼风唤雨": {
                hfhy_kuang: ["kuang_dongzhuo", "kuang_zhonghui", "kuang_guanyu", "kuang_lvbu", "kuang_huangzhong"],
                hfhy_shang: ["shang_mizhu", "shang_zhangfei", "shang_caohong"],
                hfhy_ming: ["ming_zhugeliang", "ming_zhangjiao", "ming_jiangwei", "ming_guojia"],
                hfhy_po: ["po_dengai", "po_ganning", "po_machao", "po_huanggai", "po_zhaoyun"],
                hfhy_yong: ["yong_huangyueying", "yong_xiaoqiao", "yong_sunshangxiang"],
            },
        },
        translate: {            
            "呼风唤雨": "呼风唤雨",
            "hfhy_kuang": "呼风唤雨·狂",
            "hfhy_shang": "呼风唤雨·商",
            "hfhy_ming": "呼风唤雨·命",
            "hfhy_po": "呼风唤雨·魄",
            "hfhy_yong": "呼风唤雨·勇",
            ...characterTranslates,
        },
    },
    card: {
        card: { ...cards },
        // 装备技能随卡注册（官方 card pack 的 skill 段，loadCard 会注入 lib.skill）
        skill: { ...cardSkills },
        translate: {
            "hfhy_pofuchenzhou": "破釜沉舟",
            "hfhy_pofuchenzhou_info": `出牌阶段，对所有与你距离为1的其他角色使用。若其打出${get.poptip("sha")}，其弃置一张牌；若其打出${get.poptip("shan")}，其受到1点伤害；若其未打出牌，跳过其下一个摸牌阶段。当你进入濒死状态时，此牌可视为${get.poptip("tao")}使用。`,
            "hfhy_xueying": "血影挽歌",
            "hfhy_xueying_info": "出牌阶段限一次，你可以失去一点体力，令一名角色获得一点护甲。回合结束时，你将装备区内的“血影挽歌”置于弃牌堆。",
            "hfhy_xueying_skill": "血影挽歌",
            "hfhy_xueying_skill_info": "出牌阶段限一次，你可以失去一点体力，令一名角色获得一点护甲。回合结束时，你将装备区内的“血影挽歌”置于弃牌堆。",
            "hfhy_xueying_discard": "血影挽歌",
        },
        list: [],
    },
    skill: {
        skill: { ...skills },
        translate: {
            "hfhy_kuangzhan": "狂战",
            "hfhy_kuangzhan_info": "锁定技，当你造成或受到伤害后，若你的体力上限小于8，你增加1点体力上限并摸一张牌。",
            "hfhy_tuxi": "突袭",
            "hfhy_tuxi_info": "出牌阶段限一次，你可以弃置X张牌，视为对所有与你距离小于X的角色使用一张不计入次数限制的【杀】。",
            "hfhy_poji": "破极",
            "hfhy_poji_info": `觉醒技，当你造成伤害后，若你的体力上限大于等于8，你将体力上限调整为4并获得一点护甲，获得${get.poptip("hfhy_manzhan")}和${get.poptip("benghuai")}，然后视为使用一张【南蛮入侵】。`,
            "hfhy_manzhan": "蛮战",
            "hfhy_manzhan_info": "当你造成伤害时，若伤害来源的体力上限大于目标角色的体力上限，你可以减1点体力上限，令此伤害+1。",
            "hfhy_liancai": "敛财",
            "hfhy_liancai_info": "当你于回合外失去手牌后，若你当前的手牌数大于等于你的体力值，你摸一张牌。",
            "hfhy_quedi": "却敌",
            "hfhy_quedi_info": "当你成为其他角色使用牌的目标时，你可以交给其X张牌，然后取消之。X为你已损失的体力值（且至少为1）",
            "hfhy_shanglue": "商略",
            "hfhy_shanglue_info": "准备阶段，你可以选择一项：1. 跳过摸牌阶段，然后摸X张牌并失去一点体力；2. 跳过出牌阶段，然后视为你对攻击范围内的一名其他角色使用了一张【杀】，且本回合你的手牌上限+X；3. 跳过弃牌阶段，本回合你不能对其他角色使用牌。",
            "hfhy_xiaoju": "枭据",
			"hfhy_xiaoju_info": `锁定技，觉醒技。你的登场势力为魏。回合结束时，若你的体力上限不小于5,你将势力改为"群"并获得技能${get.poptip("hfhy_pini")}，然后选择一项1.回复1点体力2.摸两张牌3.获得一个"势"标记。`,
            "hfhy_choufa": "筹伐",
            "hfhy_choufa_info": `魏势力技。游戏开始时，你获得两枚\"势\"标记。当你造成或受到伤害后，你获得1枚\"势\"标记。准备阶段或弃牌阶段，若你的\"势\"标记数不小于2， 你可以移去2枚\"势\"标记，选择并获得以下一个技能:${get.poptip("hfhy_jueshi")}；${get.poptip("hfhy_shanbing")}；${get.poptip("hfhy_zhengu")},然后你增加一点体力上限。`,
            "hfhy_jueshi": "决势",
            "hfhy_jueshi_info": "出牌阶段限一次，你可以选择一项1.弃置一张牌，然后视为使用一张无次数限制的【杀】。2.弃置两张牌，然后视为使用一张【无中生有】。背水：你失去一点体力获得一枚“势”标记。",
            "hfhy_shanbing": "擅兵",
            "hfhy_shanbing_info": "你使用的【杀】不可被响应。当你造成伤害时，你可以选择一项1.弃置一张黑色牌令此伤害+1。2.弃置一张红色牌你获得其区域内的一张牌。背水：你失去一点体力获得一枚“势”标记。",
            "hfhy_zhengu": "镇骨",
            "hfhy_zhengu_info": "当你受到伤害时，你可以弃置一张牌，然后将手牌摸至体力上限。若以此法获得的牌数小于2，你获得1枚\"势\"标记。",
            "hfhy_pini": "睥睨",
			"hfhy_pini_info": "群势力技。出牌阶段限一次，你可以选择1.失去一点体力2.移去一枚\"势\"标记，然后视为使用一张普通锦囊牌。",
            "hfhy_jizi":"集资",
            "hfhy_jizi_info":"你的登场势力为群。游戏开始时你可以将牌堆顶的两张牌置于武将牌上，称为「资」。当你于回合外获得牌时，你可以将这些牌置于武将牌上。当你需要使用或打出一张基本牌时，你可以移去一张「资」，视为你使用或打出了此基本牌。",
            "hfhy_jiace":"贾策",
            "hfhy_jiace_info":"群势力技，其他角色的摸牌阶段开始时，你可以交给其一张「资」，令其选择一项：1.视为对其攻击范围内你选择的一名角色使用一张【杀】；2. 你摸两张牌。",
            "hfhy_guihan":"归汉",
            "hfhy_guihan_info":`限定技，准备阶段，若你的「资」不少于3，你可以将势力变更为蜀，然后你获得技能${get.poptip("paoxiao")}。`,
            "hfhy_wandi":"万敌",
            "hfhy_wandi_info":"蜀势力技。当你使用【杀】造成伤害时，你可以移去一张「资」令此伤害+1。",
            "hfhy_mzgl_bagua":"八卦",
            "hfhy_mzgl_bagua_info":`转换技。阳：当你需要使用或打出一张基本牌或锦囊牌时，你可以将一张手牌当做一张${get.poptip("hfhy_mzgl_bagua")}未记录的基本牌或锦囊牌名使用，然后记录此牌名。阴：当你成为其他角色使用牌的目标时，若此牌名未被${get.poptip("hfhy_mzgl_bagua")}记录，你可以记录此牌名，然后令此牌无效并摸一张牌。`,
            "hfhy_danqi":"单骑",
            "hfhy_danqi_info":`使命技，你的登场势力为魏，摸牌阶段开始时，你选择一名其他角色，然后选择一项：1.获得其区域内的一张牌。2.对其使用【杀】无距离限制。背水：你减少一点体力上限。成功：当你杀死一名角色后，你升级技能${get.poptip("hfhy_wusheng_lv2")}，将你的势力变更为蜀，并获得${get.poptip("hfhy_aogu")}。失败：当你进入濒死状态时，你增加一点体力上限并恢复一点体力。`,
            "hfhy_zhanjiang":"斩将",
            "hfhy_zhanjiang_info":"魏势力技，出牌阶段开始时，你展示牌堆顶上的一张牌，若为基本牌，你获得之并恢复一点体力。若为锦囊牌，你从弃牌堆中获得两张基本牌。若为装备牌，此阶段你使用【杀】造成的伤害加一。",
            "hfhy_wusheng":"武圣",
            "hfhy_wusheng_info":"每轮限两次，你可以将一张手牌当作【杀】使用或打出，若为基本牌转换此【杀】无次数限制。若为锦囊牌转换你摸一张牌。若为装备牌转换则不可响应。",
            "hfhy_wusheng_lv2":"武圣（二级）",
            "hfhy_wusheng_lv2_info":"你可以将一张手牌当作【杀】使用或打出，若为基本牌转换此【杀】无次数限制。若为锦囊牌转换你摸一张牌。若为装备牌转换则不可响应。其他角色因此技能转换的【杀】受到伤害时，其弃置一张手牌。",
            "hfhy_aogu":"傲骨",
            "hfhy_aogu_info":"蜀势力技，限定技，出牌阶段，你展示所有手牌然后选择一名其他角色与其拼点，若你赢，你选择其一个区域的所有牌获得之；若你未赢，你从弃牌堆获得所有牌型各一张。",
            "hfhy_zaoxian": "凿险",
            "hfhy_zaoxian_info": "当你使用或打出基本牌时，你可以进行一次判定，若结果为♦︎，你将生效后的判定牌置于你的武将牌上，称为“险”。若结果为♥，你获得此判定牌。你计算与其他角色的距离-X（X为“险”的数量）。",
            "hfhy_tuntian":"屯田",
            "hfhy_tuntian_info":"结束阶段，你可以选择一项：1.弃置至少一张红桃牌，然后从弃牌堆获得两倍的基本牌，以此法获得的牌不计入手牌上限。2.将一张方片手牌置于你的武将牌上。",
            "hfhy_poshu": "破蜀",
            "hfhy_poshu_info": `限定技。一名与你距离为一的其他角色回合结束时，你可以减少一点体力上限并对其造成X点伤害，然后你执行一个额外的回合并获得${get.poptip("hfhy_jixi")}。X为“险”的数量。`,
            "hfhy_jixi": "急袭",
            "hfhy_jixi_info": `出牌阶段限一次，你可以移去一张“险”，对与你距离为一的任意角色视为使用一张${get.poptip("shunshou")}。`,
            "hfhy_wushuang": "无双",
            "hfhy_wushuang_info": `当你使用${get.poptip("sha")}/${get.poptip("juedou")}时，可选择一项：1.额外选择X名你攻击距离以内的其他角色为目标。2.令此${get.poptip("sha")}需X张${get.poptip("shan")}才能抵消；与你进行${get.poptip("juedou")}的角色每次需打出X张${get.poptip("sha")}。背水：你减少一点体力上限，此阶段你使用${get.poptip("hfhy_chengxiong")}的次数+1。每回合限一次，若对方没有使用或打出${get.poptip("sha")}或${get.poptip("shan")}，则此${get.poptip("sha")}或${get.poptip("juedou")}对其造成的伤害+1。X为你本轮发动此技能的次数。`,
            "hfhy_chengxiong": "逞凶",
            "hfhy_chengxiong_info": `出牌阶段限一次，你可以将一张基本牌/锦囊牌视为${get.poptip("sha")}/${get.poptip("juedou")}使用。当你使用${get.poptip("sha")}/${get.poptip("juedou")}造成一点伤害时，你获得一个"勇"标记。`,
            "hfhy_shiyong": "恃勇",
            "hfhy_shiyong_info": `出牌阶段，当你拥有至少3枚"勇"时，你可以移去所有"勇"然后选择一项：1.增加一点体力上限。2.获得一点护甲。3.摸两张牌。`,
            "hfhy_budao": "布道",
            "hfhy_budao_info": `游戏开始时，你获得一个"黄巾"标记。当其他没有"黄巾"的角色进入濒死状态时，你可交给其一张牌令其恢复一点体力并获得一个"黄巾"标记。其他没有"黄巾"的角色的准备阶段开始时，其可以交给你一张牌然后获得一个"黄巾"标记。`,
            "hfhy_yingtian": "应天",
            "hfhy_yingtian_info": `游戏开始时，你可切换阴阳状态。转换技。阳：出牌阶段限一次，你可以进行一次判定，若为黑色你选择X名其他角色对其造成一点雷电伤害。若为红色拥有"黄巾"的角色摸一张牌。阴：当你受到伤害时，你可以对伤害来源进行一次判定，若为♠你对其造成两点雷电伤害；若为♣你恢复一点体力。X为场上"黄巾"的数量。`,
            "hfhy_huangtian": "黄天",
            "hfhy_huangtian_info": `主公技。游戏开始时所有群势力角色获得“黄巾”。当拥有“黄巾”的角色的判定牌生效前，你可以选择一项：1.打出一张手牌替换之。2.判定牌生效后你摸一张牌。`,
            "hfhy_tianli": "天立",
            "hfhy_tianli_info": `限定技。出牌阶段，你可以选择一名其他角色，令所有拥有“黄巾”的角色弃置所有手牌，然后依次视为对其使用一张无视距离和防具的${get.poptip("sha")}。若此${get.poptip("sha")}造成了伤害，你与伤害来源各摸一张牌。若你没有${get.poptip("hfhy_huangtian")}，你获得“${get.poptip("hfhy_huangtian")}”。`,
            "hfhy_jieying": "劫营",
            "hfhy_jieying_info": `出牌阶段限一次，你可以观看一名其他角色的手牌，然后你可以弃置你与其区域内类型相同的牌。若你以此法弃置过基本牌，你摸一张牌；锦囊牌，此阶段你使用【杀】对其造成的伤害加一；装备牌，此阶段你与其的距离视为1。若你以此法弃置了至少两种类型的牌，你获得“${get.poptip("hfhy_baiqi")}”。`,
            "hfhy_baiqi": "百骑",
            "hfhy_baiqi_info": `你使用${get.poptip("sha")}可以额外指定任意名你攻击范围内的目标。若如此做，你失去一点体力。出牌阶段限一次，你可以将所有手牌当无次数限制的${get.poptip("sha")}使用，然后你升级“${get.poptip("hfhy_talang_lv2")}”。`,
            "hfhy_talang": "踏浪",
            "hfhy_talang_info": `锁定技。其他角色计算与你的距离+1;你受到的雷电伤害+1。`,
			"hfhy_talang_lv2": "踏浪",
            "hfhy_talang_lv2_info":`锁定技。你计算与其他角色的距离-1;其他角色计算与你的距离+1;你受到的雷电伤害+1。其他与你距离为一的角色回合结束时，你摸一张牌。`,
            "hfhy_jizhi": "继志",
			"hfhy_jizhi_info": `使命技。你的登场势力为蜀，出牌阶段限一次，你可展示牌堆顶5张牌，然后选择一项：1.获得其中的基本牌，以此法获得的基本牌不计入手牌上限。2.用任意张手牌与其中等量牌进行交换并排序。然后获得三个“志”标记。当你使用或打出【杀】时，你获得一个“志”标记。你的“志”标记上限为9。成功：准备阶段，若你拥有至少9个“志”标记时，你恢复一点体力并获得“${get.poptip("hfhy_jiufa")}”。失败：当你进入濒死状态时，你将势力变更为魏并恢复一点体力，并获得${get.poptip("hfhy_jueji")}和${get.poptip("hfhy_kunfen")}。若你拥有"志"，你失去所有"志"并增加一点体力上限。`,
			"hfhy_jiufa": "九伐",
			"hfhy_jiufa_info": "蜀势力技。出牌阶段，你可以增加一个“九伐”标记，然后视为使用一张无次数限制的【杀】并摸一张牌，若此阶段你已经发动过此技能，你再次发动时失去一点体力。若你进入濒死状态时“九伐”不多于6，你增加三个“九伐”标记并回复一点体力。当你拥有9个“九伐”标记时，你将势力变更为魏。",
			"hfhy_kunfen": "困奋",
			"hfhy_kunfen_info": "魏势力技。锁定技。摸牌阶段开始时，你选择一项：1.选择一名其他角色交给其你的所有基本牌。2.结束阶段，你失去一点体力并摸两张牌。",
			"hfhy_jueji": "绝计",
			"hfhy_jueji_info": "魏势力技。限定技。出牌阶段，你选择两名其他角色令他们选择一项：1.对另一名角色造成一点伤害。2.弃置x张牌。若他们选择相同选项，你失去一点体力，反之你弃置x张牌。x为你失去的体力值。",
			"hfhy_tieji": "铁骑",
			"hfhy_tieji_info": `当你使用${get.poptip("sha")}指定目标时，你可以令其本回合内非锁定技失效，然后你选择一项：1.获得其一张手牌。2.令其不能使用或打出此${get.poptip("sha")}颜色相同的手牌。背水：减少一点体力上限，然后你此阶段使用${get.poptip("sha")}的次数+1。`,
			"hfhy_mashu": "马术",
			"hfhy_mashu_info": "锁定技。你计算与其他角色的距离-X。每轮限一次，当你造成伤害时，若你与其的距离为1，你失去一点体力，然后令此伤害+1。（X为与你同势力的角色数一半向下取整）",
			"hfhy_qiangzhu": "羌助",
            "hfhy_qiangzhu_info": "群势力技。出牌阶段限一次，你可以令一名群势力角色选择是否交给你一张手牌，你于此阶段使用与该牌同名的牌无次数限制；若其没有手牌或拒绝交牌，你增加1点体力上限。",
			"hfhy_xuechou": "血仇",
			"hfhy_xuechou_info": "蜀势力技。准备阶段，你可以弃置一张手牌，然后令一名角色获得一个“仇”标记;当其受到伤害时，移去一个“仇”，然后你增加一点体力上限。",
			"hfhy_qiaosi": "巧思",
			"hfhy_qiaosi_info": "出牌阶段，每种牌名限一次。当你使用非装备牌结算后，你可以弃置一张与此牌类型相同的手牌，视为使用一张无次数限制的同牌名的牌。",
			"hfhy_tiangong": "天工",
			"hfhy_tiangong_info": "出牌阶段开始时，你可以选择一种类型。此阶段你使用与该类型相同的牌时，你摸一张牌；使用类型不同的牌无距离限制。若你此阶段使用过三种类型的牌，结束阶段你可以选择一名角色，将手牌或弃牌堆中的一张装备牌置入其装备区。",
			"hfhy_guqu": "顾曲",
			"hfhy_guqu_info": `每轮限一次。首轮开始时或准备阶段，你可以执行${get.poptip("hfhy_xiange")}，此后你每使用或打出一张牌，若该牌的花色与“${get.poptip("hfhy_xiange")}”相同，你摸一张牌。全部验证完毕后，若本次合律正确的数量多于0，你从牌堆中随机获得一张锦囊牌；多于2，你再从牌堆中随机获得一张装备牌；多于4，你令一名其他角色摸X张牌（X为本次合律成功的数量）且“${get.poptip("hfhy_xiange")}”的花色数+1。`,
			"hfhy_xiange": "弦歌合律",
			"hfhy_xiange_info": "系统随机生成5个花色组成“谱”。此后你每使用或打出一张牌与“谱”中当前比对位相比，无论是否相同，比对位均推进。",
			"hfhy_tianxiang": "天香",
			"hfhy_tianxiang_info": "当你使用或打出牌时，你可以改变此牌的花色（每轮每种花色限一次）。",
			"hfhy_lianyin": "联姻",
			"hfhy_lianyin_info": `使命技。你的登场势力为吴。游戏开始时，你选择一名其他男性角色。准备阶段，若你或其已受伤，你可以弃置一张手牌令你与其各回复一点体力。成功：你与其因“联姻”累计回复不少于4点体力，将你的势力变更为蜀，增加一点体力上限并回复一点体力，然后修改${get.poptip("hfhy_xiaoji")}。失败：在使命成功前，你或其进入濒死状态，你与其各获得一点护甲，然后你失去${get.poptip("hfhy_xiaoji")}获得${get.poptip("hfhy_jiejiang")}。`,
			"hfhy_xiaoji": "枭姬",
			"hfhy_xiaoji_info": `转换技。出牌阶段开始时，若你的装备区没有“${get.poptip("hfhy_xueying")}”你获得并使用之；阳：当你于回合内使用一张装备牌后，可以视为你使用了一张无次数限制的【杀】；阴：当你失去装备区里的一张牌时，你可以摸两张牌。`,
			"hfhy_xiaoji_gai": "枭姬·改",
			"hfhy_xiaoji_gai_info": `出牌阶段开始时，若你的装备区没有“${get.poptip("hfhy_xueying")}”你获得并使用之；当你失去装备区里的一张牌时，你可以选择一项：1.回复一点体力 2.令一名角色摸两张牌。`,
			"hfhy_jiejiang": "截江",
			"hfhy_jiejiang_info": "吴势力技。当你使用【杀】指定目标时，你可以弃置其装备区的一张牌。若以此法弃置的是：武器牌，你摸两张牌；防具牌，此伤害+1；坐骑牌，其不可响应此【杀】。",
			"hfhy_gu": "顾",
			"hfhy_gu_info": "三顾使命中获得的燃料标记。",
			"hfhy_zhongwang": "众望",
			"hfhy_zhongwang_info": `锁定技。准备阶段，若场上没有\"顾\"标记，你失去所有技能，然后获得${get.poptip("hfhy_jincui")}和${get.poptip("hfhy_beifa")}。拥有\"顾\"标记的角色，根据其\"顾\"标记数量获得以下效果：1枚，手牌上限+1；2枚，摸牌阶段多摸一张牌；3枚，出牌阶段使用【杀】的次数上限+1。`,
			"hfhy_sangu": "三顾",
			"hfhy_sangu_info": `使命技，你的登场势力为群，每名其他角色的准备阶段，其可以选择一项：1.交给你一张牌。2.失去一点体力，你恢复一点体力。然后其获得一枚"顾"标记。成功：准备阶段，若场上的"顾"标记不少于3你将势力变更为蜀，然后你失去技能${get.poptip("hfhy_mzgl_bagua")}，获得${get.poptip("hfhy_tianshi")}和${get.poptip("hfhy_huoji")}。失败：成功达成使命前，拥有"顾"标记的角色死亡。你失去技能${get.poptip("hfhy_mzgl_bagua")}并获得${get.poptip("hfhy_jincui")}和${get.poptip("hfhy_beifa")}。`,
			"hfhy_tianshi": "天时",
			"hfhy_tianshi_info": "准备阶段，你可移去场上的一枚\"顾\"标记，然后观看牌堆顶的x张牌，你选择一项：1.获得其中的红色牌。2.获得其中的黑色牌。然后你展示所有手牌并选择任意名角色交给其一张牌，获得红色牌的角色本回合受到的火焰伤害+1，获得黑色牌的角色本回合受到非雷电伤害时，防止此伤害。x为你的体力上限。",
			"hfhy_huoji": "火计",
			"hfhy_huoji_info": "出牌阶段限一次，你可以移去场上的一枚\"顾\"标记，选择一名其他角色，对其及其同势力的其他角色各造成一点火焰伤害。",
			"hfhy_jincui": "尽瘁",
			"hfhy_jincui_info": "锁定技。准备阶段，你失去一点体力并摸两张牌。当你进入濒死状态时，你减少一点体力上限。",
			"hfhy_beifa": "北伐",
            "hfhy_beifa_info": `出牌阶段限一次，你可以观看牌堆顶x张牌，选择一项：1.获得其中的锦囊牌。2.获得其中的基本牌。背水：你减少一点体力上限。你因${get.poptip("hfhy_beifa")}获得的牌无距离和次数限制。若你本回合发动了一次${get.poptip("hfhy_beifa")}，结束阶段你减少一点体力上限并执行一个额外回合。x为你的体力上限。`,
			"hfhy_muxiong": "暮雄",
			"hfhy_muxiong_info": "锁定技。你于游戏的前两个准备阶段增加一点体力上限;之后的准备阶段扣减一点体力上限。你的攻击距离视为x。当你使用【杀】指定目标时，若其攻击距离小于你此【杀】不可响应;若其体力值不小于你的攻击距离，你令此伤害加x，若其因此进入濒死状态，你减少一点体力上限，然后此阶段你使用牌不能选择其他角色为目标（x为你体力上限的一半向下取整）。",
			"hfhy_dingjun": "定军",
			"hfhy_dingjun_info": "锁定技。游戏开始时，你废除你的武器栏。出牌阶段，你可重铸武器牌。当你杀死一名角色后，你执行一个额外回合。",
			"hfhy_jicai": "积财",
			"hfhy_jicai_info": "游戏开始时，你将牌堆顶的13张牌置于你的武将牌上，称为“财”。摸牌阶段开始时，你可以将任意张“财”移至你的手牌区，或将任意张手牌作为“财”置于武将牌上。",
			"hfhy_tongshang": "通商",
			"hfhy_tongshang_info": "出牌阶段，你可以移去至多三张“财”，然后根据你移去财的数量执行以下效果：1.你从牌堆获得一张基本牌;2.你从牌堆获得一张锦囊牌;3.你从牌堆获得一张装备牌。",
            "hfhy_jikun": "济困",
            "hfhy_jikun_info": "出牌阶段限一次，你可以将一张牌交给其他角色。若为装备牌，该角色可以使用此牌并恢复一点体力。",
            "hfhy_kurou": "苦肉",
            "hfhy_kurou_info": "锁定技。①你即将受到的伤害视为失去体力。②当你失去体力后，你摸X张牌（X为你已损失的体力值数）。③出牌阶段限一次，你可以失去1点体力。",
            "hfhy_zhaxiang": "诈降",
            "hfhy_zhaxiang_info": "当你失去体力后，你令一名其他角色获得一枚“降”标记。当拥有“降”标记的角色受到伤害后，你选择一项：1.失去1点体力；2.获得其一张手牌，然后移去其一枚“降”标记。根据其“降”标记数量，你获得以下效果：1枚，你对其使用牌无距离限制；2枚，你对其使用牌无法被响应；3枚及以上，其受到你造成的伤害+1。",
            "hfhy_jiang": "降",
            "hfhy_jiang_info": `${get.poptip("hfhy_zhaxiang")}授予的负面标记：1枚时使用者对其使用牌无距离限制；2枚时对其使用牌无法被响应；3枚及以上其受到使用者造成的伤害+1。`,
            "hfhy_fenqu": "焚躯",
            "hfhy_fenqu_info": `觉醒技，锁定技。当你进入濒死状态时，若场上存在“降”标记，你获得${get.poptip("hfhy_pozhen")}，令你和拥有“降”标记的角色进入连环状态，然后移去场上所有“降”标记（每移除一枚，你回复1点体力），并失去${get.poptip("hfhy_kurou")}和${get.poptip("hfhy_zhaxiang")}。`,
            "hfhy_pozhen": "破阵",
            "hfhy_pozhen_info": "限定技。出牌阶段，你可以选择一名角色（可以是你自己），展示其手牌，然后你从双方的手牌中选择花色相同的牌（每种花色双方至少各选一张），双方各弃置所选的牌，对其造成X点火焰伤害（X为弃置的花色数）。对你自己发动时，只弃置你选择的你自己的牌。",
            "hfhy_gudan": "孤胆",
            "hfhy_gudan_info": `当你使用或打出基本牌、进入或脱离濒死状态、造成或受到伤害时，你获得一个“胆”标记。你根据“胆”的数量视为拥有如下技能：2枚，${get.poptip("hfhy_longdan")}；6枚，${get.poptip("hfhy_juejing")}；10枚，${get.poptip("hfhy_huaiyou")}；14枚，${get.poptip("hfhy_powei")}。`,
            "hfhy_longdan": "龙胆",
            "hfhy_longdan_info": "你可以将一张【杀】当【闪】、【闪】当【杀】使用或打出，以此法转换的牌不计入次数限制。",
            "hfhy_longdan_sha": "龙胆",
            "hfhy_longdan_shan": "龙胆",
            "hfhy_juejing": "绝境",
            "hfhy_juejing_info": "当你进入濒死状态时，你可以弃置任意张手牌，若其中包含的花色为：♥，你回复1点体力；♣，你摸一张牌；♠，你弃置伤害来源的一张牌；♦，你获得伤害来源的一张牌。",
            "hfhy_huaiyou": "怀幼",
            "hfhy_huaiyou_info": "你的手牌上限为X；摸牌阶段，你多摸X-2张牌（X为你拥有的“胆”标记数量的一半向下取整）。",
            "hfhy_powei": "破围",
            "hfhy_powei_info": "出牌阶段限一次，你可以弃置任意张牌，然后选择一项：1.获得等量的【杀】；2.获得等量的【闪】；3.获得等量的黑色牌；4.获得等量的红色牌。以此法获得的牌无距离限制。",
            "hfhy_tiandu": "天妒",
            "hfhy_tiandu_info": "锁定技。当你的判定牌生效后，你获得此牌。出牌阶段开始时，你进行一次判定，若结果不是♥，你减少一点体力上限。",
            "hfhy_shisheng": "十胜",
            "hfhy_shisheng_info": "①出牌阶段，你选择此阶段还未选择过的一名其他角色与其拼点，若你输你受到一点伤害，反之你令其失去一个技能直到其下个回合结束时。②当你进行拼点时，你可以进行一次判定，若为红色，你的点数视为K；若为黑色，对方点数视为A。",
            "hfhy_shisheng_block": "技能失效",
            "hfhy_yiji": "遗计",
            "hfhy_yiji_info": `当你受到1点伤害后，你令一名角色获得一张${get.poptip("hfhy_pofuchenzhou")}。`,
        },
   },
   dynamicTranslates:{ ...dynamicTranslates },
    intro: "",
    author: "无名玩家",
    diskURL: "",
    forumURL: "",
    version: "1.7.1",
},files:{"character":[],"card":[],"skill":[],"audio":[]}} 
};

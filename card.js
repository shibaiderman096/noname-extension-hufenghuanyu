import { lib, game, ui, get, ai, _status } from "noname";
const cards = {
    // 「破釜沉舟」锦囊：对距离1的所有其他角色使用；濒死时视为桃（官方酒的 savable + dying 分流范式）
    "hfhy_pofuchenzhou": {
        // 卡牌音效：playCardAudio 只认字符串，ext:扩展名/audio:后缀 → 播放 扩展audio目录/卡名_male|female.mp3
        audio: "ext:呼风唤雨/audio:mp3",
        image: "ext:呼风唤雨/image/hfhy_pofuchenzhou.png",
        fullskin: true,
        type: "trick",
        enable: true,
        selectTarget: -1,
        reverseOrder: true,
        filterTarget(card, player, target) {
            if (_status.event.type == "dying") {
                return target === player;
            }
            return target != player && get.distance(player, target) == 1;
        },
        savable(card, player, dying) {
            return dying === player;
        },
        async content(event, trigger, player) {
            // 濒死时视为桃
            if (event.getParent(2).type === "dying") {
                await player.recover();
                return;
            }
            const target = event.target;
            if (!target.isIn()) return;
            const result = await target.chooseToRespond()
                .set("filterCard", card => (card.name == "sha" || card.name == "shan") && lib.filter.cardRespondable(card, target))
                .set("prompt", "破釜沉舟：请打出【杀】或【闪】")
                .set("ai", card => {
                    const me = get.player();
                    // 打出杀只需多弃一张牌，最划算；打出闪要挨1点伤害；什么都不打只跳过摸牌阶段
                    if (card.name == "sha") return 6 - get.value(card);
                    if (card.name == "shan") return (me.hp > 2 ? 3 : -1) - get.value(card);
                    return -1;
                })
                .forResult();
            if (result.bool && result.cards?.length) {
                if (result.cards[0].name == "sha") {
                    if (target.countCards("he") > 0) {
                        await target.chooseToDiscard("he", true, "破釜沉舟：弃置一张牌")
                            .set("ai", card => 5 - get.value(card))
                            .forResult();
                    }
                } else {
                    await target.damage(1, player);
                }
            } else {
                target.skip("phaseDraw");
                target.addTempSkill("hfhy_pofuchenzhou_skip", { player: ["phaseDrawBegin", "phaseAfter"] });
                game.log(target, "的下一个摸牌阶段被跳过");
            }
        },
        ai: {
            order: 6,
            useful: 4.5,
            value: 6,
            tag: {
                save: 1,
                damage: 1,
                discard: 1,
            },
        },
    },
    // 「血影挽歌」武器：攻击范围5；不在牌堆，仅由【枭姬】获得并使用。
    // 官方金禾(jinhe)范式：主动技与结束阶段弃置各自独立成技能、全部列入 skills，
    // 装备时 addEquipTrigger 逐一注册触发器（挂 group 子技能的 id 易错配，弃用）
    "hfhy_xueying": {
        fullskin: true,
        image: "ext:呼风唤雨/image/hfhy_xueying.png",
        type: "equip",
        subtype: "equip1",
        distance: { attackFrom: -4 },
        skills: ["hfhy_xueying_skill", "hfhy_xueying_discard"],
        ai: {
            basic: {
                equipValue: 5,
            },
            tag: {
                weapon: 1,
            },
        },
    },
};

// 随卡牌注册的装备技能（官方 card pack 的 skill 段，如 zhulu.js）
const cardSkills = {
    "hfhy_xueying_skill": {
        audio: ["sbxiaoji1.mp3", "sbxiaoji2.mp3"],
        equipSkill: true,
        enable: "phaseUse",
        usable: 1,
        filter(event, player) {
            return player.hp > 0;
        },
        filterTarget: true,
        async content(event, trigger, player) {
            await player.loseHp(1);
            await event.target.changeHujia(1);
        },
        ai: {
            order: 2,
            result: {
                player(player) {
                    return player.hp > 1 ? 1 : 0;
                },
                target(player, target) {
                    if (target.hujia >= 5) return 0;
                    if (target === player) {
                        return player.hp > 1 ? 1 : 0;
                    }
                    return get.attitude(player, target) > 0 ? 1 : -1;
                },
            },
        },
    },
    "hfhy_xueying_discard": {
        // 回合结束时弃置装备区内的血影挽歌；独立技能+equipSkill，官方 jinhe_lose 范式
        equipSkill: true,
        forced: true,
        popup: false,
        trigger: { player: "phaseEnd" },
        filter(event, player) {
            return player.getEquips(1).some(card => card.name == "hfhy_xueying");
        },
        async content(event, trigger, player) {
            const card = player.getEquips(1).find(card => card.name == "hfhy_xueying");
            if (card) await player.discard(card);
        },
    },
};
export { cards, cardSkills };

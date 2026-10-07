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
                    if (!card) return -1;
                    if (typeof card === "string") {
                        const order = get.order(card);
                        if (order > 0) return order;
                        const viewAs = get.info(card)?.viewAs;
                        if (viewAs && typeof viewAs == "object") {
                            if (viewAs.name == "sha") return 1.6;
                            if (viewAs.name == "shan") return 1.8;
                        }
                        return -1;
                    }
                    const name = get.name(card, me);
                    const value = get.value(card, me);
                    if (name == "sha") {
                        // 打出【杀】的收益是避免跳过摸牌，成本是本牌与可能追加弃置的一张牌
                        const extra = me.countDiscardableCards(me, "he", current => current != card) > 0;
                        const skipValue = Math.max(2.2, Math.min(4.6, 5.2 - me.countCards("h") * 0.35));
                        return skipValue - value - (extra ? 1.6 : 0);
                    }
                    if (name == "shan") {
                        // 打出【闪】避免1点伤害；低体力时伤害代价更高
                        const damageValue = me.hp <= 1 ? 6 : me.hp == 2 ? 4.2 : 1.7;
                        return damageValue - value;
                    }
                    return -1;
                })
                .forResult();
            if (result.bool && result.cards?.length) {
                if (hfhyPofuchenzhouResponseName(result, target) == "sha") {
                    if (target.countDiscardableCards(target, "he") > 0) {
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
            order(item, player) {
                if (_status.event?.type === "dying") return 9;
                if (!player || !player.isIn?.()) return -1;
                const targets = game.filterPlayer(target => target != player && target.isIn() && get.distance(player, target) == 1);
                if (!targets.length) return -1;
                const score = targets.reduce((sum, target) => {
                    return sum + hfhyPofuchenzhouTargetValue(player, target) * Math.sign(get.attitude(player, target));
                }, 0);
                // 低体力时保留为自救桃，只有净收益明显时才转攻
                const threshold = player.hp <= 1 ? 3 : 0.5;
                return score > threshold ? 6 : -1;
            },
            useful: 4.5,
            value: 6,
            result: {
                player(player, target) {
                    if (_status.event?.type === "dying") return 1;
                    return 0;
                },
                target(player, target) {
                    return hfhyPofuchenzhouTargetValue(player, target);
                },
            },
            tag: {
                save: 1,
                damage: 1,
                discard: 1,
                respond: 1,
                respondSha: 1,
                respondShan: 1,
                multitarget: 1,
                multineg: 1,
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
            order(item, player) {
                return player.hp > 1 ? 2 : -1;
            },
            result: {
                player(player) {
                    return player.hp > 1 ? 1 : -1;
                },
                target(player, target) {
                    if (target.hujia >= 5) return 0;
                    const attitude = target === player ? 1 : get.attitude(player, target);
                    return Math.max(0, get.threaten(target)) * attitude;
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
function hfhyPofuchenzhouTargetValue(player, target) {
    if (!target || target === player || !target.isIn()) return 0;
    let harm = 1.1;
    if (target.hp <= 1) harm += 1.6;
    else if (target.hp == 2) harm += 0.8;
    const hasSha = target.mayHaveSha(player, "respond");
    const hasShan = target.mayHaveShan(player, "respond");
    if (!hasSha && !hasShan) harm += 0.9;
    else if (hasShan && !hasSha) harm += 0.5;
    const threat = Math.max(0.6, Math.min(1.8, get.threaten(target) / 1.5));
    return -harm * threat;
}
function hfhyPofuchenzhouResponseName(result, target) {
    if (result.skill) {
        const viewAs = get.info(result.skill)?.viewAs;
        if (viewAs && typeof viewAs == "object" && viewAs.name) return viewAs.name;
    }
    const card = result.card || (result.cards && result.cards[0]);
    return card ? get.name(card, target) : "";
}
export { cards, cardSkills };

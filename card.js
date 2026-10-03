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
};
export { cards };

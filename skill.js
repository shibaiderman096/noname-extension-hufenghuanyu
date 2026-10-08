import { lib, game, ui, get, ai, _status } from "noname";
const skills = {
    "hfhy_kuangzhan": {
        audio:["olguanbian1.mp3","olguanbian2.mp3"],
        forced: true,
        trigger: {
            source: "damageEnd",
            player: "damageEnd",
        },
        filter(event, player) {
            return player.maxHp < 8;
        },
        content() {
            player.gainMaxHp();
            player.draw(1);
        },
        "skill_id": "狂战",
        "_priority": 0,
    },
    "hfhy_tuxi": {
        audio: ["baonue21.mp3", "baonue22.mp3"],
        enable: "phaseUse",
        usable: 1,
        filter(event, player) {
            return player.countDiscardableCards(player, "h") > 0;
        },
        async content(event, trigger, player) {
            const prompt = "突袭：弃置任意X张手牌，视为对所有与你距离小于X的其他角色使用一张【杀】";
            let next;
            if (event.isMine() || player.isUnderControl()) {
                // 玩家自行选择
                next = player.chooseToDiscard("h", [1, Infinity], true, prompt);
                next.set("ai", card => 5 - get.value(card));
            } else {
                // AI：按最优方案固定弃牌
                const best = hfhy_tuxiBest(player);
                if (best.x < 2 || best.net <= 0) return;
                next = player.chooseToDiscard("h", [best.x, best.x], true, prompt);
                next.set("filterCard", card => best.cards.includes(card));
                next.set("ai", card => (best.cards.includes(card) ? 10 : -10));
            }
            const result = await next.forResult();
            if (!result?.bool || !result.cards?.length) return;

            const X = result.cards.length;
            const targets = game.filterPlayer(target =>
                target !== player && target.isIn() && get.distance(player, target) < X
            );
            if (!targets.length) return;

            // 视为使用一张多目标【杀】，不计入出杀次数
            const card = { name: "sha", isCard: true };
            const useNext = player.useCard(card, targets, false);
            useNext.addCount = false;
            await useNext;
        },
        ai: {
            order: 4,
            result: {
                player(player) {
                    const best = hfhy_tuxiBest(player);
                    return best.x >= 2 && best.net > 0 ? 1 : 0;
                },
            },
        },
        "skill_id": "hfhy_tuxi",
        "_priority": 0,
    },
    "hfhy_poji": {
        audio:["olxiongni1.mp3","olxiongni2.mp3","olxiongni3.mp3","olxiongni4.mp3","olxiongni5.mp3","olxiongni6.mp3",],
        skillAnimation: true,
        animationColor: "soil",
        unique: true,
        juexingji: true,
        forced: true,
        derivation: ["hfhy_manzhan","benghuai"],
        trigger: {
            source: "damageEnd",
        },
        filter: function (event, player) {
            return player.maxHp >= 8 && !player.storage.HFHY_poji;
        },
        content: function () {
            player.storage.HFHY_poji = true;

            player.maxHp = 4;
            player.update();

            player.changeHujia(1);

            player.addSkills(["hfhy_manzhan", "benghuai"]);

            player.useCard({
                name: 'nanman',
                isCard: true,
            }, game.filterPlayer(function (current) {
                return current != player;
            }));
        },
        ai: {
            combo: "狂战",
        },
        "skill_id": "hfhy_poji",
        "_priority": 0,
    },
    "hfhy_manzhan": {
        audio:["dcjuchui1.mp3","dcjuchui2.mp3"],
        trigger: {
            source: "damageBegin1",
        },
        filter(event, player) {
            return player.maxHp > event.player.maxHp;
        },
        prompt2(event, player) {
            return "减1点体力上限，令对" + get.translation(event.player) + "造成的伤害+1";
        },
        check(event, player) {
            // 只对敌方目标发动，队友/中立不发动
            if (get.attitude(player, event.player) >= 0) return false;
            return player.maxHp > 5;
        },
        content() {
            player.loseMaxHp();
            trigger.num++;
        },
        "skill_id": "hfhy_manzhan",
        "_priority": 0,
    },
    "hfhy_liancai": {
        audio:["ziyuan1.mp3","ziyuan2.mp3","jugu1.mp3","jugu2.mp3"],
        // 官方连营范式：交给他人（give→gain 内部 lose 带 getlx=false，其 getl 返回空结构）等
        // 路径仅靠 player loseAfter 抓不到，须补 global 时机（gainAfter 等）
        trigger: {
            player: "loseAfter",
            global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
        },
        filter(event, player) {
            if (player == _status.currentPhase) return false;
            const evt = event.getl(player);
            if (!evt || evt.player !== player || !evt.hs || !evt.hs.length) return false;
            return player.countCards("h") >= player.hp;
        },
        async content(event, trigger, player) {
            await player.draw();
        },
        "skill_id": "hfhy_liancai",
        "_priority": 0,
    },
    "hfhy_quedi": {
        audio:["ziyuan1.mp3","ziyuan2.mp3","jugu1.mp3","jugu2.mp3"],
        trigger: {
            target: "useCardToTarget",
        },
        usable: 1,
        filter(event, player) {
            // “每回合”指其他角色的回合：自己回合内不发动
            if (_status.currentPhase == player) return false;
            if (event.player == player) return false;
            if (!event.targets.includes(player)) return false;
            const num = Math.max(1, player.getDamagedHp());
            return player.countCards("he") >= num;
        },
        async cost(event, trigger, player) {
            const num = Math.max(1, player.getDamagedHp());
            // AI：无害/有利牌不发动；取消收益需覆盖自己的牌损失与资敌增益
            if (!player.isUnderControl()) {
                const eff = get.effect(player, trigger.card, trigger.player, player);
                if (eff >= 0) {
                    event.result = { bool: false };
                    return;
                }
                const give = player.getCards("he")
                    .slice()
                    .sort((a, b) => get.value(a, player) - get.value(b, player))
                    .slice(0, num);
                const loss = give.reduce((sum, card) => sum + get.value(card, player), 0);
                const feed = give.reduce((sum, card) => sum + get.value(card, trigger.player), 0);
                if (-eff < loss + feed * 0.5) {
                    event.result = { bool: false };
                    return;
                }
            }
            const result = await player.chooseCard(
                "he",
                num,
                `交给${get.translation(trigger.player)}${num}张牌并取消此目标`
            )
            .set("ai", card => {
                // 给最不值钱的牌；桃/无懈这类救命牌重罚
                const keep = card.name == "tao" || card.name == "wuxie" ? 4 : 0;
                return 5 - get.value(card, player) - keep;
            })
            .forResult();
            if (!result.bool) return;
            event.result = {
                bool: true,
                cards: result.cards,
            };
        },
        async content(event, trigger, player) {
            const target = trigger.player;
            await player.give(event.cards, target);
            trigger.targets.remove(player);
            trigger.getParent().excluded.add(player);
        },
        "skill_id": "hfhy_quedi",
        "_priority": 0,
    },
    "hfhy_shanglue": {
        audio:["ziyuan1.mp3","ziyuan2.mp3","jugu1.mp3","jugu2.mp3"],
        trigger: {
            player: "phaseBegin",
        },
        filter(event, player) {
            return ["phaseDraw", "phaseUse", "phaseDiscard"].some(phase => !player.skipList.includes(phase));
        },
        async cost(event, trigger, player) {
            const phases = ["phaseDraw", "phaseUse", "phaseDiscard"].filter(phase => !player.skipList.includes(phase));
            if (!phases.length) return event.finish();
            const result = await player
                .chooseButton([
                    get.prompt2(event.skill),
                    [phases.map(phase => [phase, get.translation(phase)]), "textbutton"],
                ])
                .set("filterButton", button => {
                    return phases.includes(button.link);
                })
                .set("ai", button => {
                    const player = get.player();
                    const phase = button.link;
                    // 总倾向：屯牌——优先保住手牌（跳过弃牌/出牌），慎选损血的跳过摸牌
                    // 跳过弃牌阶段：一张都不用弃（代价是本回合不能对其他角色用牌）
                    if (phase === "phaseDiscard") {
                        const num = player.needsToDiscard();
                        return num > 0 ? Math.min(5, 2 + num) : 0;
                    }
                    // 跳过出牌阶段：不花手牌、手牌上限+体力，附带一次免费杀，屯牌首选
                    if (phase === "phaseUse") {
                        if (player.hp <= 1) return 0;
                        const hand = player.countCards("h");
                        const limit = player.getHandcardLimit ? player.getHandcardLimit() : player.hp;
                        let val = 2.2 + Math.min(3, player.hp * 0.6);
                        if (hand > limit) val += Math.min(2, hand - limit);
                        if (game.hasPlayer(cur => player.inRange(cur) && get.attitude(player, cur) < 0)) val += 0.6;
                        if (hand < 2) val -= 2.5;
                        return val;
                    }
                    // 跳过摸牌阶段：损血且变相降低本回合手牌上限，与屯牌相悖，仅在手牌见底时考虑
                    if (phase === "phaseDraw") {
                        if (player.hp <= 1) return 0;
                        const extra = player.hp - 2;
                        if (extra <= 0) return 0;
                        if (player.countCards("h") >= 2) return 0;
                        let val = 1 + extra;
                        if (player.hp <= 2) val -= 2;
                        return val;
                    }
                    return 0;
                })
                .forResult();
            event.result = { bool: result?.bool, cost_data: result.links?.[0] };
        },
        async content(event, trigger, player) {
            const phase = event.cost_data;
            const x = player.hp;
            player.skip(phase);
            switch (phase) {
                case "phaseDraw": {
                    await player.draw(x);
                    await player.loseHp();
                    player.addTempSkill("rezongshi_paoxiao", "phaseAfter");
                    break;
                }
                case "phaseUse": {
                    player.storage.shanglv_handLimit = x;
                    player.addTempSkill("hfhy_shanglue_handLimit", "phaseAfter");
                    const result = await player
                        .chooseTarget((card, player, target) => player.inRange(target), `对攻击范围内的一名角色使用【杀】（手牌上限+${x}）`)
                        .set("ai", target => {
                            const player = get.player();
                            return get.effect(target, { name: "sha" }, player, player);
                        })
                        .forResult();
                    if (result.bool) {
                        await player.useCard(
                            { name: "sha", isCard: true },
                            result.targets[0]
                        );
                    }
                    break;
                }
                case "phaseDiscard": {
                    player.addTempSkill("hfhy_shanglue_noTargetOther", "phaseAfter");
                    break;
                }
            }
        },
        ai: {
            "directHit_ai": false,
        },
        subSkill: {
            handLimit: {
                mod: {
                    maxHandcard(player, num) {
                        return num + (player.storage.shanglv_handLimit || 0);
                    },
                },
                sub: true,
                sourceSkill: "hfhy_shanglue",
                "skill_id": "hfhy_shanglue_handLimit",
                "_priority": 0,
            },
            noTargetOther: {
                mod: {
                    playerEnabled(card, player, target) {
                        if (target && target !== player) return false;
                    },
                },
                sub: true,
                sourceSkill: "hfhy_shanglue",
                "skill_id": "hfhy_shanglue_noTargetOther",
                "_priority": 0,
            },
        },
        "skill_id": "hfhy_shanglue",
        "_priority": 0,
    },
    "hfhy_xiaoju": {
        audio:["zili_re_zhonghui1.mp3","zili_re_zhonghui2.mp3","zili1.mp3","zili2.mp3"],
        initGroup: "wei",
        derivation: "hfhy_pini",
        forced: true,
        juexingji: true,
        unique: true,
        skillAnimation: true,
        animationColor: "metal",
        trigger: {
            player: "phaseEnd",
        },
        filter(event, player) {
            return player.maxHp >= 5;
        },
        async content(event, trigger, player) {
            await player.changeGroup("qun");
            await player.addSkills("hfhy_pini");
            player.awakenSkill(event.name);
            player.changeSkin({ characterName: "kuang_zhonghui" }, "qun_kuang_zhonghui");
            const result = await player
                .chooseButton([
                    "请选择一项",
                    [[["选项一", "回复1点体力"], ["选项二", "摸两张牌"], ["选项三", "获得1枚【势】标记"]], "textbutton"],
                ])
                .set("ai", button => {
                    const me = get.player();
                    if (button.link === "选项一") {
                        // 回血：受伤才考虑，残血优先
                        if (me.hp < me.maxHp) return me.hp <= 2 ? 4 : 2.5;
                        return 0;
                    }
                    if (button.link === "选项二") {
                        // 摸两张：手牌匮乏时收益最大
                        return me.countCards("h") <= 2 ? 3 : 2;
                    }
                    // 势标记：凑奇数枚+1正好跨过2枚购买线；觉醒后也是睥睨的弹药
                    const marks = me.storage["hfhy_choufa"] || 0;
                    return marks % 2 === 1 ? 2.2 : 1;
                })
                .forResult();
            if (result.bool) {
                if (result.links[0] === "选项一") {
                    player.recover();
                } else if (result.links[0] === "选项二") {
                    await player.draw(2);
                } else {
                    player.storage["hfhy_choufa"] = (player.storage["hfhy_choufa"] || 0) + 1;
                    player.markSkill("hfhy_choufa");
                }
            }
        },
        "skill_id": "hfhy_xiaoju",
    },
    "hfhy_choufa": {
        audio:["requanji1.mp3","requanji2.mp3"],
        groupSkill: "wei",
        derivation: ["hfhy_jueshi", "hfhy_shanbing", "hfhy_zhengu"],
        forced: true,
        mark: true,
        marktext: "势",
        intro: {
            content(storage, player, skill) {
                return `已获得${storage || 0}枚"势"标记`;
            },
        },
        init(player, skill) {
            player.storage[skill] = 0;
        },
        trigger: {
            global: "gameStart",
        },
        filter(event, player) {
            return true;
        },
        content() {
            player.storage["hfhy_choufa"] = 2;
            player.markSkill("hfhy_choufa");
        },
        group: ["hfhy_choufa_mark","hfhy_choufa_choose"],
        subSkill: {
            mark: {
            audio:["requanji1.mp3","requanji2.mp3","mbyunan1.mp3","mbyunan2.mp3","mbyunan3.mp3","mbyunan4.mp3"],
                forced: true,
                trigger: {
                    // 官方模式：受伤后用damageEnd，造成伤害后用damageSource（参考jsrgfengxiang）
                    player: "damageEnd",
                    source: "damageSource",
                },
                filter(event, player) {
                    return player.group == "wei";
                },
                async content(event, trigger, player) {
                    player.storage["hfhy_choufa"] = (player.storage["hfhy_choufa"] || 0) + 1;
                    player.markSkill("hfhy_choufa");
                    game.log(player, "获得了1枚“势”标记（", (player.storage["hfhy_choufa"] || 0), "枚）");
                },
                sub: true,
                sourceSkill: "hfhy_choufa",
                "skill_id": "hfhy_choufa_mark",
                "_priority": 0,
            },
            choose: {
    audio: ["requanji1.mp3","requanji2.mp3","mbyunan1.mp3","mbyunan2.mp3","mbyunan3.mp3","mbyunan4.mp3"],
    trigger: {
        player: ["phaseBegin", "phaseUseEnd"],
    },
    filter(event, player) {
        if (player.group != "wei") return false;
        const gained = player.storage.choufa_skills || [];
        if (gained.length >= 3) return false;
        return (player.storage["hfhy_choufa"] || 0) >= 2;
    },
    async cost(event, trigger, player) {
        const gained = player.storage.choufa_skills || [];
        const available = ["hfhy_shanbing", "hfhy_jueshi", "hfhy_zhengu"].filter(s => !gained.includes(s));
        if (!available.length) {
            event.result = { bool: false };
            return;
        }

        // 添加取消选项
        const controls = available.concat("cancel2");
        const choiceList = available.map(s => get.translation(s)).concat("取消");

        const { control } = await player.chooseControl(controls)
            .set("choiceList", choiceList)
            .set("prompt", "是否移去2枚【势】标记，选择一个技能并获得？")
            .set("ai", () => {
                // AI主动发动：按局势选技能，绝不取消（2枚标记换技能+1体力上限恒为正收益）
                // 擅兵：手中有杀或攻击范围内有敌人时是输出核心（杀不可响应+伤害加成）
                const hasSha = player.countCards("h", card => get.name(card) == "sha") > 0;
                const canAttack = game.hasPlayer(current => {
                    return current != player && get.attitude(player, current) < 0 &&
                        player.canUse({ name: "sha", isCard: true }, current);
                });
                if (available.includes("hfhy_shanbing") && (hasSha || canAttack)) return "hfhy_shanbing";
                // 镇骨：体力不健康或容易被集火时防御优先（受伤摸至上限，摸不足2张还倒贴势标记）
                if (available.includes("hfhy_zhengu") && (player.hp <= 2 || player.maxHp - player.hp >= 2)) return "hfhy_zhengu";
                // 决势：手牌充足时是引擎（弃牌换无次数杀/无中生有），手牌枯竭时价值低
                if (available.includes("hfhy_jueshi") && player.countCards("he") >= 4) return "hfhy_jueshi";
                // 兜底：按剩余技能的基础价值
                if (available.includes("hfhy_shanbing")) return "hfhy_shanbing";
                if (available.includes("hfhy_jueshi")) return "hfhy_jueshi";
                return "hfhy_zhengu";
            })
            .forResult();

        event.result = {
            bool: control !== "cancel2",
            cost_data: control,
        };
    },
    async content(event, trigger, player) {
        player.logSkill("hfhy_choufa");
        player.storage["hfhy_choufa"] -= 2;
        const skillName = event.cost_data;
        if (!player.storage.choufa_skills) player.storage.choufa_skills = [];
        player.storage.choufa_skills.push(skillName);
        player.addSkill(skillName);
        game.log(player, "获得了技能", `#y${get.translation(skillName)}`);
        await player.gainMaxHp();
        player.markSkill("hfhy_choufa");
    },
    sub: true,
    sourceSkill: "hfhy_choufa",
    "skill_id": "hfhy_choufa_choose",
    "_priority": 0,
            },
        },
    },
"hfhy_jueshi": {
    audio:["mbxiezhi1.mp3","mbxiezhi2.mp3"],
    enable: "phaseUse",
    usable: 1,
    filter(event, player) {
        return true;
    },
    async content(event, trigger, player) {
        const canBeishui = player.hp > 0 && player.countCards("he") >= 3;
        const list = [];
        if (player.countCards("he") >= 1) list.push("选项一");
        if (player.countCards("he") >= 2) list.push("选项二");
        if (canBeishui) list.push("背水！");
        list.push("cancel2");
        if (list.length === 1 && list[0] === "cancel2") {
            player.popup("无牌可弃，无法发动决势");
            return;
        }
        const { control } = await player.chooseControl(list)
            .set("choiceList", [
                "弃置一张牌，然后视为使用一张【杀】",
                "弃置两张牌，然后视为使用一张【无中生有】",
                "背水！失去1点体力并获得1枚「势」标记。"
            ])
            .set("prompt", "决势：请选择一项")
            .set("ai", () => {
                const player = get.player();
                const hs = player.countCards("he");
                const hp = player.hp;
                if (hs >= 3 && hp >= 2 && player.hp > 0) return "背水！";
                if (hs >= 1) return "选项一";
                if (hs >= 2) return "选项二";
                return "cancel2";
            })
            .forResult();
        
        if (control === "cancel2") return;
        
        const isBeishui = (control === "背水！");
        
        // 背水时先执行选项二：弃两张 → 无中生有
        if (control === "选项二" || isBeishui) {
            if (player.countCards("he") >= 2) {
                const discarded = await player.chooseToDiscard("he", 2, true)
                    .set("ai", card => 5 - get.value(card))
                    .forResult();
                if (discarded.bool) {
                    await player.useCard({ name: "wuzhong", isCard: true }, player);
                }
            }
        }

        // 再执行选项一：弃一张 → 杀
        if (control === "选项一" || isBeishui) {
            if (player.countCards("he") >= 1) {
                const discarded = await player.chooseToDiscard("he", 1, true)
                    .set("ai", card => 5 - get.value(card))
                    .forResult();
                if (discarded.bool) {
                    const targets = await player.chooseTarget(
                        "请选择【杀】的目标",
                        (card, player, target) => player.canUse({ name: "sha", isCard: true }, target, false)
                    ).set("ai", target => {
                        const me = get.player();
                        // 只对敌人出杀，按杀的预期收益选目标
                        if (get.attitude(me, target) >= 0) return -1;
                        return get.effect(target, { name: "sha", isCard: true }, me, me);
                    }).forResult();
                    if (targets.bool && targets.targets.length > 0) {
                        await player.useCard({ name: "sha", isCard: true }, targets.targets[0], false);
                    }
                }
            }
        }
        
        // 最后执行背水后果
        if (isBeishui) {
            await player.loseHp();
            if (player.storage["hfhy_choufa"] !== undefined) {
                player.storage["hfhy_choufa"]++;
                player.markSkill("hfhy_choufa");
            }
        }
    },
    ai: {
        order: 5,
        result: {
            player: 1,
        },
    },
    skill_id: "hfhy_jueshi",
    _priority: 0,
},
"hfhy_shanbing": {
    audio:["paiyi_re_zhonghui1.mp3","paiyi_re_zhonghui2.mp3"],
    trigger: {
        player: "useCardToPlayered",
    },
    forced: true,
    filter(event, player) {
        return event.card.name === "sha";
    },
    content() {
        trigger.getParent().directHit.push(trigger.target);
    },
    group: ["hfhy_shanbing_damage"],
    subSkill: {
        damage: {
            trigger: {
                source: "damageBegin1",
            },
            filter(event, player) {
                if (event.num <= 0) return false;
                return player.countCards("he", card => get.color(card) === "black") > 0 ||
                       player.countCards("he", card => get.color(card) === "red") > 0;
            },
            async cost(event, trigger, player) {
                const hasBlack = player.countCards("he", card => get.color(card) === "black") > 0;
                const hasRed = player.countCards("he", card => get.color(card) === "red") > 0;
                const canBeishui = player.countCards("he", card => get.color(card) === "black") > 0 && player.countCards("he", card => get.color(card) === "red") > 0;
                const list = [];
                if (hasBlack) list.push("选项一");
                if (hasRed) list.push("选项二");
                if (canBeishui) list.push("背水！");
                list.push("cancel2");
                const { control } = await player.chooseControl(list)
                    .set("choiceList", [
                        "弃置一张黑色牌，令此伤害+1",
                        `弃置一张红色牌，获得${get.translation(trigger.player)}区域内的一张牌`,
                        "背水！失去1点体力并获得1枚「势」标记。",
                    ])
                    .set("prompt", get.prompt("hfhy_shanbing", trigger.player))
                    .set("ai", () => {
                        const player = get.player();
                        const target = _status.event.getTrigger().player;
                        if (get.attitude(player, target) > 0) return "cancel2";
                        const hasBlack = player.countCards("he", card => get.color(card) === "black") > 0;
                        const hasRed = player.countCards("he", card => get.color(card) === "red") > 0;
                        if (hasBlack && hasRed && target.hp <= 2 && player.hp > 2 && canBeishui) return "背水！";
                        if (hasBlack && target.hp <= 2) return "选项一";
                        if (hasRed && target.countGainableCards(player, "hej") > 0) return "选项二";
                        if (hasBlack) return "选项一";
                        if (hasRed) return "选项二";
                        return "cancel2";
                    })
                    .forResult();
                event.result = {
                    bool: control !== "cancel2",
                    cost_data: control,
                };
            },
            async content(event, trigger, player) {
                const { cost_data: control } = event;
                if (["选项一", "背水！"].includes(control)) {
                    const { bool } = await player.chooseToDiscard("he", 1)
                        .set("filterCard", card => get.color(card) === "black")
                        .set("prompt", "弃置一张黑色牌令伤害+1")
                        .set("ai", card => {
                            // 弃低价值黑牌换伤害；关键牌舍不得弃则放弃（非强制）
                            return 5 - get.value(card);
                        })
                        .forResult();
                    if (bool) trigger.num++;
                }
                if (["选项二", "背水！"].includes(control)) {
                    const { bool } = await player.chooseToDiscard("he", 1)
                        .set("filterCard", card => get.color(card) === "red")
                        .set("prompt", `弃置一张红色牌，获得${get.translation(trigger.player)}区域内的一张牌`)
                        .set("ai", card => {
                            // 1换1的交换：弃低价值红牌去抢对方更有价值的牌
                            return 5 - get.value(card);
                        })
                        .forResult();
                    if (bool && trigger.player.countGainableCards(player, "hej") > 0) {
                        await player.gainPlayerCard(
                            `获得${get.translation(trigger.player)}区域内的一张牌`,
                            trigger.player,
                            "hej",
                            "visibleMove"
                        );
                    }
                }
                if (control === "背水！") {
                    await player.loseHp();
                    if (player.storage["hfhy_choufa"] !== undefined) {
                        player.storage["hfhy_choufa"]++;
                        player.markSkill("hfhy_choufa");
                    }
                }
            },
            sub: true,
            sourceSkill: "hfhy_shanbing",
            skill_id: "hfhy_shanbing_damage",
            _priority: 0,
        },
    },
    skill_id: "hfhy_shanbing",
    _priority: 0,
},
    "hfhy_zhengu": {
        audio:["quanji1.mp3","quanji2.mp3"],
        trigger: {
            player: "damageEnd",
        },
        filter(event, player) {
            return player.countCards("he") > 0;
        },
        async cost(event, trigger, player) {
            const result = await player.chooseToDiscard("he", 1)
                .set("prompt", "是否弃置一张牌，将手牌摸至体力上限？若以此法获得的牌数小于2，你获得1枚【势】标记")
                .set("ai", card => 5 - get.value(card))
                .forResult();
            event.result = { bool: result?.bool };
        },
        async content(event, trigger, player) {
            const num = Math.max(0, player.maxHp - player.countCards("h"));
            if (num > 0) {
                await player.draw(num);
            }
            if (num < 2 && player.storage["hfhy_choufa"] !== undefined) {
                player.storage["hfhy_choufa"]++;
                player.markSkill("hfhy_choufa");
            }
        },
        "skill_id": "hfhy_zhengu",
        "_priority": 0,
    },
    "hfhy_pini": {
        audio:["mbsizi1.mp3","mbsizi2.mp3","mbsizi3.mp3","mbsizi4.mp3","mbsizi5.mp3","mbsizi6.mp3","mbsizi7.mp3",],
        groupSkill: "qun",
        enable: "phaseUse",
        usable: 1,
        filter(event, player) {
            // 势力限制：仅群势力可发动；同时要求存在可使用的普通锦囊，避免空发动
            if (player.group != "qun") return false;
            return get.inpileVCardList(info => {
                if (info[0] !== "trick") return false;
                return player.hasUseTarget(new lib.element.VCard({ name: info[2], nature: info[3], isCard: true }));
            }).length > 0;
        },
        async content(event, trigger, player) {
            // 硬性势力校验：防止任何路径绕过filter违规发动
            if (player.group != "qun") return;
            // 先确认有可用的普通锦囊，避免支付代价后无牌可选
            const list = get.inpileVCardList(info => {
                if (info[0] !== "trick") return false;
                return player.hasUseTarget(new lib.element.VCard({ name: info[2], nature: info[3], isCard: true }));
            });
            if (!list.length) return;
            const hasMark = (player.storage["hfhy_choufa"] || 0) >= 1;
            const choices = [["hp", "失去1点体力"]];
            if (hasMark) choices.push(["mark", "移去1枚【势】标记"]);
            const costResult = await player.chooseButton(["睥睨：请选择一项", [choices, "textbutton"]])
                .set("ai", button => {
                    if (button.link === "mark") return 3;
                    return player.hp > 2 ? 2 : 0;
                })
                .forResult();
            if (!costResult.bool) return;
            if (costResult.links[0] === "hp") {
                await player.loseHp();
                if (!player.isIn()) return;
            } else {
                player.storage["hfhy_choufa"]--;
                player.markSkill("hfhy_choufa");
            }
            const trickResult = await player.chooseButton([get.translation("hfhy_pini"), [list, "vcard"]], true)
                .set("ai", button => {
                    return player.getUseValue(new lib.element.VCard({ name: button.link[2], nature: button.link[3], isCard: true }));
                })
                .forResult();
            if (!trickResult.bool) return;
            const card = new lib.element.VCard({ name: trickResult.links[0][2], nature: trickResult.links[0][3], isCard: true });
            await player.chooseUseTarget(card, true);
        },
        ai: {
            order: 6,
            result: {
                player(player) {
                    if ((player.storage["hfhy_choufa"] || 0) >= 1) return 1.5;
                    return player.hp > 2 ? 1 : 0;
                },
            },
        },
        "skill_id": "hfhy_pini",
        "_priority": 0,
    },
"hfhy_jizi": {
    initGroup: "qun",
    forced: true,
    trigger: {
        global: "phaseBefore",
        player: "enterGame",
    },
    filter(event, player) {
        return event.name != "phase" || game.phaseNumber == 0;
    },
    async content(event, trigger, player) {
        if (player.getExpansions("hfhy_jizi").length >= 2) return;
        const addCards = player.addToExpansion(get.cards(2), "draw");
        addCards.gaintag.add("hfhy_jizi");
        await addCards;
    },
    mark: true,
    marktext: "资",
    intro: {
        markcount: "expansion",
        mark(dialog, content, player) {
            var content = player.getExpansions("hfhy_jizi");
            if (content && content.length) {
                if (player == game.me || player.isUnderControl()) {
                    dialog.addAuto(content);
                } else {
                    return "共有" + get.cnNumber(content.length) + "张资";
                }
            }
        },
        content(content, player) {
            var content = player.getExpansions("hfhy_jizi");
            if (content && content.length) {
                if (player == game.me || player.isUnderControl()) {
                    return get.translation(content);
                }
                return "共有" + get.cnNumber(content.length) + "张资";
            }
        },
    },
    onremove(player, skill) {
        if (player.hasSkill("hfhy_jiace", true)) return;
        const cards = player.getExpansions("hfhy_jizi");
        if (cards.length) {
            player.loseToDiscardpile(cards);
        }
    },
    group: ["hfhy_jizi_use", "hfhy_jizi_gain"],
    subSkill: {
        use: {
            enable: ["chooseToUse", "chooseToRespond"],
            filter(event, player) {
                if (event.type == "wuxie") return false;
                if (player.getExpansions("hfhy_jizi").length === 0) return false;
                for (const name of lib.inpile) {
                    if (get.type(name) != "basic") continue;
                    const card = { name, isCard: true };
                    if (event.filterCard(card, player, event)) return true;
                    if (name == "sha") {
                        for (const nature of lib.inpile_nature) {
                            card.nature = nature;
                            if (event.filterCard(card, player, event)) return true;
                        }
                    }
                }
                return false;
            },
            hiddenCard(player, name) {
                return get.type(name) == "basic" && player.getExpansions("hfhy_jizi").length > 0;
            },
            chooseButton: {
                dialog(event, player) {
                    const vcards = get.inpileVCardList(info => {
                        if (info[0] != "basic") return false;
                        const card = { name: info[2], isCard: true };
                        if (info[3]) card.nature = info[3];
                        return event.filterCard(card, player, event);
                    });
                    const dialog = ui.create.dialog("集资", [vcards, "vcard"], "hidden");
                    dialog.direct = true;
                    return dialog;
                },
                check(button) {
                    const player = _status.event.player;
                    const card = { name: button.link[2], nature: button.link[3], isCard: true };
                    // 出牌阶段：对敌人有正收益的基本牌按价值排序（杀>桃>酒>其他）
                    if (_status.event.getParent().type == "phase" && game.hasPlayer(current => {
                        return player.canUse(card, current) && get.effect(current, card, player, player) > 0;
                    })) {
                        switch (button.link[2]) {
                            case "sha": return 2.9;
                            case "tao": return 2.8;
                            case "jiu": return 2.5;
                            default: return 1.5;
                        }
                    }
                    // 响应/救援场景：任意基本牌都有价值
                    return 1 + Math.random();
                },
                backup(links, player) {
                    const viewAs = { name: links[0][2], isCard: true };
                    if (links[0][3]) viewAs.nature = links[0][3];
                    return {
                        filterCard: () => false,
                        selectCard: -1,
                        viewAs,
                        popname: true,
                        async precontent(event, trigger, player) {
                            const expansions = player.getExpansions("hfhy_jizi");
                            if (!expansions.length) return;
                            let consume;
                            if (expansions.length === 1) {
                                consume = expansions[0];
                            } else {
                                // 必须 forced：AI 的按钮打分为 -get.value(card)（几乎恒负），
                                // 非强制时 AI 会取消选择，导致视为使用基本牌却不消耗「资」
                                const result = await player.chooseButton(["选择消耗的「资」", [expansions, "card"]], true)
                                    .set("ai", button => {
                                        return -get.value(button.link);
                                    })
                                    .forResult();
                                if (!result.bool || !result.links?.length) return;
                                consume = result.links[0];
                            }
                            player.logSkill("hfhy_jizi");
                            await player.loseToDiscardpile(consume);
                        },
                    };
                },
                prompt(links, player) {
                    return "集资：视为使用一张【" + get.translation(links[0][2]) + "】";
                },
            },
            ai: {
                order(item, player) {
                    // 出牌阶段按杀的时序略偏后，把输出牌留出结算空间（同武圣的排序策略）
                    if (player && _status.event.type == "phase") {
                        return get.order({ name: "sha" }) + 0.1;
                    }
                    return 4;
                },
                respondSha: true,
                respondShan: true,
                save: true,
                skillTagFilter(player, tag, arg) {
                    return player.getExpansions("hfhy_jizi").length > 0;
                },
                result: {
                    player: 1,
                },
            },
            sub: true,
            sourceSkill: "hfhy_jizi",
            "skill_id": "hfhy_jizi_use",
            "_priority": 0,
        },
        gain: {
            trigger: { player: "gainAfter" },
            filter(event, player) {
                return player != _status.currentPhase && event.cards && event.cards.length > 0;
            },
            async cost(event, trigger, player) {
                const gainedCards = trigger.cards;
                // 归汉觉醒需要 3 张「资」，且「资」可当基本牌使用；回合外获得的牌优先存起来
                const awakenPending = player.countExpansions("hfhy_jizi") < 3;
                const result = await player
                    .chooseCard("h", [1, gainedCards.length], "是否将获得的牌置于武将牌上作为「资」？")
                    .set("filterCard", card => gainedCards.includes(card))
                    .set("ai", card => {
                        // 「资」可当基本牌使用，且攒够3张可觉醒归汉；回合外获得的牌倾向存起来
                        const val = get.value(card);
                        // 未觉醒且未攒够3张：只要不是关键牌（桃、无懈等）就存
                        if (awakenPending) {
                            if (val >= 8) return 0;
                            return 8 - val;
                        }
                        // 已攒够/已觉醒：存下价值不高的牌，好牌留手
                        if (val >= 6) return 0;
                        return 6 - val;
                    })
                    .forResult();
                event.result = { bool: result?.bool, cost_data: result?.cards };
            },
            async content(event, trigger, player) {
                if (event.cost_data?.length) {
                    const addCards = player.addToExpansion(event.cost_data, player);
                    addCards.gaintag.add("hfhy_jizi");
                    await addCards;
                }
            },
            sub: true,
            sourceSkill: "hfhy_jizi",
            "skill_id": "hfhy_jizi_gain",
            "_priority": 0,
        },
    },
    ai: {
        order: 9,
        result: { player: 1 },
    },
    "skill_id": "hfhy_jizi",
    "_priority": 0,
},
"hfhy_jiace": {
groupSkill: "qun",
    trigger: { global: "phaseDrawBegin1" },
    filter(event, player) {
        return (
            player.group == "qun" &&
            event.player != player &&
            !event.numFixed &&
            player.getExpansions("hfhy_jizi").length > 0
        );
    },
    async cost(event, trigger, player) {
        const expansions = player.getExpansions("hfhy_jizi");
        const result = await player
            .chooseButton([
                `是否交给${get.translation(trigger.player)}一张「资」？`,
                [expansions, "card"],
            ])
            .set("ai", button => {
                const card = button.link;
                const target = trigger.player;
                const att = get.attitude(player, target);
                // 面对敌人绝不发动
                if (att <= 0) return -1;
                // 面对队友高优先：关系越亲近分越高；「资」按半价折损，优先交最便宜的
                let val = 1 + att * 0.5 - get.value(card) * 0.5;
                // 对方能出杀（手上有杀，或也有「资」可视为杀）且杀得到共同敌人时收益更高
                const canSha =
                    target.countCards("h", { name: "sha" }) > 0 ||
                    target.getExpansions("hfhy_jizi").length > 0;
                if (canSha && game.hasPlayer(cur => target.canUse("sha", cur) && get.attitude(player, cur) < 0)) {
                    val += 3;
                }
                // 否则基本是保底让自己摸两张牌
                return val;
            })
            .forResult();
        event.result = { bool: result?.bool, cost_data: result?.links };
    },
    async content(event, trigger, player) {
        const cards = event.cost_data;
        if (!cards || !cards.length) return;
        
        player.give(cards, trigger.player);
        event.target = trigger.player;
        
        if (game.hasPlayer(current => event.target.canUse("sha", current))) {
            const result = await player.chooseTarget(
                "请选择" + get.translation(event.target) + "【杀】的目标",
                true,
                (card, player2, target2) => _status.event.target.canUse("sha", target2)
            ).set("ai", target2 => {
                const target = _status.event.target;
                const player = _status.event.player;
                if (get.attitude(player, target2) > 0) return -1;
                if (get.attitude(player, target2) < 0) {
                    const eff = get.effect(target2, { name: "sha" }, target, player);
                    const hpRatio = target2.hp / Math.max(1, target2.maxHp);
                    const hpBonus = (1 - hpRatio) * 6;
                    return eff + hpBonus;
                }
                return 0;
            }).set("target", event.target).forResult();
            
            if (result.bool && result.targets && result.targets.length) {
                game.log(player, "指定的出杀目标为", result.targets);
                event.target.line(result.targets);
                const useResult = await event.target.chooseToUse(
                    "对" + get.translation(result.targets) + "使用一张【杀】，或令" + get.translation(player) + "摸两张牌",
                    { name: "sha" },
                    result.targets[0],
                    -1
                ).forResult();
                
                if (!useResult.bool) {
                    await player.draw(2);
                }
            } else {
                await player.draw(2);
            }
        } else {
            await player.draw(2);
        }
    },
    onremove(player, skill) {
        if (player.hasSkill("hfhy_jizi", true)) return;
        const cards = player.getExpansions("hfhy_jizi");
        if (cards.length) {
            player.loseToDiscardpile(cards);
        }
    },
    "skill_id": "hfhy_jiace",
    "_priority": 0,
},
"hfhy_guihan": {
    audio:["sbxieji1.mp3","sbxieji2.mp3","sbxieji3.mp3"],
    limited: true,
    derivation: "paoxiao",
    skillAnimation: true,
    animationColor: "orange",
    trigger: { player: "phaseZhunbeiBegin" },
    filter(event, player) {
        return player.countExpansions("hfhy_jizi") >= 3;
    },
    async content(event, trigger, player) {
        player.awakenSkill(event.name);
        player.changeSkin({ characterName: "shang_zhangfei" }, "shu_shang_zhangfei");
        await player.changeGroup("shu");
        await player.addSkill("paoxiao");
    },
    "skill_id": "hfhy_guihan",
    "_priority": 0,
},
"hfhy_wandi": {
    audio:["paoxiao_re_zhangfei1.mp3","paoxiao_re_zhangfei2.mp3"],
    groupSkill: "shu",
    trigger: { source: "damageBegin1" },
    filter(event, player) {
        return player.group == "shu" && event.card && event.card.name === "sha" && player.getExpansions("hfhy_jizi").length > 0;
    },
    async cost(event, trigger, player) {
        const expansions = player.getExpansions("hfhy_jizi");
        const result = await player
            .chooseButton([
                `是否移去一张「资」令此伤害+1？`,
                [expansions, "card"],
            ])
            .set("ai", button => {
                return -get.value(button.link);
            })
            .forResult();
        event.result = { bool: result?.bool, cost_data: result?.links };
    },
    async content(event, trigger, player) {
        const cards = event.cost_data;
        if (cards && cards.length) {
            await player.loseToDiscardpile(cards[0]);
        }
        trigger.num++;
    },
    "skill_id": "hfhy_wandi",
    "_priority": 0,
},
"hfhy_mzgl_bagua": {
    audio: ["sbkanpo1.mp3","sbkanpo2.mp3"],
    zhuanhuanji: true,
    mark: true,
    marktext: "☯",
    intro: {
        content(storage, player) {
            const names = player.getStorage("hfhy_mzgl_bagua_names", []);
            const recorded = names.length ? names.map(n => get.translation(n)).join("、") : "无";
            if (!storage) {
                return "阳：当你需要使用或打出一张牌时，你可以将一张手牌当做一张未记录的牌名使用或打出，然后记录此牌名。<br/>已记录：" + recorded;
            } else {
                return "阴：当你成为其他角色使用牌的目标时，若此牌名未记录，你可以记录此牌名，令此牌无效并摸一张牌。<br/>已记录：" + recorded;
            }
        },
    },
    init(player, skill) {
        if (!player.storage.hfhy_mzgl_bagua_names) {
            player.storage.hfhy_mzgl_bagua_names = [];
        }
    },
    group: ["hfhy_mzgl_bagua_yang", "hfhy_mzgl_bagua_yin"],
    subSkill: {
        yang: {
            enable: ["chooseToUse", "chooseToRespond"],
            // 无懈响应窗口只对 hasWuxie() 为真的玩家开启：声明 hiddenCard 让手里无真无懈时也能转换
            hiddenCard(player, name) {
                if (name != "wuxie") return false;
                if (player.getStorage("hfhy_mzgl_bagua", false)) return false;
                if (!player.countCards("h")) return false;
                const names = player.getStorage("hfhy_mzgl_bagua_names", []);
                return !names.includes("wuxie");
            },
            filter(event, player) {
                // 转换技状态：falsy=阳，truthy=阴（changeZhuanhuanji翻转storage）
                if (player.getStorage("hfhy_mzgl_bagua", false)) return false;
                // 牌库包含无懈可击：响应无懈的场合经event.filterCard动态过滤后可视为打出无懈
                if (!player.countCards("h")) return false;
                const names = player.getStorage("hfhy_mzgl_bagua_names", []);
                for (const info of lib.inpile) {
                    const name = Array.isArray(info) ? info[2] : info;
                    if (names.includes(name)) continue;
                    const type = Array.isArray(info) ? info[0] : get.type(name);
                    if (type !== "basic" && type !== "trick") continue;
                    const card = { name, isCard: true };
                    if (event.filterCard(card, player, event)) return true;
                    if (name === "sha") {
                        for (const nature of lib.inpile_nature) {
                            card.nature = nature;
                            if (event.filterCard(card, player, event)) return true;
                        }
                    }
                }
                return false;
            },
            chooseButton: {
                dialog(event, player) {
                    const names = player.getStorage("hfhy_mzgl_bagua_names", []);
                    const vcards = get.inpileVCardList(info => {
                        if (names.includes(info[2])) return false;
                        if (info[0] !== "basic" && info[0] !== "trick") return false;
                        const card = { name: info[2], isCard: true };
                        if (info[3]) card.nature = info[3];
                        return event.filterCard(card, player, event);
                    });
                    const dialog = ui.create.dialog("八卦·阳", [vcards, "vcard"], "hidden");
                    dialog.direct = true;
                    return dialog;
                },
                backup(links, player) {
                    const viewAs = { name: links[0][2], isCard: true };
                    if (links[0][3]) viewAs.nature = links[0][3];
                    return {
                        filterCard(card, player) {
                            return player.getCards("h").includes(card);
                        },
                        selectCard: 1,
                        viewAs,
                        popname: true,
                        async precontent(event, trigger, player) {
                            // 闭包捕获所选牌名（官方async写法，替代全局storage暂存）
                            const recordName = viewAs.name;
                            const names = player.getStorage("hfhy_mzgl_bagua_names", []);
                            if (!names.includes(recordName)) names.push(recordName);
                            player.storage.hfhy_mzgl_bagua_names = names;
                            player.changeZhuanhuanji("hfhy_mzgl_bagua");
                            player.markSkill("hfhy_mzgl_bagua");
                        },
                    };
                },
                prompt(links, player) {
                    return "八卦·阳：将一张手牌当做【" + get.translation(links[0][2]) + "】使用";
                },
            },
            ai: {
                order: 9,
                result: { player: 1 },
            },
            "skill_id": "hfhy_mzgl_bagua_yang",
            "_priority": 0,
            sub: true,
            sourceSkill: "hfhy_mzgl_bagua",
        },
        yin: {
            trigger: { target: "useCardToTarget" },
            filter(event, player) {
                if (!player.getStorage("hfhy_mzgl_bagua", false)) return false;
                if (event.player === player) return false;
                const names = player.getStorage("hfhy_mzgl_bagua_names", []);
                return !names.includes(event.card.name);
            },
            async cost(event, trigger, player) {
                const { bool } = await player.chooseBool(
                    `八卦·阴：是否记录【${get.translation(trigger.card.name)}】，令此牌对你无效并摸一张牌？`
                ).set("ai", () => {
                    const me = get.player();
                    const trigger = get.event().getTrigger();
                    const attitude = get.attitude(me, trigger.player);
                    return attitude <= 0;
                }).forResult();
                event.result = { bool };
            },
            async content(event, trigger, player) {
                const names = player.getStorage("hfhy_mzgl_bagua_names", []);
                if (!names.includes(trigger.card.name)) names.push(trigger.card.name);
                player.storage.hfhy_mzgl_bagua_names = names;

                trigger.targets.remove(player);
                trigger.getParent().excluded.add(player);

                await player.draw();
                player.changeZhuanhuanji("hfhy_mzgl_bagua");
                player.markSkill("hfhy_mzgl_bagua");
            },
            "skill_id": "hfhy_mzgl_bagua_yin",
            "_priority": 0,
            sub: true,
            sourceSkill: "hfhy_mzgl_bagua",
        },
    },
    "skill_id": "hfhy_mzgl_bagua",
    "_priority": 0,
},
"hfhy_danqi": {
    audio:["olsbweilin1.mp3","danji1.mp3"],
    initGroup: "wei",
    derivation: ["hfhy_wusheng_lv2", "hfhy_aogu"],
    dutySkill: true,
    forced: true,
    group:["hfhy_danqi_use1","hfhy_danqi_achieve","hfhy_danqi_fail"],
    subSkill:{
        use1: {
    audio:["olsbweilin1.mp3","danji1.mp3"],
    trigger: { player: "phaseDrawBegin" },
    filter(event, player) {
        return game.hasPlayer(p => p !== player);
    },
    direct: true,
    async content(event, trigger, player) {
        const targetResult = await player.chooseTarget(get.prompt("hfhy_danqi"), (card, player, target) => target !== player)
            .set("ai", target => {
                const player = get.player();
                if (get.attitude(player, target) >= 0) return 0;
                return 1 + (target.countGainableCards(player, "hej") > 0 ? 1 : 0);
            })
            .forResult();
        if (!targetResult.bool) return;
        const target = targetResult.targets[0];
        const num = target.countGainableCards(player, "hej");
        const canBeishui = player.maxHp > 1;
        const list = [];
        if (num > 0) list.push("选项一");
        list.push("选项二");
        if (canBeishui) list.push("背水！");

        const controlResult = await player.chooseControl(list)
            .set("choiceList", [
                `获得${get.translation(target)}区域内的一张牌`,
                `此阶段对${get.translation(target)}使用【杀】无距离限制`,
                "背水！减少1点体力上限并执行所有选项"
            ])
            .set("prompt", get.prompt("hfhy_danqi", target))
            .set("ai", () => {
                const me = get.player();
                const n = target.countGainableCards(me, "hej");
                if (n > 0 && target.hp <= 2 && canBeishui) return "背水！";
                if (n > 0) return "选项一";
                return "选项二";
            })
            .forResult();
        
        const control = controlResult.control;
        const isBeishui = control === "背水！";
        // direct:true 静默触发，实际发动（选定目标并做出选择）后才弹技能名并播语音
        player.logSkill("hfhy_danqi", target);
        
        if ((control === "选项一" || isBeishui) && target.countGainableCards(player, "hej") > 0) {
            await player.gainPlayerCard(target, true, "hej");
        }
        if (control === "选项二" || isBeishui) {
            player.addTempSkill("hfhy_danqi_buff", "phaseUseAfter");
            player.storage.kuangdanqi_buff = target;
        }
        if (isBeishui) {
            await player.loseMaxHp();
        }
    },
    sub: true,
    sourceSkill: "hfhy_danqi",
    "skill_id": "hfhy_danqi_use1",
    "_priority": 0,
    },
    achieve: {
        audio:["olsbweilin1.mp3","olsbweilin2.mp3"],
        trigger: {
          source: "dieAfter"
        },
        forced: true,
        locked: false,
        skillAnimation: true,
        animationColor: "fire",
        async content(event, trigger, player) {
            player.changeSkin({characterName:"kuang_guanyu"}, "1_kuang_guanyu");
            player.awakenSkill(event.name.slice(0, -8));
            player.changeGroup("shu");
            player.setStorage("_wusheng_lv2", 1);
            await player.addSkills("hfhy_aogu");
        },
        sub: true,
        sourceSkill: "hfhy_danqi",
        "skill_id": "hfhy_danqi_achieve",
        "_priority": 0,
    },
    fail: {
        audio:["jsp_guangyu.mp3","o_guanyu.mp3"],
        forced: true,
        locked: false,
        trigger: {
          player: ["dying"]
        },
        async content(event, trigger, player) {
            await player.gainMaxHp();
            await player.recover();
            await player.awakenSkill("hfhy_danqi")
        },
        sub: true,
        sourceSkill: "hfhy_danqi",
        "skill_id": "hfhy_danqi_fail",
        "_priority": 0,
    },

    buff: {
            onremove(player) {
                delete player.storage.kuangdanqi_buff;
            },
            mod: {
                targetInRange(card, player, target) {
                    if (card.name === "sha" && target === player.storage.kuangdanqi_buff) {
                        return true;
                    }
                }
            },
            sub: true,
            sourceSkill: "hfhy_danqi",
            "skill_id": "hfhy_danqi_buff",
            "_priority": 0,
    }
    },
    "skill_id": "hfhy_danqi",
    "_priority": 0,
},
"hfhy_zhanjiang": {
    audio:["olsbduoshou1.mp3","olsbduoshou2.mp3"],
    forced: true,
    groupSkill: "wei",
    trigger: {
        player: "phaseUseBegin",
    },
    filter(event, player) {
        return player.group == "wei";
    },
    async content(event, trigger, player) {
        const topCard = get.cards(1)[0];
        const type = get.type(topCard);
        player.showCards(topCard);
        if (type === "basic") {
            await player.gain(topCard, "visible");
            await player.recover();
        } else if (type === "trick") {
            const basics = [];
            for (let i = 0; i < 2; i++) {
                const card = get.discardPile(c => get.type(c, "basic") === "basic" && !basics.includes(c));
                if (card) basics.push(card);
            }
            if (basics.length) await player.gain(basics, "visible");
        } else if (type === "equip") {
            player.addTempSkill("hfhy_zhanjiang_buff", "phaseUseAfter");
        }
    },
    subSkill: {
        buff: {
            forced: true,
            onremove: true,
            mod: {
                cardUsable(card, player, num) {
                    if (card.name === "sha") return num;
                },
            },
            trigger: {
                source: "damageBegin1",
            },
            filter(event, player) {
                return event.card && event.card.name === "sha";
            },
            content() {
                trigger.num++;
            },
            sub: true,
            sourceSkill: "hfhy_zhanjiang",
            "skill_id": "hfhy_zhanjiang_buff",
            "_priority": 0,
        },
    },
    "skill_id": "hfhy_zhanjiang",
    "_priority": 0,
},

// 武圣 
"hfhy_wusheng": {
    audio: ["sbwusheng1.mp3","sbwusheng2.mp3","sbwusheng3.mp3"],
    enable: ["chooseToUse", "chooseToRespond"],
    mark: true,
    marktext: "武圣",
    intro: {
        content(storage, player) {
            return "本轮已发动" + (storage || 0) + "次。";
        },
    },
    init(player, skill) {
        player.storage[skill] = 0;
    },
    hiddenCard(player, name) {
        return name == "sha" && player.countCards("hs");
    },
    filter(event, player) {
        if (!player.getStorage("_wusheng_lv2", 0) && (player.storage.hfhy_wusheng || 0) >= 2) return false;
        return (
            event.filterCard(get.autoViewAs({ name: "sha" }, "unsure"), player, event) ||
            lib.inpile_nature.some(nature => event.filterCard(get.autoViewAs({ name: "sha", nature }, "unsure"), player, event))
        );
    },
    chooseButton: {
        dialog(event, player) {
            var list = [];
            if (event.filterCard(get.autoViewAs({ name: "sha" }, "unsure"), player, event)) {
                list.push(["基本", "", "sha"]);
            }
            for (var j of lib.inpile_nature) {
                if (event.filterCard(get.autoViewAs({ name: "sha", nature: j }, "unsure"), player, event)) {
                    list.push(["基本", "", "sha", j]);
                }
            }
            var dialog = ui.create.dialog("武圣", [list, "vcard"], "hidden");
            dialog.direct = true;
            return dialog;
        },
        check(button) {
            var player = _status.event.player;
            var card = { name: button.link[2], nature: button.link[3] };
            if (
                _status.event.getParent().type == "phase" &&
                game.hasPlayer(function (current) {
                    return player.canUse(card, current) && get.effect(current, card, player, player) > 0;
                })
            ) {
                switch (button.link[2]) {
                    case "sha":
                        if (button.link[3] == "fire") return 2.95;
                        else if (button.link[3] == "thunder" || button.link[3] == "ice") return 2.92;
                        else return 2.9;
                }
            }
            return 1 + Math.random();
        },
        backup(links, player) {
            return {
                audio: "sbwusheng",
                filterCard: true,
                check(card) {
                    return 6 - get.value(card);
                },
                viewAs: { name: links[0][2], nature: links[0][3], _wusheng_sha: true }, // 关键：直接在生成的卡牌上打标记
                position: "hs",
                popname: true,
                precontent() {
                    player.storage.hfhy_wusheng++;
                    player.markSkill("hfhy_wusheng");
                },
            };
        },
        prompt(links, player) {
            return (
                "将一张手牌当作" +
                get.translation(links[0][3] || "") +
                "【" +
                get.translation(links[0][2]) +
                "】" +
                (_status.event.name == "chooseToUse" ? "使用" : "打出")
            );
        },
    },
    ai: {
        respondSha: true,
        fireAttack: true,
        skillTagFilter(player, tag) {
            if (!player.countCards("hs")) return false;
        },
        order(item, player) {
            if (player && _status.event.type == "phase") {
                var max = 0;
                if (lib.inpile_nature.some(i => player.getUseValue({ name: "sha", nature: i }) > 0)) {
                    var temp = get.order({ name: "sha" });
                    if (temp > max) max = temp;
                }
                if (max > 0) max += 0.3;
                return max;
            }
            return 4;
        },
        result: { player: 1 },
    },
    group: ["hfhy_wusheng_buff1", "hfhy_wusheng_buff2", "hfhy_wusheng_buff3", "hfhy_wusheng_clear", "hfhy_wusheng_buff4"],
    subSkill: {
        buff1: {
            audio: ["mbwusheng1.mp3"],
            trigger: { player: "useCard1" },
            filter(event, player) {
                if (!event.card._wusheng_sha) return false;
                return event.card.name == "sha"
                    && event.cards && event.cards.length == 1
                    && get.type(event.cards[0], "basic") == "basic";
            },
            forced: true,
            content() {
                if (trigger.addCount !== false) {
                    trigger.addCount = false;
                    const stat = player.getStat().card;
                    const name = trigger.card.name;
                    if (typeof stat[name] === "number") {
                        stat[name]--;
                    }
                }
            },
            sub: true,
            sourceSkill: "hfhy_wusheng",
            skill_id: "hfhy_wusheng_buff1",
            _priority: 0,
        },
        buff2: {
            audio: ["mbwusheng2.mp3"],
            trigger: { player: "useCard1" },
            filter(event, player) {
                if (!event.card._wusheng_sha) return false;
                return event.card.name == "sha"
                    && event.cards && event.cards.length == 1
                    && get.type(event.cards[0], "equip") == "equip";
            },
            forced: true,
            content() {
                trigger.directHit.push(trigger.targets[0]);
            },
            sub: true,
            sourceSkill: "hfhy_wusheng",
            skill_id: "hfhy_wusheng_buff2",
            _priority: 0,
        },
        buff3: {
            audio: ["mbwusheng3.mp3"],
            trigger: { player: "useCard1" },
            filter(event, player) {
                if (!event.card._wusheng_sha) return false;
                return event.card.name == "sha"
                    && event.cards && event.cards.length == 1
                    && get.type(event.cards[0], "trick") == "trick";
            },
            forced: true,
            content() {
                player.draw(1);
            },
            sub: true,
            sourceSkill: "hfhy_wusheng",
            skill_id: "hfhy_wusheng_buff3",
            _priority: 0,
        },
        clear: {
            trigger: { global: "roundStart" },
            forced: true,
            content() {
                player.storage.hfhy_wusheng = 0;
                player.markSkill("hfhy_wusheng");
            },
            sub: true,
            sourceSkill: "hfhy_wusheng",
            skill_id: "hfhy_wusheng_clear",
            _priority: 0,
        },
        buff4: {
            audio: ["mbwusheng4.mp3"],
            trigger: { source: "damageSource" },
            filter(event, player) {
                if (!player.getStorage("_wusheng_lv2", 0)) return false;
                if (!event.card || event.card.name !== "sha") return false;
                if (!event.card._wusheng_sha) return false;
                return true;
            },
            forced: true,
            popup: true,
            async content(event, trigger, player) {
                const target = trigger.player;
                if (target && target !== player && target.countCards("h") > 0) {
                    await target.chooseToDiscard("h", true);
                }
            },
            sub: true,
            sourceSkill: "hfhy_wusheng",
            skill_id: "hfhy_wusheng_buff4",
            _priority: 0,
        },
    },
    skill_id: "hfhy_wusheng",
    _priority: 0,
},
"hfhy_aogu": {
    audio:["wusheng_dc_jsp_guanyu1.mp3","wusheng_dc_jsp_guanyu2.mp3"],
    groupSkill: "shu",
    limited: true,
    skillAnimation: true,
    animationColor: "fire",
    enable: "phaseUse",
    filter(event, player) {
        return player.countCards("h") > 0 && player.group === "shu";
    },
    async content(event, trigger, player) {
        const cards = player.getCards("h");
        if (!cards.length) return;

        await player.showCards(cards, get.translation(player) + "展示了所有手牌");

        const regionMap = { "手牌区": "h", "装备区": "e", "判定区": "j" };
        const result = await player
            .chooseTarget("请选择一名其他角色进行拼点", true)
            .set("filterTarget", (card, player, target) => target != player && target.countCards("h") > 0)
            .set("ai", target => {
                const me = get.player();
                // 只拼敌人；收益 = 潜在掠夺量（手牌+装备），我有大点数牌且对方手牌不多时胜率更高
                if (get.attitude(me, target) >= 0) return -1;
                let val = target.countCards("h") * 0.6 + target.countCards("e") * 1.5;
                const bigPoint = me.getCards("h").some(card => get.number(card) >= 11);
                if (bigPoint && target.countCards("h") <= me.countCards("h")) val += 1;
                return val;
            })
            .forResult();

        if (!result.bool) return;
        const target = result.targets[0];

        const { bool } = await player.chooseToCompare(target).forResult();

        if (bool) {
            const list = [];
            if (target.countCards("h") > 0) list.push("手牌区");
            if (target.countCards("e") > 0) list.push("装备区");
            if (target.countCards("j") > 0) list.push("判定区");

            if (list.length) {
                const { control } = await player.chooseControl(list)
                    .set("prompt", "选择一个区域获得其所有牌")
                    .set("ai", () => {
                        // 按区域总价值选：手牌区有额外破坏收益，判定区拿走会帮对方解除延时锦囊需打折
                        const regionValue = pos => target.getCards(pos).reduce((sum, card) => sum + get.value(card, player), 0);
                        let best = list[0], bestVal = -Infinity;
                        for (const region of list) {
                            let val = regionValue(regionMap[region]);
                            if (region === "手牌区") val += 1;
                            if (region === "判定区") val -= 3;
                            if (val > bestVal) { bestVal = val; best = region; }
                        }
                        return best;
                    })
                    .forResult();

                const cardsToGain = target.getCards(regionMap[control]);
                if (cardsToGain.length) {
                    await player.gain(cardsToGain, "visible");
                }
            }
        }
        else {
            // 拼点输：从弃牌堆拿三类各一张作为保底收益
            const gainCards = [];
            const types = ["basic", "trick", "equip"];
            for (const type of types) {
                const card = get.discardPile(c => get.type(c, type) === type && !gainCards.includes(c));
                if (card) gainCards.push(card);
            }
            if (gainCards.length) {
                await player.gain(gainCards, "visible");
            }
        }
        player.awakenSkill("hfhy_aogu");
    },
    ai: {
        order: 8,
        result: {
            player(player) {
                // 限定技收益判断：有可拼点的敌人，且胜率或收益值得才发动，否则留着
                const enemies = game.filterPlayer(target => {
                    return target != player && target.countCards("h") > 0 && get.attitude(player, target) < 0;
                });
                if (!enemies.length) return 0;
                const bigPoint = player.getCards("h").some(card => get.number(card) >= 11);
                const loot = Math.max(...enemies.map(t => t.countCards("h") + t.countCards("e") * 1.5));
                if (bigPoint && loot >= 3) return 1;   // 胜率高且收益可观
                if (loot >= 5) return 1;               // 对方牌很多，输了也有三张基本牌保底
                return 0;
            },
        },
    },
    "skill_id": "hfhy_aogu",
    "_priority": 0,
},
"hfhy_zaoxian": {
	forced: true,
    locked: false,
    audio: ["zaoxian_re_dengai1.mp3", "zaoxian_re_dengai2.mp3"],
    trigger: { player: ["useCardAfter", "respond"] },
    filter(event, player) {
        return event.card && get.type(event.card, "basic") === "basic";
    },
    async content(event, trigger, player) {
        // 判定零成本：方片得险标记（距离-1/破蜀弹药/急袭），红桃白得一张牌，AI无脑发动
        const result = await player.chooseBool("是否发动【凿险】进行判定？")
            .set("ai", () => true)
            .forResult();
        if (!result.bool) return;
        const judgeEvent = player.judge(card => {
            if (get.suit(card) === "heart") return 1;
            if (get.suit(card) === "diamond") return 1;
            return -1;
        });
        judgeEvent.judge2 = result => result.bool;
        judgeEvent.callback = async (judgeEvent, trigger, player) => {
            const result = judgeEvent?.judgeResult;
            if (!result) return;
            const card = result.card;
            if (result.suit === "diamond") {
                const next = player.addToExpansion(card, "gain2");
                next.gaintag.add("hfy_xian");
                await next;
                player.addMark("hfhy_zaoxian", 1, false);
            } else if (result.suit === "heart") {
                await player.gain(card, "gain2");
            }
        };
        await judgeEvent;
    },
    group: ["hfhy_zaoxian_distance"],
    mark: true,
    marktext: "险",
    intro: {
        content(storage, player) {
            return "当前险标记：" + (storage || 0) + "个，距离-" + (storage || 0);
        },
    },
    init(player, skill) {
        player.storage[skill] = 0;
    },
    subSkill: {
        distance: {
            mod: {
                globalFrom(from, to, distance) {
                    return distance - from.countMark("hfhy_zaoxian");
                },
            },
            sub: true,
            sourceSkill: "hfhy_zaoxian",
            skill_id: "hfhy_zaoxian_distance",
            _priority: 0,
        },
    },
    skill_id: "hfhy_zaoxian",
    _priority: 0,
},
"hfhy_tuntian": {
    audio:["pottuntian1.mp3","pottuntian2.mp3"],
    trigger: { player: "phaseJieshuBegin" },
    filter(event, player) {
        return player.hasCard(card => get.suit(card) === "heart", "he") ||
               player.hasCard(card => get.suit(card) === "diamond", "h");
    },
    async content(event, trigger, player) {
        const list = [];
        if (player.hasCard(card => get.suit(card) === "heart", "he")) list.push("选项一");
        if (player.hasCard(card => get.suit(card) === "diamond", "h")) list.push("选项二");
        list.push("cancel2");
        
        const { control } = await player.chooseControl(list)
            .set("choiceList", [
                "弃置至少一张红桃牌，然后从弃牌堆获得两倍的基本牌，以此法获得的牌不计入手牌上限",
                "将一张方片手牌置于你的武将牌上"
            ])
            .set("prompt", "屯田：请选择一项")
            .set("ai", () => {
                // 选项一：有低价值红桃且弃牌堆有基本牌可换时优先
                const cheapHeart = player.getCards("he").find(card => get.suit(card) == "heart" && get.value(card) < 4.5);
                const basicsInPile = Array.from(ui.discardPile.childNodes).filter(c => get.type(c, "basic") === "basic").length;
                if (cheapHeart && basicsInPile >= 2) return "选项一";
                // 选项二：只舍得放低价值的方片手牌
                const cheapDiamond = player.getCards("h").find(card => get.suit(card) == "diamond" && get.value(card) < 5.5);
                if (cheapDiamond) return "选项二";
                return "cancel2";
            })
            .forResult();

        if (control === "cancel2") return;

        if (control === "选项一") {
            const result = await player
                .chooseToDiscard([1, Infinity], "he", true)
                .set("prompt", "弃置任意张红桃牌，从弃牌堆获得双倍数量的基本牌")
                .set("filterCard", card => get.suit(card) === "heart")
                .set("ai", card => {
                    // 只弃低价值红桃（桃等关键牌保留），高价值红桃返回负分由强制兜底
                    return get.value(card) < 4.5 ? 5 - get.value(card) : -1;
                })
                .forResult();
            if (!result.bool) return;

            const N = result.cards.length;
            const gainCards = [];
            for (let i = 0; i < 2 * N; i++) {
                const card = get.discardPile(c =>
                    get.type(c, "basic") === "basic" && !gainCards.includes(c)
                );
                if (card) {
                    card.addGaintag("hfhy_tuntian");
                    gainCards.push(card);
                }
            }
            if (gainCards.length) {
                await player.gain(gainCards, "gain2");
                player.addTempSkill("hfhy_tuntian_mark");
            }
        } else if (control === "选项二") {
            const result = await player.chooseCard(
                "h",
                true,
                "请选择一张方片手牌置于武将牌上",
                card => get.suit(card) === "diamond"
            ).set("ai", card => {
                // 优先放价值最低的方片，险标记用于破蜀/急袭/减距离
                return 6 - get.value(card);
            }).forResult();
            if (result.bool && result.cards.length) {
                const card = result.cards[0];
                const next = player.addToExpansion(card, "gain2");
                next.gaintag.add("hfy_xian");
                await next;
                player.addMark("hfhy_zaoxian", 1, false);
            }
        }
    },
    group: ["hfhy_tuntian_mark"],
    subSkill: {
        mark: {
            onremove(player) {
                player.removeGaintag("hfhy_tuntian");
            },
            mod: {
                ignoredHandcard(card, player) {
                    if (typeof card.hasGaintag == "function" && card.hasGaintag("hfhy_tuntian")) {
                        return true;
                    }
                },
                cardDiscardable(card, player, name) {
                    if (name == "phaseDiscard" && typeof card.hasGaintag == "function" && card.hasGaintag("hfhy_tuntian")) {
                        return false;
                    }
                },
            },
            sub: true,
            sourceSkill: "hfhy_tuntian",
            skill_id: "hfhy_tuntian_mark",
            _priority: 0,
        },
    },
    skill_id: "hfhy_tuntian",
    _priority: 0,
},
    "hfhy_poshu":{
    audio:["potzaoxian1.mp3","potzaoxian2.mp3"],
    derivation: "hfhy_jixi",
    limited: true,
    skillAnimation: true,
    animationColor: "ice",
    trigger: { global: "phaseEnd" },
    filter(event, player) {
        if (event.player == player) return false;
        if (get.distance(player, event.player) !== 1) return false;
        return player.countMark("hfhy_zaoxian") > 0;
    },
    async cost(event, trigger, player) {
        const target = trigger.player;
        const x = player.countMark("hfhy_zaoxian");
        event.result = await player.chooseBool(
            `是否对${get.translation(target)}发动【破蜀】？减少1点体力上限并造成${x}点伤害`
        ).set("ai", () => {
            // 限定技局势判断：只打敌人；体力上限过低不再扣；伤害足以击杀/重创时果断发动，伤害小则留到关键时刻
            if (get.attitude(player, target) >= 0) return false;
            if (player.maxHp <= 2) return false;
            if (x >= target.hp) return true;           // 伤害≥目标体力，足以击杀
            if (x >= 2 && target.hp <= 2) return true; // 重创濒死敌人
            if (x >= 4) return true;                   // 高伤害直接打
            return false;                              // 伤害太小，留作后手
        }).forResult();
    },
    async content(event, trigger, player) {
        const target = trigger.player;
        const x = player.countMark("hfhy_zaoxian");
        
        player.awakenSkill("hfhy_poshu");
        await player.loseMaxHp();
        if (x > 0) {
            await target.damage(x);
        }
        await player.addSkills("hfhy_jixi");
        player.insertPhase("event.name");
    },
},
"hfhy_jixi": {
    audio: ["potjixi1.mp3", "potjixi2.mp3"],
    enable: "phaseUse",
    usable: 1,
    filter(event, player) {
        if (player.countMark("hfhy_zaoxian") <= 0) return false;
        const card = get.autoViewAs({ name: "shunshou", isCard: true });
        return game.hasPlayer(target => {
            return target != player && get.distance(player, target) === 1 && player.canUse(card, target, false);
        });
    },
    async content(event, trigger, player) {
        const shunshou = get.autoViewAs({ name: "shunshou", isCard: true });
        const targets = game.filterPlayer(target => {
            return target != player && get.distance(player, target) === 1 && player.canUse(shunshou, target, false);
        });
        
        if (targets.length) {
            await player.chooseUseTarget({
                card: shunshou,
                prompt: "急袭：视为对距离为一的其他角色使用一张【顺手牵羊】",
                selectTarget: [1, targets.length],
                filterTarget(card2, player2, target2) {
                    return get.event().targets.includes(target2);
                }
            }).set("targets", targets);
        }

        // 使用后再扣除标记
        player.removeMark("hfhy_zaoxian", 1, false);
        const cards = player.getExpansions("hfhy_zaoxian");
        const card = cards.find(c => c.hasGaintag("hfy_xian"));
        if (card) {
            player.loseToDiscardpile(card);
        }
    },
    ai: {
        order: 5,
        result: {
            player(player) {
                // 险标记是破蜀的伤害弹药：标记≥2才舍得消耗急袭，仅剩1枚时留作爆发
                if (player.countMark("hfhy_zaoxian") >= 2) return 1;
                return 0;
            },
        },
    },
},
"hfhy_wushuang": {
    audio: ["sbwushuang1.mp3","sbwushuang2.mp3","sbwushuang3.mp3","sbwushuang4.mp3"],
    forced: true,
    trigger: { player: "useCard1" },
    filter(event, player) {
        return (
            event.card &&
            (event.card.name === "sha" || event.card.name === "juedou")
        );
    },
    async content(event, trigger, player) {
        player.addMark("hfhy_wushuang", 1, false);
        const x = player.countMark("hfhy_wushuang");
        const canBeishui = player.maxHp > 1;
        
        const list = [];
        list.push("选项一");
        list.push("选项二");
        if (canBeishui) list.push("背水！");
        list.push("cancel2");
        
        const { control } = await player.chooseControl(list)
            .set("choiceList", [
                `额外选择${x}名你攻击距离以内的其他角色为目标`,
                `令本次【杀】需${x}张【闪】/【决斗】需${x}张【杀】响应`,
                "背水！减少1点体力上限并执行所有选项"
            ])
            .set("prompt", "无双：请选择一项")
            .set("ai", () => {
                // 极致输出：优先背水（双选项全开+逞凶次数+1），其次按场面收益
                const me = get.player();
                const card = trigger.card;
                const mainTarget = trigger.targets?.[0];
                const extraTargets = game.filterPlayer(target => {
                    return target != me && !trigger.targets.includes(target) &&
                        get.attitude(me, target) < 0 && me.canUse(card, target, false) && me.inRange(target);
                }).length;
                if (canBeishui && me.maxHp > 2 && (extraTargets >= 1 || (mainTarget && mainTarget.hp <= 2) || x >= 2)) return "背水！";
                // 有额外可打目标：多目标AOE收益最大
                if (extraTargets >= 1) return "选项一";
                // 单体输出：目标需X张闪/杀响应，几乎无法抵消
                return "选项二";
            })
            .forResult();
        
        if (control === "cancel2") return;
        
        const isBeishui = control === "背水！";
        player.storage._hfy_wushuang_x = x;
        
        if (control === "选项一" || isBeishui) {
            player.addTempSkill("hfhy_wushuang_multi", "phaseUseAfter");
        }
        if (control === "选项二" || isBeishui) {
            player.addTempSkill("hfhy_wushuang_sha_block", "phaseUseAfter");
            player.addTempSkill("hfhy_wushuang_juedou_block", "phaseUseAfter");
        }
        if (isBeishui) {
            await player.loseMaxHp();
            player.storage._wushuang_chengxiong_buff = (player.storage._wushuang_chengxiong_buff || 0) + 1;
            player.addTempSkill("hfhy_wushuang_chengxiong_buff", "phaseUseAfter");
        }
        
        const removeSkills = () => {
            if (control === "选项一" || isBeishui) {
                player.removeSkill("hfhy_wushuang_multi");
            }
            if (control === "选项二" || isBeishui) {
                player.removeSkill("hfhy_wushuang_sha_block");
                player.removeSkill("hfhy_wushuang_juedou_block");
            }
        };
        player.storage._hfy_wushuang_remove = removeSkills;
        player.addTempSkill("hfhy_wushuang_cleanup", "phaseUseAfter");
    },
    group: ["hfhy_wushuang_damage","hfhy_wushuang_reset",],
    subSkill: {
        cleanup: {
            trigger: { player: "useCardAfter" },
            filter(event, player) {
                return (
                    (event.card.name === "sha" || event.card.name === "juedou") &&
                    typeof player.storage._hfy_wushuang_remove === "function"
                );
            },
            forced: true,
            popup: false,
            silent: true,
            async content(event, trigger, player) {
                player.storage._hfy_wushuang_remove();
                delete player.storage._hfy_wushuang_remove;
                player.removeSkill("hfhy_wushuang_cleanup");
            },
            sub: true,
            sourceSkill: "hfhy_wushuang",
            skill_id: "hfhy_wushuang_cleanup",
            _priority: 0,
        },
        reset: {
            trigger: { global: "roundStart" },
            forced: true,
            popup: false,
            silent: true,
            async content(event, trigger, player) {
                player.clearMark("hfhy_wushuang");
                delete player.storage._wushuang_chengxiong_buff;
            },
            sub: true,
            sourceSkill: "hfhy_wushuang",
            skill_id: "hfhy_wushuang_reset",
            _priority: 0,
        },
        multi: {
            audio: ["sbwushuang4.mp3"],
            forced: true,
            trigger: { player: "useCard2" },
            filter(event, player) {
                return (
                    (event.card.name === "sha" || event.card.name === "juedou") &&
                    player.storage._hfy_wushuang_x > 0
                );
            },
            async content(event, trigger, player) {
                const x = player.storage._hfy_wushuang_x;
                const card = trigger.card;
                const targets = game.filterPlayer(target => {
                    return (
                        target != player &&
                        !trigger.targets.includes(target) &&
                        player.canUse(card, target, false) &&
                        player.inRange(target)
                    );
                });
                if (targets.length) {
                    const result = await player.chooseTarget(
                        `额外选择至多${x}名目标`,
                        [1, Math.min(x, targets.length)],
                        (card2, player2, target) => targets.includes(target)
                    ).set("ai", target => {
                        // 只打敌人，按此牌对目标的实际收益排序
                        const me = get.player();
                        if (get.attitude(me, target) >= 0) return -1;
                        return get.effect(target, trigger.card, me, me);
                    }).forResult();
                    if (result.bool) {
                        trigger.targets.addArray(result.targets);
                    }
                }
            },
            sub: true,
            sourceSkill: "hfhy_wushuang",
            skill_id: "hfhy_wushuang_multi",
            _priority: 0,
        },
        sha_block: {
            audio: ["sbwushuang3.mp3"],
            trigger: { player: "useCardToPlayered" },
            forced: true,
            filter(event, player) {
                return event.card.name === "sha";
            },
            logTarget: "target",
            async content(event, trigger, player) {
                const idt = trigger.target.playerid;
                const map = trigger.getParent().customArgs;
                if (!map[idt]) {
                    map[idt] = {};
                }
                const x = player.storage._hfy_wushuang_x;
                if (typeof map[idt].shanRequired === "number") {
                    map[idt].shanRequired += x;
                } else {
                    map[idt].shanRequired = x;
                }
            },
            ai: {
                directHit_ai: true,
                skillTagFilter(player, tag, arg) {
                    if (!arg || !arg.card || !arg.target) return false;
                    if (arg.card.name !== "sha") return false;
                    if (arg.target.countCards("h", "shan") > 1) return false;
                    return true;
                },
            },
            sub: true,
            sourceSkill: "hfhy_wushuang",
            skill_id: "hfhy_wushuang_sha_block",
            _priority: 0,
        },
        juedou_block: {
            audio: ["sbwushuang3.mp3"],
            trigger: { player: "useCardToPlayered" },
            forced: true,
            filter(event, player) {
                return event.card.name === "juedou";
            },
            logTarget: "target",
            async content(event, trigger, player) {
                const id = (player == trigger.player ? trigger.target : trigger.player).playerid;
                const idt = trigger.target.playerid;
                const map = trigger.getParent().customArgs;
                if (!map[idt]) {
                    map[idt] = {};
                }
                if (!map[idt].shaReq) {
                    map[idt].shaReq = {};
                }
                const x = player.storage._hfy_wushuang_x;
                if (!map[idt].shaReq[id]) {
                    map[idt].shaReq[id] = x;
                } else {
                    map[idt].shaReq[id] += x;
                }
            },
            ai: {
                directHit_ai: true,
                skillTagFilter(player, tag, arg) {
                    if (!arg || !arg.card || !arg.target) return false;
                    if (arg.card.name !== "juedou") return false;
                    if (Math.floor(arg.target.countCards("h", "sha") / 2) > player.countCards("h", "sha")) return false;
                    return true;
                },
            },
            sub: true,
            sourceSkill: "hfhy_wushuang",
            skill_id: "hfhy_wushuang_juedou_block",
            _priority: 0,
        },
        damage: {
            trigger: { source: "damageBegin1" },
            filter(event, player) {
                const target = event.player;
                const evtx = event.getParent(2);
                const card = event.card;
                const name = card?.name;
                if (!card || !["sha", "juedou"].includes(name)) {
                    return false;
                }
                if (name == "sha") {
                    return !target.hasHistory("useCard", evt => {
                        return evt.card.name == "shan" && evt.respondTo && evt.getParent(3) == evtx;
                    });
                }
                return !target.hasHistory("respond", evt => {
                    return evt.card.name == "sha" && evt.respondTo && evt.getParent(3) == evtx;
                });
            },
            forced: true,
            logTarget: "player",
            usable: 1,
            logAudio: () => ["sbwushuang4.mp3", "sbwushuang5.mp3"],
            content() {
                trigger.num++;
            },
            sub: true,
            sourceSkill: "hfhy_wushuang",
            skill_id: "hfhy_wushuang_damage",
            _priority: 0,
        },
        chengxiong_buff: {
            onremove(player) {delete player.storage._wushuang_chengxiong_buff;},
            sub: true,
            sourceSkill: "hfhy_wushuang",
            skill_id: "hfhy_wushuang_chengxiong_buff",
            _priority: 0,
        },
    },
    skill_id: "hfhy_wushuang",
    _priority: 0,
},
"hfhy_chengxiong": {
    audio:["dcxiaowu1.mp3","dcxiaowu2.mp3"],
    enable: "phaseUse",
    usable(skill, player) {
    return 1 + (player.storage._wushuang_chengxiong_buff || 0);
    },
    filter(event, player) {
        return player.hasCard(card => {
            const type = get.type(card, "trick");
            return type === "basic" || type === "trick";
        }, "hs");
    },
    chooseButton: {
        dialog(event, player) {
            const list = [];
            if (event.filterCard(get.autoViewAs({ name: "sha" }, "unsure"), player, event)) {
                list.push(["基本", "", "sha"]);
            }
            if (event.filterCard(get.autoViewAs({ name: "juedou" }, "unsure"), player, event)) {
                list.push(["锦囊", "", "juedou"]);
            }
            const dialog = ui.create.dialog("逞凶", [list, "vcard"], "hidden");
            dialog.direct = true;
            return dialog;
        },
        check(button) {
            const player = _status.event.player;
            const hasBasic = player.hasCard(card => get.type(card, "trick") === "basic", "hs");
            const hasTrick = player.hasCard(card => get.type(card, "trick") === "trick", "hs");
            if (button.link[2] === "sha" && hasBasic) return 2.5;
            if (button.link[2] === "juedou" && hasTrick) return 2;
            if (hasBasic) return 2.5;
            return 2;
        },
        backup(links, player) {
            const isSha = links[0][2] === "sha";
            return {
                audio: "hfhy_chengxiong",
                filterCard(card) {
                    const type = get.type(card, "trick");
                    if (isSha) return type === "basic";
                    return type === "trick";
                },
                selectCard: 1,
                check(card) {
                    return 6 - get.value(card);
                },
                viewAs: { name: links[0][2] },
                position: "hs",
                popname: true,
            };
        },
        prompt(links, player) {
            if (links[0][2] === "sha") return "将一张基本牌当作【杀】使用";
            return "将一张锦囊牌当作【决斗】使用";
        },
    },
    group: ["hfhy_chengxiong_mark"],
    mark: true,
    marktext: "勇",
    intro: {
        content(storage, player) {
            return "当前勇标记：" + (storage || 0) + "枚";
        },
    },
    init(player, skill) {
        player.storage[skill] = 0;
    },
    subSkill: {
        mark: {
            forced: true,
            trigger: { source: "damageEnd" },
            filter(event, player) {
                return (
                    event.card &&
                    (event.card.name === "sha" || event.card.name === "juedou") &&
                    event.num > 0
                );
            },
            async content(event, trigger, player) {
                player.addMark("hfhy_chengxiong", trigger.num);
            },
            sub: true,
            sourceSkill: "hfhy_chengxiong",
            skill_id: "hfhy_chengxiong_mark",
            _priority: 0,
        },
    },
    ai: {
        order: 5,
        result: {
            player: 1,
        },
    },
    skill_id: "hfhy_chengxiong",
    _priority: 0,
},
"hfhy_shiyong": {
    audio:["sbliyu1.mp3","sbliyu2.mp3","sbliyu3.mp3","sbliyu4.mp3","sbliyu5.mp3"],
    enable: "phaseUse",
    filter(event, player) {
        return player.countMark("hfhy_chengxiong") >= 3;
    },
    async content(event, trigger, player) {
        const num = player.countMark("hfhy_chengxiong");
        player.clearMark("hfhy_chengxiong");
        
        const { control } = await player.chooseControl(["选项一", "选项二", "选项三"])
            .set("choiceList", [
                "增加一点体力上限",
                "获得一点护甲",
                "摸两张牌"
            ])
            .set("prompt", `恃勇：移去${num}枚"勇"，请选择一项`)
            .set("ai", () => {
                // 极致输出风格：缺牌补牌维持攻势，其次扩上限支撑无双背水，护甲最不优先
                const me = get.player();
                if (me.countCards("h") <= 3) return "选项三";
                return "选项一";
            })
            .forResult();
        
        if (control === "选项一") {
            await player.gainMaxHp();
        } else if (control === "选项二") {
            await player.changeHujia(1);
        } else if (control === "选项三") {
            await player.draw(2);
        }
    },
    ai: {
        order: 5,
        result: {
            player: 1,
        },
    },
    skill_id: "hfhy_shiyong",
    _priority: 0,
},
"hfhy_budao": {
    audio: ["sbhuangtian1.mp3","sbguidao2.mp3","sbguidao1.mp3"],
    trigger: { player: "gameStart" },
    forced: true,
    async content(event, trigger, player) {
        if (player.storage.hfhy_huangjin) return;
        player.storage.hfhy_huangjin = true;
        player.markSkill("hfhy_budao");
    },
    init(player, skill) {
        if (player.storage.hfhy_huangjin) return;
        player.storage.hfhy_huangjin = true;
    },
    group: ["hfhy_budao_dying", "hfhy_budao_phase"],
    mark: true,
    marktext: "黄巾",
    intro: {
        content: "拥有黄巾标记",
    },
    // 主技能 AI：提高威胁度，因为黄巾标记能联动强力技能
    ai: {
        threaten: 1.2, // 拥有黄巾的角色通常有更强的配合，敌人应优先处理
        tag: {
            gain: 1,    // 有获得标记的能力，视为收益技能
        }
    },
    subSkill: {
            dying: {
                audio: ["sbhuangtian1.mp3","sbguidao2.mp3","sbguidao1.mp3"],
                trigger: { global: "dying" },
                filter(event, player) {
                    const target = event.player;
                    return (
                        target != player &&
                        !target.storage.hfhy_huangjin &&
                        player.countCards("he") > 0
                    );
                },
                async cost(event, trigger, player) {
                    const target = trigger.player;
                    event.result = await player.chooseBool(
                        `是否交给${get.translation(target)}一张牌，令其恢复1点体力并获得"黄巾"标记？`
                    ).set("ai", () => {
                        const att = get.attitude(player, target);

                        // 敌人不救
                        if (att <= 0) return false;
                        // 自保：自己血少且牌不足时留着闪/桃
                        if (player.hp <= 1 && player.countCards("he") <= 2) return false;
                        // 有低价值牌时果断救（回复1点体力+获得黄巾标记）
                        let minVal = Infinity;
                        for (const card of player.getCards("he")) {
                            minVal = Math.min(minVal, get.value(card, player));
                        }
                        if (minVal <= 5) return true;
                        // 只剩关键牌时，只有亲近队友（高态度）才值得交牌救
                        return att >= 2;
                    }).forResult();
                },
                async content(event, trigger, player) {
                    const target = trigger.player;
                    const result = await player.chooseToGive(target, false, "he")
                        .set("check", card => 9 - get.value(card))
                        .forResult();
                    if (result.bool) {
                        target.storage.hfhy_huangjin = true;
                        target.markSkill("hfhy_budao");
                        await target.recover();
                    }
                },
                sub: true,
                sourceSkill: "hfhy_budao",
                skill_id: "hfhy_budao_dying",
                _priority: 0,
            },
        phase: {
            audio: ["sbhuangtian1.mp3","sbguidao2.mp3","sbguidao1.mp3"],
            trigger: { global: "phaseBegin" },
            filter(event, player) {
                return (
                    event.player != player &&
                    !event.player.storage.hfhy_huangjin &&
                    event.player.countCards("he") > 0
                );
            },
            async cost(event, trigger, player) {
                const target = trigger.player;
                event.result = await target.chooseBool(
                    `是否交给${get.translation(player)}一张牌，获得"黄巾"标记？`
                ).set("ai", () => {
                    // 决策者 target：回合开始的角色；player：布道持有者（收牌的人）
                    const att = get.attitude(target, player);

                    // 非队友不交牌
                    if (att <= 0) return false;
                    // 手牌紧张时保命，不为了标记交牌
                    if (target.countCards("he") <= 1) return false;
                    if (target.hp <= 1 && target.countCards("he") <= 2) return false;
                    // 有可交的低价值牌才换标记；态度越高可接受的牌价值越高
                    let minVal = Infinity;
                    for (const card of target.getCards("he")) {
                        minVal = Math.min(minVal, get.value(card, target));
                    }
                    if (att >= 2) return minVal < 7;
                    return minVal < 4;
                }).forResult();
            },
            async content(event, trigger, player) {
                const target = trigger.player;
                const result = await target.chooseToGive(player, true, "he")
                    .set("check", card => {
                        return 9 - get.value(card); // 优先给价值低的牌
                    })
                    .forResult();
                if (result.bool) {
                    target.storage.hfhy_huangjin = true;
                    target.markSkill("hfhy_budao");
                }
            },
            sub: true,
            sourceSkill: "hfhy_budao",
            skill_id: "hfhy_budao_phase",
            _priority: 0,
        },
    },
    skill_id: "hfhy_budao",
    _priority: 0,
},
"hfhy_yingtian": {
    audio: ["sbleiji1.mp3","sblieji2.mp3","releiji1.mp3","releiji2.mp3"],
    zhuanhuanji: true,
    mark: true,
    marktext: "☯",
    intro: {
        content(storage, player) {
            if (storage) {
                return `当前为阳：出牌阶段限一次，你可以进行一次判定，若为黑色你选择X名其他角色对其造成一点雷电伤害。若为红色拥有"黄巾"的角色摸一张牌。X为场上"黄巾"的数量。`;
            }
            return `当前为阴：当你受到伤害时，你可以对伤害来源进行一次判定，若为♠你对其造成两点雷电伤害；若为♣你恢复一点体力。`;
        },
    },
    enable: "phaseUse",
    usable: 1,
    filter(event, player) {
        return player.storage.hfhy_yingtian == true;
    },
    async content(event, trigger, player) {
        player.changeZhuanhuanji("hfhy_yingtian");
        player.changeSkin({ characterName: "ming_zhangjiao" },"1_ming_zhangjiao")
        const result = await player.judge().forResult();
        const card = result.card;
        const suit = get.suit(card);
        const color = get.color(card);
        
        if (color === "black") {
            const x = game.countPlayer(current => current.storage.hfhy_huangjin);
            if (x > 0) {
                const targets = game.filterPlayer(target => target != player);
                if (targets.length) {
                    const chooseResult = await player.chooseTarget(
                        `选择至多${x}名其他角色`,
                        [1, Math.min(x, targets.length)],
                        (card2, player2, target) => targets.includes(target)
                    ).set("ai", target => {
                        return get.effect(target, { name: "sha", nature: "thunder" }, player, player);
                    }).forResult();
                    if (chooseResult.bool) {
                        for (const target of chooseResult.targets) {
                            await target.damage("thunder");
                        }
                    }
                }
            }
        } else {
            const huangjinTargets = game.filterPlayer(
                current => current.storage.hfhy_huangjin
            );
            for (const target of huangjinTargets) {
                await target.draw();
            }
        }
    },
    group: ["hfhy_yingtian_init", "hfhy_yingtian_yin"],
    subSkill: {
        init: {
            trigger: { global: "gameStart" },
            filter(event, player) {
                return !player.storage._yingtian_init;
            },
            forced: true,
            async content(event, trigger, player) {
                player.storage._yingtian_init = true;
                const result = await player.chooseBool(
                    `是否将【应天】转换为阴？`
                ).set("ai", () => false).forResult();
                if (result.bool) {
                    player.storage.hfhy_yingtian = false;
                    player.changeSkin({ characterName: "ming_zhangjiao" },"1_ming_zhangjiao")
                    player.markSkill("hfhy_yingtian");
                }
            },
            sub: true,
            sourceSkill: "hfhy_yingtian",
            skill_id: "hfhy_yingtian_init",
            _priority: 0,
        },
        yin: {
            audio:["releiji1.mp3","releiji2.mp3"],
            trigger: { player: "damageEnd" },
            filter(event, player) {
                return (
                    player.storage.hfhy_yingtian != true &&
                    event.source &&
                    event.source != player
                );
            },
            async cost(event, trigger, player) {
                event.result = await player.chooseBool(
                    `是否对${get.translation(trigger.source)}发动【应天】？`
                ).set("ai", () => {
                    // 判定无代价：♠雷伤2点/♣回复1点。敌人打来的必反；队友误伤时只在濒死赌回复
                    if (get.attitude(player, trigger.source) < 0) return true;
                    return player.hp <= 1;
                }).forResult();
            },
            async content(event, trigger, player) {
                player.changeZhuanhuanji("hfhy_yingtian");
                player.changeSkin({ characterName: "ming_zhangjiao" },"ming_zhangjiao")
                const source = trigger.source;
                const result = await player.judge().forResult();
                const card = result.card;
                const suit = get.suit(card);
                
                if (suit === "spade") {
                    await source.damage(2, "thunder");
                } else if (suit === "club") {
                    await player.recover();
                }
            },
            sub: true,
            sourceSkill: "hfhy_yingtian",
            skill_id: "hfhy_yingtian_yin",
            _priority: 0,
        },
    },
    init(player, skill) {
        player.storage[skill] = true;
    },
    ai: {
        order: 6,
        result: {
            player(player) {
                // 阳面（storage为true）：黑判造成X点雷伤，红判黄巾角色各摸一张
                if (player.storage.hfhy_yingtian) {
                    const x = game.countPlayer(cur => cur != player);
                    if (x <= 0) return 0;
                    const enemies = game.filterPlayer(cur => get.attitude(player, cur) < 0);
                    // 场上没有能劈的敌人时不值得翻转
                    if (!enemies.length) return 0;
                    // 一半概率劈人一半黄巾摸牌，敌人越多越值
                    return 1 + Math.min(2, enemies.length);
                }
                // 阴面在 damageEnd 已处理，出牌阶段不再主动用
                return 0;
            },
        },
    },
    skill_id: "hfhy_yingtian",
    _priority: 0,
},
"hfhy_huangtian": {
    audio: ["huangtian1.mp3","huangtian2.mp3","sbhuangtian1.mp3","sbhuangtian2.mp3"],
    zhuSkill: true,
    trigger: { global: "gameStart" },
    forced: true,
    filter(event, player) {
        return player.identity === "zhu";
    },
    async content(event, trigger, player) {
        const targets = game.filterPlayer(current => current.group === "qun");
        for (const target of targets) {
            if (target.storage.hfhy_huangjin) continue;
            target.storage.hfhy_huangjin = true;
            target.markSkill("hfhy_budao");
        }
    },
    group: ["hfhy_huangtian_judge"],
    subSkill: {
        judge: {
    audio: ["huangtian1.mp3","huangtian2.mp3","jun_huanlei"],
            trigger: { global: "judge" },
            filter(event, player) {
                return event.player.storage.hfhy_huangjin;
            },
            async cost(event, trigger, player) {
                const target = trigger.player;
                const { control } = await player.chooseControl(["选项一", "选项二", "cancel2"])
                    .set("choiceList", [
                        "打出一张手牌替换判定牌",
                        "判定牌生效后摸一张牌"
                    ])
                    .set("prompt", `是否对${get.translation(target)}的判定发动【黄天】？`)
                    .set("ai", () => {
                        const evt = _status.event.getTrigger();
                        const target = evt.player;
                        const judging = target.judging && target.judging[0];
                        const expect = judging && evt.judge ? evt.judge(judging) : undefined;
                        const bad = typeof expect == "number" && expect < 0;
                        const good = typeof expect == "number" && expect > 0;
                        if (get.attitude(player, target) > 0) {
                            // 队友判定不利（如乐不思蜀）时打出手牌替换，否则让判定生效后摸牌
                            if (bad && player.countCards("h")) return "选项一";
                            return "选项二";
                        }
                        // 敌人判定有利（如闪电）时打手牌破坏之，否则不发动
                        if (good && player.countCards("h")) return "选项一";
                        return "cancel2";
                    })
                    .forResult();
                event.result = {
                    bool: control !== "cancel2",
                    cost_data: control,
                };
            },
            async content(event, trigger, player) {
                const control = event.cost_data;
                const judgeEvent = trigger;
                if (!judgeEvent) return;
                
                if (control === "选项一") {
                    const judging = judgeEvent.player.judging[0];
                    if (!judging) return;
                    
                    const result = await player.chooseCard(
                        `请选择一张手牌替换${get.translation(judgeEvent.player)}的判定牌`,
                        "h"
                    ).set("ai", card => {
                        const trigger2 = _status.event.getTrigger();
                        const judging2 = trigger2.player.judging[0];
                        if (judging2) {
                            const val = get.value(card);
                            if (get.attitude(player, trigger2.player) > 0) {
                                return 13 - get.number(card) - val/6;
                            } else {
                                return get.number(card) - 13 - val/6;
                            }
                        }
                        return 0;
                    }).forResult();
                    
                    if (result.bool && result.cards.length) {
                        const card = result.cards[0];
                        const next = player.respond(card, "highlight", "noOrdering");
                        await next;
                        const cards2 = next.cards;
                        if (cards2 && cards2.length) {
                            player.$gain2(judging);
                            await player.gain(judging);
                            judgeEvent.player.judging[0] = cards2[0];
                            judgeEvent.orderingCards.addArray(cards2);
                            game.log(judgeEvent.player, "的判定牌改为", cards2[0]);
                            await game.delay(2);
                        }
                    }
                } else if (control === "选项二") {
                    const oldCallback = judgeEvent.callback;
                    // 必须透传参数：judgeCallback事件以(event,trigger,player)调用content，
                    // 零参调用会让其他判定回调（如凿险）拿不到judgeResult而崩溃
                    judgeEvent.callback = async (...args) => {
                        if (oldCallback) await oldCallback(...args);
                        await player.draw();
                    };
                }
            },
            sub: true,
            sourceSkill: "hfhy_huangtian",
            skill_id: "hfhy_huangtian_judge",
            _priority: 0,
        },
    },
    skill_id: "hfhy_huangtian",
    _priority: 0,
},
"hfhy_tianli": {
    audio: ["sbhuangtian1.mp3","sbhuangtian2.mp3"],
    enable: "phaseUse",
    derivation: "hfhy_huangtian",
    limited: true,
    skillAnimation: true,
    animationColor: "soil",
    filterTarget: (card, player, target) => target != player,
    selectTarget: 1,
    ai: {
        order: 9,
        result: {
            player(player) {
                // 限定技：所有黄巾角色弃光手牌，依次视为对目标出杀
                // 只统计己方黄巾（含自己）——黄巾太少时弃牌代价大于收益
                const friendly = game.filterPlayer(cur =>
                    cur.storage.hfhy_huangjin && (cur == player || get.attitude(player, cur) > 0)
                );
                if (friendly.length < 2) return 0;
                return 1 + Math.min(2, friendly.length - 1);
            },
            target(player, target) {
                // 目标是被集火的敌人
                if (get.attitude(player, target) < 0) return -2;
                return 0;
            },
        },
    },
    async content(event, trigger, player) {
        const target = event.targets[0];
        const huangjinPlayers = game.filterPlayer(current => current.storage.hfhy_huangjin);
        player.awakenSkill("hfhy_tianli")
        // 所有拥有"黄巾"的角色弃置所有手牌
        for (const p of huangjinPlayers) {
            const hs = p.getCards("h");
            if (hs.length) await p.discard(hs);
        }
        
        // 给每个黄巾角色添加临时技能，并记录发动者ID
        for (const p of huangjinPlayers) {
            p.addTempSkill("hfhy_tianli_damage_trigger", "phaseAfter");
            p.storage._tianli_owner = player.playerid;
        }
        
        // 黄巾角色依次视为对目标使用一张无视距离和防具的【杀】
        for (const p of huangjinPlayers) {
            if (target.isDead()) break;
            const card = get.autoViewAs({ name: "sha" });
            if (p.canUse(card, target, false)) {
                await p.useCard(card, target, false);
            }
        }
        
        // 发动者若没有"黄天"，则获得之
        if (!player.storage.hfhy_huangtian) {
            await player.addSkills("hfhy_huangtian");
        }
    },
    subSkill: {
        damage_trigger: {
            forced: true,
            locked: false,
            trigger: { source: "damageSource" },
            filter(event, player) {
                // 只对【杀】造成的伤害生效
                return event.card && event.card.name === "sha";
            },
            async content(event, trigger, player) {
                // player 是伤害来源（黄巾角色），拥有该临时技能
                const ownerId = player.storage._tianli_owner;
                const owner = game.findPlayer(p => p.playerid === ownerId);
                
                // 伤害来源摸一张
                await player.draw();
                // 发动者摸一张
                if (owner) {
                    await owner.draw();
                }
                
                // 使用后移除本临时技能（仅触发一次）
                player.removeSkill("hfhy_tianli_damage_trigger");
            },
            sub: true,
            sourceSkill: "hfhy_tianli",
            skill_id: "hfhy_tianli_damage_trigger",
            _priority: 0,
        },
    },
    ai: {
        order: 5,
        result: {
            player: 1,
        },
    },
    skill_id: "hfhy_tianli",
    _priority: 0,
},
"hfhy_jieying": {
    audio: ["drlt_jieying1.mp3","drlt_jieying2.mp3","drlt_poxi1.mp3","drlt_poxi2.mp3"],
    enable: "phaseUse",
    derivation: "hfhy_baiqi",
    usable: 1,
    filterTarget(card, player, target) {
        return target != player && (target.countCards("h") > 0 || target.countCards("e") > 0 || target.countCards("j") > 0);
    },
    async content(event, trigger, player) {
        const { target } = event;
        
        const playerCards = player.getCards("hej");
        const targetCards = target.getCards("hej");
        
        if (!playerCards.length || !targetCards.length) return;
        
        const playerDiscarding = [];
        const targetDiscarding = [];
        
        const dialog = [
            `请选择你与${get.translation(target.name)}同类型的牌`,
            "你的手牌/装备/判定区",
            playerCards,
            `${get.translation(target.name)}的手牌/装备/判定区`,
            targetCards
        ];
        
        const next = player.chooseButton([2, 100], dialog);
        next.set("target", target);
        next.set("filterButton", filterButton);
        next.set("filterOk", filterOk);
        next.set("ai", processAI);
        const result = await next.forResult();
        
        if (!result.bool) return;
        
        const cards2 = result.links;
        for (const card of cards2) {
            if (get.owner(card) === player) {
                playerDiscarding.push(card);
            } else {
                targetDiscarding.push(card);
            }
        }
        
        await discardMultiples([
            [player, playerDiscarding],
            [target, targetDiscarding]
        ]);
        
        const types = new Set(playerDiscarding.map(card => getStandardType(card)));
        const hasBasic = types.has("basic");
        const hasTrick = types.has("trick");
        const hasEquip = types.has("equip");
        
        if (hasBasic) {
            await player.draw();
        }
        
        if (hasTrick) {
            player.addTempSkill("hfhy_jieying_damage", "phaseAfter");
            player.storage._hfhy_jieying_target = target.playerid;
        }
        
        if (hasEquip) {
            player.addTempSkill("hfhy_jieying_distance", "phaseAfter");
            player.storage._hfhy_jieying_target = target.playerid;
        }
        
        if (types.size >= 2) {
            player.addSkills("hfhy_baiqi");
        }
        
        return;
        
        function getStandardType(card) {
            const type = get.type(card, "trick");
            if (type === "equip2") return "equip";
            return type;
        }
        
        function filterOk() {
            const selected = ui.selected.buttons.map(b => b.link);
            const myCards = selected.filter(c => get.owner(c) === player);
            const targetCards2 = selected.filter(c => get.owner(c) === target);
            
            if (selected.length % 2 !== 0) return false;
            if (myCards.length !== targetCards2.length) return false;
            
            const myTypes = {};
            const targetTypes = {};
            for (const c of myCards) {
                const t = getStandardType(c);
                myTypes[t] = (myTypes[t] || 0) + 1;
            }
            for (const c of targetCards2) {
                const t = getStandardType(c);
                targetTypes[t] = (targetTypes[t] || 0) + 1;
            }
            
            const allTypes = new Set([...Object.keys(myTypes), ...Object.keys(targetTypes)]);
            for (const t of allTypes) {
                if ((myTypes[t] || 0) !== (targetTypes[t] || 0)) {
                    return false;
                }
            }
            
            return true;
        }
        
        function filterButton(button) {
            const { player, target } = get.event();
            const card = button.link;
            const owner = get.owner(card);
            const type = getStandardType(card);
            
            if (owner && !lib.filter.canBeDiscarded(card, owner, player)) {
                return false;
            }
            
            const selectedCards = ui.selected.buttons.map(b => b.link);
            const selectedByMe = selectedCards.filter(c => get.owner(c) === player);
            const selectedByTarget = selectedCards.filter(c => get.owner(c) === target);
            
            const myTypeCount = {};
            const targetTypeCount = {};
            for (const c of selectedByMe) {
                const t = getStandardType(c);
                myTypeCount[t] = (myTypeCount[t] || 0) + 1;
            }
            for (const c of selectedByTarget) {
                const t = getStandardType(c);
                targetTypeCount[t] = (targetTypeCount[t] || 0) + 1;
            }
            
            if (owner === player) {
                const currentCount = myTypeCount[type] || 0;
                const targetAvailable = target.getCards("hej").filter(c => 
                    getStandardType(c) === type && 
                    !selectedByTarget.includes(c) &&
                    lib.filter.canBeDiscarded(c, target, player)
                ).length;
                const targetAlready = targetTypeCount[type] || 0;
                
                if (currentCount + 1 > targetAlready + targetAvailable) {
                    return false;
                }
                return true;
            }
            
            if (owner === target) {
                const currentCount = targetTypeCount[type] || 0;
                const myAvailable = player.getCards("hej").filter(c => 
                    getStandardType(c) === type && 
                    !selectedByMe.includes(c) &&
                    lib.filter.canBeDiscarded(c, player, player)
                ).length;
                const myAlready = myTypeCount[type] || 0;
                
                if (currentCount + 1 > myAlready + myAvailable) {
                    return false;
                }
                return true;
            }
            
            return false;
        }
        
        function processAI(button) {
            const { player, target } = get.event();
            const card = button.link;
            const owner = get.owner(card);
            const val = get.value(card) || 1;
            
            if (owner === target) {
                return val;
            }
            return 7 - val;
        }
        
        async function discardMultiples(items) {
            const losingList = items.filter(([_, cards]) => cards.length);
            if (losingList.length > 1) {
                return game.loseAsync({
                    lose_list: losingList,
                    discarder: losingList[0][0]
                }).setContent("discardMultiple");
            } else if (losingList.length === 1) {
                const [loser, cards] = losingList[0];
                return loser.discard(cards);
            }
        }
    },
    subSkill: {
        damage: {
            audio: ["drlt_jieying1.mp3","drlt_jieying2.mp3","drlt_poxi1.mp3","drlt_poxi2.mp3"],
            forced: true,
            locked: false,            
            trigger: { source: "damageBegin1" },
            filter(event, player) {
                return (
                    event.card &&
                    event.card.name === "sha" &&
                    event.player && event.player.playerid === player.storage._hfhy_jieying_target
                );
            },
            async content(event, trigger, player) {
                trigger.num++;
            },
            sub: true,
            sourceSkill: "hfhy_jieying",
            skill_id: "hfhy_jieying_damage",
            _priority: 0,
        },
        distance: {
            mod: {
                targetInRange(card, player, target) {
                    if (target && target.playerid === player.storage._hfhy_jieying_target) {
                        return true;
                    }
                },
            },
            sub: true,
            sourceSkill: "hfhy_jieying",
            skill_id: "hfhy_jieying_distance",
            _priority: 0,
        },
    },
    ai: {
        order: 6,
        result: {
            player(player, target) {
                if (!target || get.attitude(player, target) >= 0) return 0;
                // 拆对面牌的基础骚扰收益
                let val = 1;
                // 对面有装备牌：弃自己装备可得无视距离的奖励
                if (target.countCards("e") > 0) val += 0.5;
                // 自己有杀：弃锦囊后本回合杀加伤，能打出配合
                if (player.countCards("h", { name: "sha" }) > 0) val += 1;
                return val;
            },
            target(player, target) {
                return -1;
            },
        },
    },
    skill_id: "hfhy_jieying",
    _priority: 0,
},
"hfhy_baiqi": {
    audio: ["gnsheque1.mp3","gnsheque2.mp3"],
    enable: "phaseUse",
    usable: 1,
    filter(event, player) {
        return player.countCards("h") > 0;
    },
    async content(event, trigger, player) {
        const result = await player.chooseTarget(
            "请选择【杀】的目标",
            (card, player2, target) => player2.canUse({ name: "sha" }, target)
        ).set("ai", target => {
            return get.effect(target, { name: "sha" }, player, player);
        }).forResult();
        if (!result.bool) return;
        
        const target = result.targets[0];
        const cards = player.getCards("h");
        await player.discard(cards);
        
        player.storage._baiqi_shasha = true;
        await player.useCard({ name: "sha", isCard: true }, target, false);
        
        player.setStorage("_talang_lv2", 1);
        player.markSkill("hfhy_talang");
    },
    group: ["hfhy_baiqi_multi"],
    subSkill: {
            multi: {
                trigger: { player: "useCard2" },
                filter(event, player) {
                    return event.card.name == "sha" && !event.getParent()._baiqi_multi_used;
                },
                async cost(event, trigger, player) {
                    const targets = game.filterPlayer(current => 
                        current != player && !trigger.targets.includes(current) && player.inRange(current)
                    );
                    // 额外检查：劫营将距离视为1的目标
                    const jieyingTarget = player.storage._hfhy_jieying_target;
                    if (jieyingTarget) {
                        const jieyingPlayer = game.findPlayer(p => p.playerid === jieyingTarget);
                        if (jieyingPlayer && jieyingPlayer != player && !trigger.targets.includes(jieyingPlayer) && !targets.includes(jieyingPlayer)) {
                            targets.push(jieyingPlayer);
                        }
                    }
                    if (!targets.length) {
                        event.result = { bool: false };
                        return;
                    }
                    event.result = await player.chooseBool(
                        "是否发动【百骑】？失去1点体力，额外指定任意名攻击范围内的目标"
                    ).set("ai", () => {
                        // 血量安全且额外目标里有敌人，才值得失去1点体力
                        return player.hp > 1 && targets.some(cur => get.attitude(player, cur) < 0);
                    }).forResult();
                },
                async content(event, trigger, player) {
                    await player.loseHp();
                    const targets = game.filterPlayer(current => 
                        current != player && !trigger.targets.includes(current) && player.inRange(current)
                    );
                    // 同样额外检查劫营目标
                    const jieyingTarget = player.storage._hfhy_jieying_target;
                    if (jieyingTarget) {
                        const jieyingPlayer = game.findPlayer(p => p.playerid === jieyingTarget);
                        if (jieyingPlayer && jieyingPlayer != player && !trigger.targets.includes(jieyingPlayer) && !targets.includes(jieyingPlayer)) {
                            targets.push(jieyingPlayer);
                        }
                    }
                    if (targets.length) {
                        const chooseResult = await player.chooseTarget(
                            "选择额外目标",
                            [1, targets.length],
                            (card, player2, target) => targets.includes(target)
                        ).set("ai", target => {
                            return get.effect(target, { name: "sha" }, player, player);
                        }).forResult();
                        if (chooseResult.bool) {
                            trigger.targets.addArray(chooseResult.targets);
                            event.getParent()._baiqi_multi_used = true;
                        }
                    }
                },
                sub: true,
                sourceSkill: "hfhy_baiqi",
                skill_id: "hfhy_baiqi_multi",
                _priority: 0,
            },
    },
    ai: {
        order: 5,
        result: {
            player(player) {
                // 需要有杀得到且视之为敌人的目标，否则弃手牌毫无意义
                const hasEnemy = game.hasPlayer(cur =>
                    cur != player && get.attitude(player, cur) < 0 && player.canUse({ name: "sha" }, cur)
                );
                if (!hasEnemy) return 0;
                const hand = player.getCards("h");
                if (!hand.length) return 0;
                const avg = hand.reduce((sum, c) => sum + get.value(c, player), 0) / hand.length;
                // 未解锁踏浪二阶时有长期收益（进攻距离-1+回合外摸牌）；手牌越多越值钱，代价越高
                let val = 2 + (player.getStorage("_talang_lv2", false) ? 0 : 2);
                val -= avg * Math.min(hand.length, 4) * 0.5;
                return val;
            },
        },
    },
    skill_id: "hfhy_baiqi",
    _priority: 0,
},
"hfhy_talang": {
    audio: ["sbqixi1.mp3","sbqixi2.mp3"],
    locked: true,
    forced: true,
    mod: {
        globalFrom(from, to, distance) {
            if (from.hasSkill("hfhy_talang") && from.getStorage("_talang_lv2", false)) {
                return distance - 1;
            }
        },
        globalTo(from, to, distance) {
            if (to.hasSkill("hfhy_talang")) {
                return distance + 1;
            }
        },
    },
    trigger: { global: "phaseEnd" },
    filter(event, player) {
        if (!player.getStorage("_talang_lv2", false)) return false;
        if (event.player === player) return false;
        return get.distance(player, event.player) === 1;
    },
    async content(event, trigger, player) {
        await player.draw();
    },
    group: ["hfhy_talang_thunder"],
    subSkill: {
        thunder: {
            trigger: { player: "damageBegin3" },
            forced: true,
            filter(event, player) {
                return event.hasNature && event.hasNature("thunder");
            },
            content() {
                trigger.num++;
            },
            sub: true,
            sourceSkill: "hfhy_talang",
            skill_id: "hfhy_talang_thunder",
            _priority: 0,
        },
    },
    ai: {
        threaten: 0.8,
    },
    skill_id: "hfhy_talang",
    _priority: 0,
},
"hfhy_jizhi": {
    audio: ["sbzhiji1.mp3","sbzhiji2.mp3","zhiji1.mp3","zhiji2.mp3"],
    initGroup: "shu",
    derivation: ["hfhy_jiufa", "hfhy_jueji", "hfhy_kunfen"],
    dutySkill: true,
    enable: "phaseUse",
    usable: 1,
    mark: true,
    marktext: "志",
    intro: {
        content(storage, player) {
            return `已获得${storage || 0}个"志"标记，上限9个`;
        },
    },
    init(player, skill) {
        player.storage[skill] = 0;
    },
    async content(event, trigger, player) {
        const topCards = get.cards(5, true);
        player.showCards(topCards);
        const { control } = await player.chooseControl(["选项一", "选项二", "cancel2"])
            .set("choiceList", [
                "获得其中的基本牌，以此法获得的基本牌不计入手牌上限",
                "用任意张手牌与其中等量牌进行交换，然后排序"
            ])
            .set("prompt", "继志：请选择一项")
            .set("ai", () => {
                const me = get.player();
                const topCards = get.event().topCards;
                // 选项一收益：基本牌总价值；每张杀额外加分（使用杀可攒"志"标记）
                const basics = topCards.filter(card => get.type(card, "basic") == "basic");
                const shaCount = basics.filter(card => card.name == "sha").length;
                const gainValue = basics.reduce((sum, card) => sum + get.value(card, me), 0) + shaCount * 0.5;
                // 选项二收益：己方最差手牌与牌堆顶最好牌逐对比较，只累计正差值
                const handValues = me.getCards("h").map(card => get.value(card, me)).sort((a, b) => a - b);
                const topValues = topCards.map(card => get.value(card, me)).sort((a, b) => b - a);
                let swapValue = 0;
                for (let i = 0; i < Math.min(handValues.length, topValues.length); i++) {
                    const diff = topValues[i] - handValues[i];
                    if (diff <= 0) break;
                    swapValue += diff;
                }
                if (swapValue <= 0 && gainValue <= 0) return "cancel2";
                return swapValue > gainValue ? "选项二" : "选项一";
            })
            .set("topCards", topCards)
            .forResult();
        if (control == "cancel2") return;

        if (control == "选项一") {
            const basics = topCards.filter(card => get.type(card, "basic") == "basic");
            const remaining = topCards.filter(card => get.type(card, "basic") != "basic");
            if (basics.length) {
                for (const card of basics) {
                    card.addGaintag("hfhy_jizhi");
                }
                await player.gain(basics, "visible");
            }
            if (remaining.length) {
                await game.cardsGotoPile(remaining.slice().reverse(), ["insert_card", true]);
            }
        } else {
            const swapResult = await player.chooseToMove_new("选择任意张手牌与牌堆顶的牌交换", true)
                .set("list", [
                    ["牌堆顶", topCards],
                    ["你的手牌", player.getCards("h")]
                ])
                .set("filterMove", (from, to, moved) => typeof to != "number")
                .set("processAI", list => {
                    const player = get.player();
                    let cards = list.map(i => i[1]).flat().sort((a, b) => get.value(b, player) - get.value(a, player));
                    return [cards.slice(0, player.countCards("h")), cards.slice(player.countCards("h"))];
                })
                .forResult();
            if (swapResult?.bool) {
                await game.loseAsync({
                    player,
                    cards: swapResult.moved.flat(),
                    moved: swapResult.moved,
                }).setContent(async function (event, trigger, player) {
                    const { cards, moved } = event,
                        hs = player.getCards("h");
                    const gain = moved[1].filter(card => !hs.includes(card)),
                        puts = moved[0].filter(card => hs.includes(card)),
                        originPile = cards.slice().removeArray(hs);
                    if (puts.length) {
                        player.$throw(puts.length, 1000);
                        await player.lose(puts, ui.ordering).set("getlx", false);
                    }
                    await game.cardsGotoOrdering(originPile);
                    if (gain.length) {
                        await player.gain(gain, "draw").set("getlx", false);
                    }
                    await game.cardsGotoPile(moved[0].slice().reverse(), ["insert_card", true]);
                    game.addCardKnower(moved[0], player);
                });
            }
        }

        for (let i = 0; i < 3; i++) {
            if (player.countMark("hfhy_jizhi") < 9) {
                player.addMark("hfhy_jizhi", 1, false);
            }
        }
    },
    group: ["hfhy_jizhi_mark", "hfhy_jizhi_achieve", "hfhy_jizhi_fail", "hfhy_jizhi_nolimit"],
    subSkill: {
        mark: {
            trigger: { player: ["useCard", "respond"], global: "useCardToTargeted" },
            forced: true,
            filter(event, player) {
                if (event.card.name != "sha" || player.countMark("hfhy_jizhi") >= 9) return false;
                // 成为【杀】的目标；自己使用的【杀】已由 useCard 计数，避免多目标重复加标
                if (event.name == "useCardToTargeted") {
                    return event.target == player && event.player != player;
                }
                return true;
            },
            content() {
                player.addMark("hfhy_jizhi", 1, false);
            },
            sub: true,
            sourceSkill: "hfhy_jizhi",
            skill_id: "hfhy_jizhi_mark",
            _priority: 0,
        },
        achieve: {
            audio: ["sbzhiji1.mp3","sbzhiji2.mp3"],
            trigger: { player: "phaseZhunbeiBegin" },
            filter(event, player) {
                return player.countMark("hfhy_jizhi") >= 9;
            },
            forced: true,
            skillAnimation: true,
            animationColor: "fire",
            async content(event, trigger, player) {
                player.awakenSkill("hfhy_jizhi");
                await player.recover();
                player.addSkill("hfhy_jiufa");
            },
            sub: true,
            sourceSkill: "hfhy_jizhi",
            skill_id: "hfhy_jizhi_achieve",
            _priority: 0,
        },
        fail: {
            audio:["zhaxiang_ol_sb_jiangwei1.mp3"],
            trigger: { player: "dying" },
            lastDo: true,
            skillAnimation: true,
            animationColor: "gray",
            async content(event, trigger, player) {
                const markCount = player.countMark("hfhy_jizhi");
                player.changeGroup("wei");
                player.clearMark("hfhy_jizhi");
                if (markCount > 0) {
                    await player.draw(markCount);
                }
                player.awakenSkill("hfhy_jizhi");
                await player.recover();
                await player.addSkills(["hfhy_jueji", "hfhy_kunfen"]);
                player.changeSkin({ characterName: "ming_jiangwei" },"1_ming_jiangwei")
            },
            sub: true,
            sourceSkill: "hfhy_jizhi",
            skill_id: "hfhy_jizhi_fail",
            _priority: 0,
        },
        nolimit: {
            mod: {
                ignoredHandcard(card, player) {
                    if (typeof card.hasGaintag == "function" && card.hasGaintag("hfhy_jizhi")) return true;
                },
                cardDiscardable(card, player, name) {
                    if (name == "phaseDiscard" && typeof card.hasGaintag == "function" && card.hasGaintag("hfhy_jizhi")) return false;
                },
            },
            sub: true,
            sourceSkill: "hfhy_jizhi",
            skill_id: "hfhy_jizhi_nolimit",
            _priority: 0,
        },
    },
    ai: {
        order: 8,
        result: {
            player: 1,
        },
    },
    skill_id: "hfhy_jizhi",
    _priority: 0,
},
"hfhy_jiufa": {
    audio: ["sbbeifa1.mp3","sbbeifa2.mp3","sbbeifa3.mp3","sbbeifa4.mp3","sbbeifa5.mp3"],
    groupSkill: "shu",
    enable: "phaseUse",
    filter(event, player) {
        if (player.group != "shu") return false;
        const card = { name: "sha", nature: "fire", isCard: true };
        return game.hasPlayer(target => player.canUse(card, target, false) && player.inRange(target));
    },
    mark: true,
    marktext: "九伐",
    intro: {
        content(storage, player) {
            return `已获得${storage || 0}个"九伐"标记，达到9个势力变为魏并获得〖绝计〗〖困奋〗`;
        },
    },
    init(player, skill) {
        player.storage[skill] = 0;
    },
    async content(event, trigger, player) {
        const count = player.storage._hfhy_jiufa_count || 0;
        
        if (count > 0) {
            await player.loseHp();
        }
        
        player.addMark("hfhy_jiufa", 1, false);
        player.storage._hfhy_jiufa_count = count + 1;
        
        await player.draw();
        
        const card = { name: "sha", nature: "fire", isCard: true, _jiufa_sha: true };
        const targets = game.filterPlayer(target => player.canUse(card, target, false) && player.inRange(target));
        if (targets.length) {
            const result = await player.chooseTarget(
                "请选择【火杀】的目标",
                (card2, player2, target) => targets.includes(target)
            ).set("ai", target => {
                return get.effect(target, { name: "sha", nature: "fire" }, player, player);
            }).forResult();
            if (result.bool && result.targets.length) {
                await player.useCard(card, result.targets[0], false);
            }
        }
        
        if (player.countMark("hfhy_jiufa") >= 9) {
            player.changeGroup("wei");
            await player.addSkills(["hfhy_jueji", "hfhy_kunfen"]);
            player.changeSkin({ characterName: "ming_jiangwei" },"1_ming_jiangwei")
        }
    },
    group: ["hfhy_jiufa_reset", "hfhy_jiufa_nolimit", "hfhy_jiufa_dying"],
    subSkill: {
        reset: {
            trigger: { player: "phaseAfter" },
            forced: true,
            popup: false,
            silent: true,
            async content(event, trigger, player) {
                delete player.storage._hfhy_jiufa_count;
            },
            sub: true,
            sourceSkill: "hfhy_jiufa",
            skill_id: "hfhy_jiufa_reset",
            _priority: 0,
        },
        nolimit: {
            trigger: { player: "useCard1" },
            forced: true,
            popup: false,
            silent: true,
            filter(event, player) {
                return event.card._jiufa_sha;
            },
            content() {
                trigger.addCount = false;
            },
            sub: true,
            sourceSkill: "hfhy_jiufa",
            skill_id: "hfhy_jiufa_nolimit",
            _priority: 0,
        },
        dying: {
            trigger: { player: "dying" },
            forced: true,
            filter(event, player) {
                return player.countMark("hfhy_jiufa") <= 7;
            },
            async content(event, trigger, player) {
                for (let i = 0; i < 2; i++) {
                    player.addMark("hfhy_jiufa", 1, false);
                }
                await player.recover();
            },
            sub: true,
            sourceSkill: "hfhy_jiufa",
            skill_id: "hfhy_jiufa_dying",
            _priority: 0,
        },
    },
    ai: {
        order: 5,
        result: {
            player(player) {
                const count = player.storage._hfhy_jiufa_count || 0;
                // 本轮已发动过：每次额外失去1点体力，血量不健康或没有值得杀的敌人时停手
                if (count > 0) {
                    if (player.hp <= 2) return 0;
                    const card = { name: "sha", nature: "fire", isCard: true };
                    const hasEnemy = game.hasPlayer(cur =>
                        player.canUse(card, cur, false) &&
                        player.inRange(cur) &&
                        get.effect(cur, card, player, player) > 0
                    );
                    return hasEnemy ? 0.5 : 0;
                }
                // 首次免费：摸一张牌并视为使用【杀】
                return 1;
            },
        },
    },
    skill_id: "hfhy_jiufa",
    _priority: 0,
},
"hfhy_kunfen": {
    audio: ["kunfen1.mp3","kunfen2.mp3"],
    groupSkill: "wei",
    forced: true,
    trigger: { player: "phaseDrawBegin" },
    filter(event, player) {
        return player.group == "wei";
    },
    async content(event, trigger, player) {
        const hasBasic = player.hasCard(card => get.type(card, "basic") == "basic", "h");
        const list = [];
        if (hasBasic) list.push("选项一");
        list.push("选项二");
        
        const { control } = await player.chooseControl(list)
            .set("choiceList", [
                "选择一名其他角色，交给其你的所有基本牌",
                "结束阶段，你失去一点体力并摸两张牌"
            ])
            .set("prompt", get.prompt("hfhy_kunfen"))
            .set("ai", () => {
                const ally = game.findPlayer(cur => cur != player && get.attitude(player, cur) >= 2);
                // 掉血吃不消（血量≤2）且有可靠队友时，把基本牌交给队友保命；否则选延迟掉血摸2
                if (hasBasic && ally && player.hp <= 2) return "选项一";
                return "选项二";
            })
            .forResult();

        if (control == "选项一") {
            const result = await player.chooseTarget(
                get.prompt("hfhy_kunfen"),
                "选择一名其他角色，交给其你的所有基本牌",
                (card, player2, target) => target != player2
            ).set("ai", target => {
                // 优先交给缺基本牌的亲近队友
                let val = get.attitude(player, target);
                if (val > 0 && target.countCards("h", { type: "basic" }) < 2) val += 1;
                return val;
            }).forResult();
            if (result.bool && result.targets.length) {
                const target = result.targets[0];
                const basics = player.getCards("hej").filter(card => get.type(card, "basic") == "basic");
                if (basics.length) {
                    await player.give(basics, target);
                }
            }
        } else {
            player.addTempSkill("hfhy_kunfen_end", "phaseAfter");
        }
    },
    subSkill: {
        end: {
            audio: ["kunfen1.mp3","kunfen2.mp3"],
            trigger: { player: "phaseJieshuBegin" },
            forced: true,
            popup: true,
            async content(event, trigger, player) {
                await player.loseHp();
                await player.draw(2);
            },
            sub: true,
            sourceSkill: "hfhy_kunfen",
            skill_id: "hfhy_kunfen_end",
            _priority: 0,
        },
    },
    skill_id: "hfhy_kunfen",
    _priority: 0,
},
"hfhy_jueji": {
    audio: ["olsbranji1.mp3","olsbranji2.mp3"],
    groupSkill: "wei",
    enable: "phaseUse",
    limited: true,
    filter(event, player) {
        if (player.group !== "wei") return false;
        const validTargets = game.filterPlayer(target => target != player);
        return validTargets.length >= 2;
    },
    ai: {
        order: 8,
        result: {
            player(player) {
                const x = player.maxHp - player.hp;
                if (x < 1) return 0;
                if (player.hp < 2) return 0;
                const enemies = game.filterPlayer(t => t != player && get.attitude(player, t) < 0);
                if (enemies.length < 2) return 0;
                // 三方博弈评估：两目标互相敌对时更可能互相伤害（选项一），自己只掏1血或X张牌，稳赚
                const hostilePair = get.attitude(enemies[0], enemies[1]) < 0;
                if (hostilePair) return 1;
                // 两目标同阵营：他们倾向都弃牌（相同选项自己扣1血，但两敌各弃X张血赚）
                if (enemies.every(t => t.countCards("he") >= x)) return 1;
                return 0.5;
            },
        },
    },
    async content(event, trigger, player) {
        player.awakenSkill("hfhy_jueji")
        const result = await player.chooseTarget(
            get.prompt("hfhy_jueji"),
            "选择两名其他角色，令他们选择造成伤害或弃牌",
            [2, 2],
            (card, player2, target) => target != player2
        ).set("ai", target => {
            // 选敌人：敌对度加权 + 牌多的目标被"弃X张"惩罚更痛
            return -get.attitude(player, target) * 2 + target.countCards("he") * 0.3;
        }).forResult();

        if (!result.bool || !result.targets || !result.targets.length || result.targets.length < 2) return;

        const targets = result.targets;
        const x = player.maxHp - player.hp;

        // 让两名目标各自秘密选择
        for (let i = 0; i < targets.length; i++) {
            const current = targets[i];
            const another = targets[1 - i];
            const { control } = await current.chooseControl(["选项一", "选项二"])
                .set("choiceList", [
                    `对${get.translation(another)}造成1点伤害`,
                    `弃置${x}张牌`
                ])
                .set("prompt", `绝计（${get.translation(player)}发动）：请选择一项`)
                .set("ai", () => {
                    const chooser = get.player();
                    const evt = get.event();
                    const another2 = evt.another;
                    const x2 = evt.x;
                    // 选项一收益：伤害另一目标——敌对收益高，友方代价大
                    const attOther = get.attitude(chooser, another2);
                    let value1 = attOther < 0 ? 4 : (attOther > 0 ? -5 : 0);
                    // 选项二代价：弃x张牌（手牌不足时更亏）
                    const cards = chooser.countCards("he");
                    let value2 = -x2 * 1.8;
                    if (cards < x2) value2 -= 3;
                    return value1 > value2 ? "选项一" : "选项二";
                })
                .set("another", another)
                .set("x", x)
                .forResult();
            current.storage._jueji_choice = control;
        }

        const c1 = targets[0].storage._jueji_choice;
        const c2 = targets[1].storage._jueji_choice;

        // 判断并惩罚发动者
        if (c1 === c2) {
            await player.loseHp();
        } else {
            await player.chooseToDiscard(x, "he", true)
                .set("prompt", `绝计：弃置${x}张牌`)
                .set("ai", card => 5 - get.value(card));
        }

        // 执行目标各自的选择
        for (let i = 0; i < targets.length; i++) {
            const current = targets[i];
            const another = targets[1 - i];
            if (current.storage._jueji_choice === "选项一") {
                await another.damage(current);
            } else {
                if (current.countCards("he") >= x) {
                    await current.chooseToDiscard(x, "he", true)
                        .set("prompt", `绝计：弃置${x}张牌`)
                        .set("ai", card => 5 - get.value(card));
                } else {
                    const cards = current.getCards("he");
                    if (cards.length > 0) await current.discard(cards);
                }
            }
            delete current.storage._jueji_choice;
        }
    },
    skill_id: "hfhy_jueji",
    _priority: 0,
},
"hfhy_gu": {
    // 「顾」标记载体：三顾使命中其他角色获得的燃料标记
    mark: true,
    marktext: "顾",
    intro: {
        content(storage) {
            return `拥有${storage || 0}枚"顾"标记`;
        },
    },
},
"hfhy_zhongwang": {
    audio: ["twjielv1.mp3", "twjielv2.mp3"],
    derivation: ["hfhy_jincui", "hfhy_beifa"],
    forced: true,
    locked: true,
    trigger: { player: "phaseZhunbeiBegin" },
    filter(event, player) {
        if (player.hasSkill("hfhy_jincui")) return false;
        return game.countPlayer(current => current.countMark("hfhy_gu")) <= 0;
    },
    async content(event, trigger, player) {
        if (player.group == "qun" && player.hasSkill("hfhy_sangu")) {
            // 使命线（如诸葛亮首位无人供顾）：直接进入失败线，切换2号皮肤
            player.awakenSkill("hfhy_sangu");
            game.log(player, "的使命失败了");
            player.changeSkin({ characterName: "ming_zhugeliang" }, "2_ming_zhugeliang");
            await player.removeSkill("hfhy_mzgl_bagua");
            await player.addSkills(["hfhy_jincui", "hfhy_beifa"]);
            return;
        }
        // 使命结束后顾被耗尽：失去所有技能（含本技能），获得尽瘁和北伐，切换2号皮肤
        player.changeSkin({ characterName: "ming_zhugeliang" }, "2_ming_zhugeliang");
        const skills = player.getSkills();
        await player.removeSkills(skills);
        await player.addSkills(["hfhy_jincui", "hfhy_beifa"]);
    },
    group: ["hfhy_zhongwang_aura"],
    subSkill: {
        // 拥有「顾」标记的角色的光环：1顾手牌上限+1，2顾摸牌+1，3顾杀次数+1（自动按标记数生效）
        aura: {
            charlotte: true,
            mod: {
                maxHandcard(player, num) {
                    if (player.countMark("hfhy_gu") > 0) return num + 1;
                },
                cardUsable(card, player, num) {
                    if (card.name == "sha" && player.countMark("hfhy_gu") >= 3) return num + 1;
                },
            },
            trigger: { player: "phaseDrawBegin1" },
            forced: true,
            filter(event, player) {
                return player.countMark("hfhy_gu") >= 2 && !event.numFixed;
            },
            content() {
                event.num++;
            },
            sub: true,
            sourceSkill: "hfhy_zhongwang",
            skill_id: "hfhy_zhongwang_aura",
            _priority: 0,
        },
    },
},
"hfhy_sangu": {
    audio: ["friendzhugelianggongli1.mp3","friendzhugelianggongli2.mp3","friendfangqiu1.mp3","friendfangqiu2.mp3","friendfangqiu3.mp3"],
    initGroup: "qun",
    derivation: ["hfhy_tianshi", "hfhy_huoji", "hfhy_jincui", "hfhy_beifa"],
    dutySkill: true,
    unique: true,
    forced: true,
    group: ["hfhy_sangu_give", "hfhy_sangu_success", "hfhy_sangu_fail"],
    subSkill: {
        give: {
            forced: true,
            // 触发阶段静默（popup:false 抑制引擎自动弹窗+播音），角色实际做出选择后才 logSkill 播一次语音
            popup: false,
            trigger: { global: "phaseZhunbeiBegin" },
            filter(event, player) {
                // 使命进行中（仍为群势力）时，每名其他角色的准备阶段触发
                if (player.group != "qun") return false;
                return event.player != player && event.player.isIn();
            },
            logTarget: "player",
            async content(event, trigger, player) {
                const current = trigger.player;
                const { control } = await current.chooseControl(["选项一", "选项二", "cancel2"])
                    .set("choiceList", [
                        `交给${get.translation(player)}一张牌`,
                        "失去1点体力",
                    ])
                    .set("prompt", "三顾：请选择一项，然后你获得一枚「顾」标记")
                    .set("ai", () => {
                        const me = get.player();
                        const att = get.attitude(me, player);
                        // 自身难保：1血且没有安全的牌可交（只能掉血会致命，或仅剩保命牌）
                        const cards = me.getCards("he");
                        const cheapest = cards.length ? Math.min(...cards.map(card => get.value(card))) : 99;
                        const direStrait = me.hp <= 1 && (cards.length == 0 || cheapest > 4.5);
                        if (att > 0) {
                            // 队友：总是给标记（优先交廉价牌，没牌掉血换）
                            if (cards.length > 0) return "选项一";
                            if (me.hp > 1) return "选项二";
                            return "cancel2";
                        }
                        // 对手/未知：酌情——“顾”对自身有光环收益，但绝不能资敌完成使命
                        const totalGu = game.countPlayer(current => current.countMark("hfhy_gu"));
                        // 明确敌对且使命临近完成（场上“顾”已有 2 枚）：坚决不给
                        if (att < 0 && totalGu >= 2) return "cancel2";
                        // 自身难保
                        if (direStrait) return "cancel2";
                        // 敌对且自己的光环已够用（已有 2 枚）时不再资敌
                        if (att < 0 && me.countMark("hfhy_gu") >= 2) return "cancel2";
                        // 有廉价牌就交（换光环收益）
                        if (cards.length > 0 && cheapest <= 3.5) return "选项一";
                        // 血量充裕可以掉血换
                        if (me.hp > 2) return "选项二";
                        // 中立场合理合作
                        if (cards.length > 0) return "选项一";
                        if (me.hp > 1) return "选项二";
                        return "cancel2";
                    })
                    .forResult();
                if (control == "cancel2") return;
                // 做出选择（交牌或失去体力）后播一次三顾语音
                player.logSkill("hfhy_sangu", current);
                if (control == "选项一" && current.countCards("he")) {
                    const result = await current.chooseCard("he", true, `三顾：交给${get.translation(player)}一张牌`)
                        .set("ai", card => -get.value(card))
                        .forResult();
                    if (result.bool) {
                        await current.give(result.cards, player, true);
                    }
                } else {
                    await current.loseHp();
                    await player.recover();
                }
                current.addSkill("hfhy_gu");
                current.addMark("hfhy_gu", 1, false);
                current.markSkill("hfhy_gu");
                // 众望光环：授予顾持有者（效果按标记数自动生效）
                current.addSkill("hfhy_zhongwang_aura");
            },
            sub: true,
            sourceSkill: "hfhy_sangu",
            skill_id: "hfhy_sangu_give",
            _priority: 0,
        },
        success: {
            forced: true,
            trigger: { player: "phaseZhunbeiBegin" },
            filter(event, player) {
                if (player.group != "qun") return false;
                // 场上「顾」标记总数不少于3
                return game.countPlayer(current => current.countMark("hfhy_gu")) >= 3;
            },
            skillAnimation: true,
            animationColor: "fire",
            async content(event, trigger, player) {
                player.awakenSkill("hfhy_sangu");
                game.log(player, "的使命成功了");
                player.changeSkin({ characterName: "ming_zhugeliang" }, "1_ming_zhugeliang");
                await player.changeGroup("shu");
                await player.removeSkill("hfhy_mzgl_bagua");
                await player.addSkills(["hfhy_tianshi", "hfhy_huoji"]);
            },
            sub: true,
            sourceSkill: "hfhy_sangu",
            skill_id: "hfhy_sangu_success",
            _priority: 0,
        },
        fail: {
            forced: true,
            trigger: { global: "dieAfter" },
            filter(event, player) {
                if (player.group != "qun") return false;
                return event.player.countMark("hfhy_gu") > 0;
            },
            skillAnimation: true,
            animationColor: "soil",
            async content(event, trigger, player) {
                player.awakenSkill("hfhy_sangu");
                game.log(player, "的使命失败了");
                player.changeSkin({ characterName: "ming_zhugeliang" }, "2_ming_zhugeliang");
                await player.removeSkill("hfhy_mzgl_bagua");
                await player.addSkills(["hfhy_jincui", "hfhy_beifa"]);
            },
            sub: true,
            sourceSkill: "hfhy_sangu",
            skill_id: "hfhy_sangu_fail",
            _priority: 0,
        },
    },
},
"hfhy_tianshi": {
    audio: ["olsbwujing1.mp3","olsbwujing2.mp3"],
    trigger: { player: "phaseZhunbeiBegin" },
    filter(event, player) {
        return game.countPlayer(current => current.countMark("hfhy_gu") > 0) > 0;
    },
    async cost(event, trigger, player) {
        // 可取消：不选择则不发动
        const result = await player.chooseTarget("天时：是否移去场上的一枚「顾」标记？", (card, player2, target) => target.countMark("hfhy_gu") > 0)
            .set("ai", target => target == player ? 2 : 1)
            .forResult();
        event.result = { bool: result?.bool, cost_data: result?.targets?.[0] };
    },
    async content(event, trigger, player) {
        const holder = event.cost_data;
        if (!holder || holder.countMark("hfhy_gu") <= 0) return;
        holder.removeMark("hfhy_gu", 1, false);
        holder.markSkill("hfhy_gu");
        const x = player.maxHp;
        const topCards = get.cards(x, true);
        await player.viewCards("天时：观看牌堆顶" + get.cnNumber(x) + "张牌", topCards);
        const redCards = topCards.filter(card => get.color(card) == "red");
        const blackCards = topCards.filter(card => get.color(card) == "black");
        const { control } = await player.chooseControl(["选项一", "选项二"])
            .set("choiceList", ["获得其中的红色牌", "获得其中的黑色牌"])
            .set("prompt", "天时：请选择获得的颜色")
            .set("ai", () => {
                const me = get.player();
                const redVal = redCards.reduce((sum, card) => sum + get.value(card, me), 0);
                const blackVal = blackCards.reduce((sum, card) => sum + get.value(card, me), 0);
                return redVal >= blackVal ? "选项一" : "选项二";
            })
            .forResult();
        const gained = control == "选项一" ? redCards : blackCards;
        const remaining = topCards.filter(card => !gained.includes(card));
        if (remaining.length) {
            await game.cardsGotoPile(remaining.slice().reverse(), ["insert_card", true]);
        }
        if (gained.length) {
            await player.gain(gained, "visible");
        }
        // 展示所有手牌，一次性选择1~存活角色数名角色（确定按钮），各交给一张牌
        if (player.countCards("h") > 0) {
            await player.showCards(player.getCards("h"), get.translation(player) + "展示了所有手牌");
            const maxTargets = Math.min(game.countPlayer(), player.countCards("h"));
            const giveRes = await player.chooseTarget(
                "天时：选择任意名角色，交给其各一张手牌",
                [1, maxTargets],
                (card, player2, target) => target.isIn()
            ).set("ai", target => {
                const me = get.player();
                let val = 0;
                // 红牌=受到的火焰伤害+1（负面标记）：优先塞给敌人，配合火计收割
                if (me.hasCard(c => get.color(c) == "red", "h") && get.attitude(me, target) < 0) val += 3;
                // 黑牌=防非雷电伤害（正面标记）：优先给自己或残血队友
                if (me.hasCard(c => get.color(c) == "black", "h") && (target == me || (get.attitude(me, target) > 0 && target.hp <= 2))) val += 2.5;
                return val;
            }).forResult();
            if (giveRes.bool) {
                for (const target of giveRes.targets) {
                    if (!target.isIn() || !player.countCards("h")) break;
                    const giveResult = await player.chooseCard("h", true, `天时：交给${get.translation(target)}一张牌`)
                        .set("ai", card => {
                            const me = get.player();
                            let base = -get.value(card);
                            // 红牌塞给敌人（火伤加深），黑牌给己方（伤害防护）
                            if (get.color(card) == "red" && get.attitude(me, target) < 0) base += 1.5;
                            if (get.color(card) == "black" && (target == me || get.attitude(me, target) > 0)) base += 1.5;
                            return base;
                        })
                        .forResult();
                    if (giveResult.bool && giveResult.cards.length) {
                        const card = giveResult.cards[0];
                        await player.give(card, target, true);
                        const buff = get.color(card) == "red" ? "hfhy_tianshi_red" : "hfhy_tianshi_black";
                        target.addTempSkill(buff, "phaseAfter");
                        target.markSkill(buff);
                    }
                }
            }
        }
    },
    subSkill: {
        red: {
            charlotte: true,
            mark: true,
            marktext: "炎",
            intro: { content: "本回合受到的火焰伤害+1" },
            forced: true,
            trigger: { player: "damageBegin1" },
            filter(event) {
                return event.nature == "fire";
            },
            content() {
                trigger.num++;
            },
            onremove: true,
            sub: true,
            sourceSkill: "hfhy_tianshi",
            skill_id: "hfhy_tianshi_red",
            _priority: 0,
        },
        black: {
            charlotte: true,
            mark: true,
            marktext: "蔽",
            intro: { content: "本回合受到非雷电伤害时防止此伤害" },
            forced: true,
            trigger: { player: "damageBegin3" },
            filter(event) {
                return event.nature != "thunder";
            },
            async content(event, trigger, player) {
                trigger.cancel();
            },
            onremove: true,
            sub: true,
            sourceSkill: "hfhy_tianshi",
            skill_id: "hfhy_tianshi_black",
            _priority: 0,
        },
    },
},
"hfhy_huoji": {
    audio: ["sbhuoji1.mp3","sbhuoji2.mp3","sbhuoji3.mp3"],
    enable: "phaseUse",
    usable: 1,
    filter(event, player) {
        return game.countPlayer(current => current.countMark("hfhy_gu") > 0) > 0;
    },
    filterTarget(card, player, target) {
        return target != player;
    },
    selectTarget: 1,
    async content(event, trigger, player) {
        const target = event.targets[0];
        // 移去一枚顾标记：优先从目标身上移
        const holder = target.countMark("hfhy_gu") > 0 ? target :
            game.filterPlayer(current => current.countMark("hfhy_gu") > 0)[0];
        if (holder) {
            holder.removeMark("hfhy_gu", 1, false);
            holder.markSkill("hfhy_gu");
        }
        // 对目标及其同势力的其他角色（不含自己）各造成1点火焰伤害
        const victims = game.filterPlayer(current => {
            return current.isIn() && (current == target || (current != player && current.group == target.group));
        });
        player.line(victims, "fire");
        for (const current of victims) {
            if (current.isIn()) {
                // 对象式传参（官方谋诸葛亮火计同款），属性/来源明确无歧义
                await current.damage({ source: player, num: 1, nature: "fire" });
            }
        }
    },
    ai: {
        order: 7,
        fireAttack: true,
        result: {
            target(player, target) {
                // 官方谋诸葛亮火计同款：按目标阵营的火焰伤害总收益定正负
                const att = get.attitude(player, target);
                return get.sgn(att) * game.filterPlayer(current => current != player && current.group == target.group)
                    .reduce((num, current) => num + get.damageEffect(current, player, player, "fire"), 0);
            },
        },
    },
},
"hfhy_jincui": {
    audio: ["dcjincui1.mp3","dcjincui2.mp3"],
    forced: true,
    locked: true,
    group: ["hfhy_jincui_cost", "hfhy_jincui_dying"],
    subSkill: {
        cost: {
            forced: true,
            trigger: { player: "phaseZhunbeiBegin" },
            filter(event, player) {
                return true;
            },
            async content(event, trigger, player) {
                await player.loseHp();
                await player.draw(2);
            },
            sub: true,
            sourceSkill: "hfhy_jincui",
            skill_id: "hfhy_jincui_cost",
            _priority: 0,
        },
        dying: {
            forced: true,
            trigger: { player: "dying" },
            async content(event, trigger, player) {
                await player.loseMaxHp();
            },
            sub: true,
            sourceSkill: "hfhy_jincui",
            skill_id: "hfhy_jincui_dying",
            _priority: 0,
        },
    },
},
"hfhy_beifa": {
    audio: ["olsbzhijue1.mp3","olsbzhijue2.mp3","olsbzhijue3.mp3","olsbzhijue4.mp3","olsbzhijue5.mp3"],
    enable: "phaseUse",
    usable: 1,
    filter(event, player) {
        return true;
    },
    async content(event, trigger, player) {
        const x = player.maxHp;
        const topCards = get.cards(x, true);
        await player.viewCards("北伐：观看牌堆顶" + get.cnNumber(x) + "张牌", topCards);
        const trickCards = topCards.filter(card => get.type(card, "trick") == "trick");
        const basicCards = topCards.filter(card => get.type(card, "basic") == "basic");
        const canBeishui = player.maxHp > 1;
        const list = ["选项一", "选项二"];
        if (canBeishui) list.push("背水！");
        const { control } = await player.chooseControl(list)
            .set("choiceList", [
                "获得其中的锦囊牌",
                "获得其中的基本牌",
                "背水！减少1点体力上限并执行所有选项",
            ])
            .set("prompt", "北伐：请选择一项")
            .set("ai", () => {
                const me = get.player();
                const trickVal = trickCards.reduce((sum, card) => sum + get.value(card, me), 0);
                const basicVal = basicCards.reduce((sum, card) => sum + get.value(card, me), 0);
                // 背水=两类全拿+结束阶段额外回合，只花1上限；上限健康时果断背水
                if (canBeishui && me.maxHp > 2 && (trickCards.length || basicCards.length)) return "背水！";
                return trickVal >= basicVal ? "选项一" : "选项二";
            })
            .forResult();
        if (control == "cancel2") return;
        const isBeishui = control == "背水！";
        const gained = [];
        if (control == "选项一" || isBeishui) gained.addArray(trickCards);
        if (control == "选项二" || isBeishui) gained.addArray(basicCards);
        const remaining = topCards.filter(card => !gained.includes(card));
        if (remaining.length) {
            await game.cardsGotoPile(remaining.slice().reverse(), ["insert_card", true]);
        }
        if (gained.length) {
            for (const card of gained) {
                card.addGaintag("hfhy_beifa");
            }
            await player.gain(gained, "visible");
        }
        if (isBeishui) {
            await player.loseMaxHp();
        }
        player.storage.hfhy_beifa_used = true;
    },
    // 因北伐获得的牌（gaintag标记）无距离和次数限制
    // 注意：使用时真牌会被 autoViewAs 包成 VCard 且不拷贝 gaintag，必须同时检查底层牌（官方 oldangxian 同款）
    mod: {
        targetInRange(card) {
            const hasTag = (c, tag) => c && typeof c.hasGaintag == "function" && c.hasGaintag(tag);
            if (hasTag(card, "hfhy_beifa")) return true;
            if (card.cards && card.cards.some(c => hasTag(c, "hfhy_beifa"))) return true;
        },
        cardUsable(card) {
            const hasTag = (c, tag) => c && typeof c.hasGaintag == "function" && c.hasGaintag(tag);
            if (hasTag(card, "hfhy_beifa")) return Infinity;
            if (card.cards && card.cards.some(c => hasTag(c, "hfhy_beifa"))) return Infinity;
        },
    },
    group: ["hfhy_beifa_end"],
    subSkill: {
        end: {
            forced: true,
            trigger: { player: "phaseJieshuBegin" },
            filter(event, player) {
                return player.storage.hfhy_beifa_used;
            },
            async content(event, trigger, player) {
                player.storage.hfhy_beifa_used = false;
                await player.loseMaxHp();
                player.insertPhase("hfhy_beifa");
            },
            sub: true,
            sourceSkill: "hfhy_beifa",
            skill_id: "hfhy_beifa_end",
            _priority: 0,
        },
    },
},
"hfhy_tieji": {
    audio: ["sbtieji1.mp3","sbtieji2.mp3","retieji1.mp3","retieji2.mp3"],
    trigger: { player: "useCardToPlayered" },
    filter(event, player) {
        return event.card.name == "sha";
    },
    logTarget: "target",
    async cost(event, trigger, player) {
        event.result = await player.chooseBool(get.prompt("hfhy_tieji", trigger.target)).set("ai", () => {
            return get.attitude(player, trigger.target) <= 0;
        }).forResult();
    },
    async content(event, trigger, player) {
        const target = trigger.target;

        if (!target.hasSkill("hfhy_tieji_blocker")) {
            target.addTempSkill("hfhy_tieji_blocker", "phaseAfter");
        }
        
        const canBeishui = player.maxHp > 1;
        const list = [];
        list.push("选项一");
        list.push("选项二");
        if (canBeishui) list.push("背水！");
        list.push("cancel2");

        const { control } = await player.chooseControl(list)
            .set("choiceList", [
                `获得${get.translation(target)}一张手牌`,
                `令${get.translation(target)}不能使用或打出与此杀颜色相同的牌`,
                "背水！减少1点体力上限，然后你此阶段使用【杀】的次数+1"
            ])
            .set("prompt", "铁骑：请选择一项")
            .set("ai", () => {
                // 收益决策：红杀+选项二让对方打不出红闪近乎必中；背水留给斩杀线
                if (get.attitude(player, target) >= 0) return "cancel2";
                const color = get.color(trigger.card);
                // 斩杀线：目标濒死且上限健康时背水一波（锁定响应+杀次数+1）
                if (canBeishui && player.maxHp > 2 && target.hp <= 2) return "背水！";
                // 红色杀：选项二封锁红色闪（闪全是方片），目标有手牌时近乎必中
                if (color == "red" && target.countCards("h") > 0) return "选项二";
                // 黑杀：直接抽对方一张手牌（可能抽走闪），比盲锁颜色实在
                if (target.countCards("h") > 0) return "选项一";
                return "选项二";
            })
            .forResult();
        
        if (control === "cancel2") return;
        
        const isBeishui = control === "背水！";
        
        if (control === "选项一" || isBeishui) {
            if (target.countGainableCards(player, "h") > 0) {
                await player.gainPlayerCard(target, true, "h");
            }
        }
        
        if (control === "选项二" || isBeishui) {
            const color = get.color(trigger.card);
            if (!target.storage._tieji_block_colors) target.storage._tieji_block_colors = [];
            if (!target.storage._tieji_block_colors.includes(color)) {
                target.storage._tieji_block_colors.push(color);
            }
            target.addTempSkill("hfhy_tieji_block", "phaseAfter");
            target.markSkill("hfhy_tieji_block");
        }
        
        if (isBeishui) {
            await player.loseMaxHp();
            player.addTempSkill("hfhy_tieji_sha_buff", "phaseUseAfter");
            player.addMark("hfhy_tieji_sha_buff", 1, false);
        }
    },
    subSkill: {
        block: {
            audio: ["sbtieji1.mp3","sbtieji2.mp3","retieji1.mp3","retieji2.mp3"],
            forced: true,
            mark: true,
            sourceSkill: "hfhy_tieji",
            mod: {
                cardEnabled2(card, player) {
                    const colors = player.storage._tieji_block_colors || [];
                    if (colors.includes(get.color(card)) && get.position(card) === "h") {
                        return false;
                    }
                },
            },
            intro: {
                content(storage, player) {
                    const colors = player.storage._tieji_block_colors || [];
                    if (colors.length === 2) return "不能使用或打出红色和黑色的手牌";
                    if (colors.includes("red")) return "不能使用或打出红色的手牌";
                    if (colors.includes("black")) return "不能使用或打出黑色的手牌";
                    return "";
                },
            },
            onremove(player) {
                delete player.storage._tieji_block_colors;
            },
            sub: true,
            skill_id: "hfhy_tieji_block",
            _priority: 0,
        },
        sha_buff: {
            audio: ["sbtieji1.mp3","sbtieji2.mp3","retieji1.mp3","retieji2.mp3"],
            onremove: true,
            mod: {
                cardUsable(card, player, num) {
                    if (card.name == "sha") {
                        return num + player.countMark("hfhy_tieji_sha_buff");
                    }
                },
            },
            sub: true,
            sourceSkill: "hfhy_tieji",
            skill_id: "hfhy_tieji_sha_buff",
            _priority: 0,
        },
    },
    ai: {
        directHit_ai: true,
        skillTagFilter(player, tag, arg) {
            if (tag === "directHit_ai") {
                return arg?.target && get.attitude(player, arg.target) <= 0;
            }
            if (!arg || !arg.card || arg.card.name != "sha") return false;
            if (!arg.target || get.attitude(player, arg.target) >= 0) return false;
            return true;
        },
    },
    skill_id: "hfhy_tieji",
    _priority: 0,
},
"hfhy_mashu": {
    audio: ["sbtieji1.mp3","sbtieji2.mp3","retieji1.mp3","retieji2.mp3"],
    round:1,
    locked: true,
    mod: {
        globalFrom(from, to, distance) {
            const sameGroupCount = game.countPlayer(current => current.group === from.group);
            const x = Math.floor(sameGroupCount / 2);
            return distance - x;
        },
    },
    trigger: { source: "damageBegin1" },
    filter(event, player) {
        return (
            event.player &&
            get.distance(player, event.player) === 1
        );
    },
    forced: true,
    async content(event, trigger, player) {
        await player.loseHp();
        trigger.num++;
    },
    ai: {
        threaten: 1.2,
    },
    skill_id: "hfhy_mashu",
    _priority: 0,
},
"hfhy_qiangzhu": {
    audio: ["dczhongtao1.mp3","dczhongtao2.mp3"],
    groupSkill: "qun",
    enable: "phaseUse",
    usable: 1,
    filter(event, player) {
        if (player.group != "qun") return false;
        return game.hasPlayer(current => current != player && current.group === "qun");
    },
    filterTarget(card, player, target) {
        return target != player && target.group === "qun";
    },
    selectTarget: 1,
    async content(event, trigger, player) {
        const target = event.targets[0];
        // 没有手牌：直接增加1点体力上限，不再询问
        if (!target.countCards("h")) {
            game.log(target, "没有手牌，", player, "增加1点体力上限");
            await player.gainMaxHp();
            return;
        }
        // 非强制chooseCard：目标自主决定是否交牌（AI在最佳分值≤0时拒绝）
        const result = await target.chooseCard(
            "h",
            `羌助：是否将一张手牌交给${get.translation(player)}？若不交，其增加1点体力上限`
        ).set("ai", card => {
            if (get.attitude(target, player) < 0) return -1;
            return 9 - get.value(card);
        }).forResult();
        if (result.bool && result.cards?.length) {
            const cardName = result.cards[0].name;
            await target.give(result.cards, player, true);
            player.storage.hfhy_qiangzhu_buff = cardName;
            player.addTempSkill("hfhy_qiangzhu_buff", "phaseUseAfter");
        } else {
            game.log(target, "拒绝将牌交给", player);
            await player.gainMaxHp();
        }
    },
    subSkill: {
        buff: {
            mark: true,
            marktext: "羌",
            intro: {
                content(storage) {
                    if (storage) return `本阶段使用【${get.translation(storage)}】无次数限制`;
                    return "本阶段使用某张同名牌无次数限制";
                },
            },
            onremove(player, skill) {
                delete player.storage[skill];
            },
            mod: {
                cardUsable(card, player, num) {
                    if (card.name === player.storage.hfhy_qiangzhu_buff) {
                        return Infinity;
                    }
                },
            },
            sub: true,
            sourceSkill: "hfhy_qiangzhu",
            skill_id: "hfhy_qiangzhu_buff",
            _priority: 0,
        },
    },
    ai: {
        order: 5,
        result: {
            player: 1,
            target(player, target) {
                // 友方群势力会交出低价值牌（拿牌+同名牌无限用收益最大）；敌对会拒绝，保底+1体力上限
                return get.attitude(player, target) > 0 ? 1.5 : 0.5;
            },
        },
    },
    skill_id: "hfhy_qiangzhu",
    _priority: 0,
},
"hfhy_xuechou": {
    audio: ["zhuiji1.mp3","zhuiji2.mp3","ol_shichou1.mp3","ol_shichou2.mp3"],
    groupSkill: "shu",
    trigger: { player: "phaseZhunbeiBegin" },
    filter(event, player) {
        return player.group == "shu" && player.countCards("h") > 0;
    },
    mark: true,
    marktext: "仇",
    intro: {
        content(storage, player) {
            return `已获得${storage || 0}个"仇"标记`;
        },
    },
    init(player, skill) {
        player.storage[skill] = 0;
    },
    async cost(event, trigger, player) {
        const result = await player.chooseToDiscard("h", get.prompt2("hfhy_xuechou"))
            .set("ai", card => 5 - get.value(card))
            .forResult();
        event.result = { bool: result?.bool };
    },
    async content(event, trigger, player) {
        const result = await player.chooseTarget("令一名角色获得一个“仇”标记", true)
            .set("ai", target => {
                return get.attitude(player, target) < 0 ? 5 : 1;
            })
            .forResult();
        if (!result.bool) return;

        const target = result.targets[0];
        target.addMark("hfhy_xuechou", 1, false);
        target.markSkill("hfhy_xuechou");
    },
    group: ["hfhy_xuechou_damage"],
    subSkill: {
        damage: {
            audio: ["zhuiji1.mp3","zhuiji2.mp3","ol_shichou1.mp3","ol_shichou2.mp3"],
            forced: true,
            trigger: { global: "damageBegin1" },
            filter(event, player) {
                return (
                    player.group == "shu" &&
                    event.player &&
                    event.player.countMark("hfhy_xuechou") > 0
                );
            },
            logTarget: "player",
            async content(event, trigger, player) {
                const target = trigger.player;
                target.removeMark("hfhy_xuechou", 1, false);
                target.markSkill("hfhy_xuechou");
                await player.gainMaxHp();
            },
            sub: true,
            sourceSkill: "hfhy_xuechou",
            skill_id: "hfhy_xuechou_damage",
            _priority: 0,
        },
    },
    skill_id: "hfhy_xuechou",
    _priority: 0,
},
"hfhy_muxiong": {
    audio: ["sbliegong1.mp3","sbliegong2.mp3","xinliegong1.mp3","xinliegong2.mp3"],
    trigger: { player: "phaseZhunbeiBegin" },
    forced: true,
    mod: {
        attackRange(player, distance) {
            return Math.max(1, Math.floor(player.maxHp / 2));
        },
    },
    async content(event, trigger, player) {
        if (player.phaseNumber < 3) {
            await player.gainMaxHp();
        } else {
            await player.loseMaxHp();
        }
    },
    group: ["hfhy_muxiong_sha", "hfhy_muxiong_damage"],
    subSkill: {
        sha: {
            audio: ["sbliegong1.mp3","sbliegong2.mp3","xinliegong1.mp3","xinliegong2.mp3"],
            trigger: { player: "useCardToPlayered" },
            filter(event, player) {
                return event.card.name == "sha";
            },
            forced: true,
            logTarget: "target",
            async content(event, trigger, player) {
                const target = trigger.target;
                const x = Math.max(1, Math.floor(player.maxHp / 2));
                const targetRange = target.getAttackRange ? target.getAttackRange() : 1;

                if (targetRange < x) {
                    trigger.getParent().directHit.push(target);
                }
            },
            sub: true,
            sourceSkill: "hfhy_muxiong",
            skill_id: "hfhy_muxiong_sha",
            _priority: 0,
        },
        damage: {
            audio: ["sbliegong1.mp3","sbliegong2.mp3","xinliegong1.mp3","xinliegong2.mp3"],
            trigger: { source: "damageBegin1" },
            filter(event, player) {
                return event.card && event.card.name == "sha";
            },
            forced: true,
            async content(event, trigger, player) {
                const target = trigger.player;
                const x = Math.max(1, Math.floor(player.maxHp / 2));
                
                if (target.hp >= x) {
                    trigger.num += x;

                    if (target.hp - trigger.num <= 0) {
                        player.storage._muxiong_dying = target.playerid;
                        player.addTempSkill("hfhy_muxiong_dying", "phaseAfter");
                        player.addTempSkill("hfhy_muxiong_block", "phaseUseAfter");
                    }
                }
            },
            sub: true,
            sourceSkill: "hfhy_muxiong",
            skill_id: "hfhy_muxiong_damage",
            _priority: 0,
        },
        dying: {
            audio: ["sbliegong1.mp3","sbliegong2.mp3","xinliegong1.mp3","xinliegong2.mp3"],
            trigger: { global: "dying" },
            filter(event, player) {
                return event.player && event.player.playerid === player.storage._muxiong_dying;
            },
            forced: true,
            async content(event, trigger, player) {
                delete player.storage._muxiong_dying;
                await player.loseMaxHp();
                player.removeSkill("hfhy_muxiong_dying");
            },
            sub: true,
            sourceSkill: "hfhy_muxiong",
            skill_id: "hfhy_muxiong_dying",
            _priority: 0,
        },
        block: {
            mod: {
                playerEnabled(card, player, target) {
                    if (player != target) return false;
                },
            },
            sub: true,
            sourceSkill: "hfhy_muxiong",
            skill_id: "hfhy_muxiong_block",
            _priority: 0,
        },
    },
    skill_id: "hfhy_muxiong",
    _priority: 0,
},
"hfhy_dingjun": {
    audio: ["spyishi2.mp3","spshidi1.mp3"],
    forced: true,
    locked: true,
    trigger: { global: "gameStart" },
    filter(event, player) {
        return !player.storage._dingjun_init;
    },
    async content(event, trigger, player) {
        player.storage._dingjun_init = true;
        player.disableEquip("equip1");
    },
    group: ["hfhy_dingjun_recast", "hfhy_dingjun_kill"],
    subSkill: {
        recast: {
            audio: ["spyishi2.mp3","spshidi1.mp3"],
            enable: "phaseUse",
            position: "he",
            filter(event, player) {
                return player.hasCard(card => get.subtype(card) === "equip1" && player.canRecast(card), "he");
            },
            filterCard(card, player) {
                return get.subtype(card) === "equip1" && player.canRecast(card);
            },
            check(card) {
                if (get.position(card) == "e") {
                    return 0.5 - get.value(card, get.player());
                }
                return 3 - get.value(card);
            },
            async content(event, trigger, player) {
                await player.recast(event.cards);
            },
            discard: false,
            lose: false,
            delay: false,
            prompt: "重铸一张武器牌",
            ai: {
                order: 10,
                result: {
                    player: 1,
                },
            },
            sub: true,
            sourceSkill: "hfhy_dingjun",
            skill_id: "hfhy_dingjun_recast",
            _priority: 0,
        },
        kill: {
            audio: ["sbliegong1.mp3","liegong1.mp3","liegong2.mp3"],
            trigger: { source: "dieAfter" },
            forced: true,
            filter(event, player) {
                return event.player && event.player != player;
            },
            async content(event, trigger, player) {
            player.insertPhase("event.name");
            },
            sub: true,
            sourceSkill: "hfhy_dingjun",
            skill_id: "hfhy_dingjun_kill",
            _priority: 0,
        },
    },
    skill_id: "hfhy_dingjun",
    _priority: 0,
},
"hfhy_jicai": {
    audio: ["olmojin1.mp3","olmojin2.mp3"],
    trigger: {
        global: "phaseBefore",
        player: "enterGame",
    },
    forced: true,
    locked: false,
    filter(event, player) {
        return event.name != "phase" || game.phaseNumber == 0;
    },
    async content(event, trigger, player) {
        const cards = get.cards(13);
        const getCai = player.addToExpansion(cards, "draw");
        getCai.gaintag.add("hfhy_jicai");
        await getCai;
    },
    mark: true,
    marktext: "财",
    intro: {
        markcount: "expansion",
        mark(dialog, content, player) {
            var cards = player.getExpansions("hfhy_jicai");
            if (cards && cards.length) {
                if (player == game.me || player.isUnderControl()) {
                    dialog.addAuto(cards);
                } else {
                    return "共有" + get.cnNumber(cards.length) + "张财";
                }
            }
        },
        content(storage, player) {
            var cards = player.getExpansions("hfhy_jicai");
            if (cards && cards.length) {
                if (player == game.me || player.isUnderControl()) {
                    return get.translation(cards);
                }
                return "共有" + get.cnNumber(cards.length) + "张财";
            }
        },
    },
    group: ["hfhy_jicai_draw"],
    subSkill: {
            draw: {
                audio: ["olmojin1.mp3","olmojin2.mp3"],
                trigger: { player: "phaseDrawBegin" },
                filter(event, player) {
                    return player.getExpansions("hfhy_jicai").length > 0;
                },
                async cost(event, trigger, player) {
                    const expansions = player.getExpansions("hfhy_jicai");
                    const handCards = player.getCards("h");
                    if (!expansions.length) {
                        event.result = { bool: false };
                        return;
                    }
                    const next = player.chooseToMove("积财：将任意张“财”置于手牌区", true);
                    next.set("list", [
                        ["武将牌上的“财”", expansions],
                        ["手牌区", handCards],
                    ]);
                    next.set("selectCard", [0, expansions.length, 0, handCards.length]);
                    next.set("processAI", list => {
                        const player = get.player();
                        const cards = list[0][1].concat(list[1][1]).sort((a, b) => get.value(a, player) - get.value(b, player));
                        const expandCount = player.getExpansions("hfhy_jicai").length;
                        return [cards.slice(0, expandCount), cards.slice(expandCount)];
                    });
                    const result = await next.forResult();
                    event.result = { bool: result.bool, cost_data: result.moved };
                },
                async content(event, trigger, player) {
                    const moved = event.cost_data;
                    if (!moved) return;
                    
                    const expansions = player.getExpansions("hfhy_jicai");
                    const handCards = player.getCards("h");
                    
                    const pushs = moved[0].filter(c => !expansions.includes(c));
                    const gains = moved[1].filter(c => !handCards.includes(c));
                    
                    if (pushs.length) {
                        const addCai = player.addToExpansion(pushs, player, "giveAuto");
                        addCai.gaintag.add("hfhy_jicai");
                        await addCai;
                    }
                    if (gains.length) {
                        await player.gain(gains, "draw");
                    }
                },
                sub: true,
                sourceSkill: "hfhy_jicai",
                skill_id: "hfhy_jicai_draw",
                _priority: 0,
            },
    },
    onremove(player, skill) {
        const cards = player.getExpansions("hfhy_jicai");
        if (cards.length) {
            player.loseToDiscardpile(cards);
        }
    },
    skill_id: "hfhy_jicai",
    _priority: 0,
},
"hfhy_tongshang": {
    audio: ["yuanhu2.mp3","yuanhu3.mp3"],
    enable: "phaseUse",
    filter(event, player) {
        return player.getExpansions("hfhy_jicai").some(c => c.hasGaintag("hfhy_jicai"));
    },
    async content(event, trigger, player) {
        const expansions = player.getExpansions("hfhy_jicai").filter(c => c.hasGaintag("hfhy_jicai"));
        if (!expansions.length) return;

        // 期望换取的类型：1基本/2锦囊/3装备，按当前需求决定
        let want = 2;
        if (player.countCards("h", { type: "basic" }) < 2) want = 1;
        else if (player.getCards("e").length == 0) want = 3;
        want = Math.min(want, expansions.length);

        const result = await player.chooseButton(
            [expansions, "请选择至多三张“财”"]
        )
        .set("filterButton", button => button.link.hasGaintag("hfhy_jicai"))
        .set("selectButton", [1, Math.min(3, expansions.length)])
        .set("ai", () => {
            // “财”之间无差别，按已选数量停在期望张数（贪心选到分为负即止）
            return ui.selected.buttons.length < want ? 1 : -1;
        })
        .forResult();

        if (!result.bool || !result.links || !result.links.length) return;

        const chosen = result.links;
        const count = chosen.length;

        for (const card of chosen) {
            player.loseToDiscardpile(card);
        }

        const typeMap = { 1: "basic", 2: "trick", 3: "equip" };
        const targetType = typeMap[count];

        if (targetType) {
            const card = get.cardPile2(function (card) {
                return get.type(card, "trick") == targetType;
            });
            if (card) {
                await game.cardsGotoOrdering(card);
                await player.gain(card, "draw");
            }
        }
    },
    ai: {
        order: 5,
        result: {
            player: 1,
        },
    },
    skill_id: "hfhy_tongshang",
    _priority: 0,
},
"hfhy_jikun": {
    audio: ["yuanhu1.mp3","twjuezhu1.mp3"],
    enable: "phaseUse",
    usable: 1,
    filter(event, player) {
        return player.countCards("he") > 0;
    },
    filterTarget(card, player, target) {
        return target != player;
    },
    selectTarget: 1,
    async content(event, trigger, player) {
        const target = event.targets[0];
        const result = await player.chooseCard(
            true,
            "he",
            `济困：交给${get.translation(target)}一张牌`
        ).set("ai", function (card) {
            if (get.position(card) == "e") return -1;
            // 优先交低价值装备牌（触发目标回血并自动装备）
            if (get.type(card) == "equip") return 8 - get.value(card);
            // 没有装备牌时交价值最低的牌
            return -get.value(card);
        }).forResult();

        if (!result.bool || !result.cards || !result.cards.length) return;

        const card = result.cards[0];
        await player.give(result.cards, target, "give");

        if (get.type(card) == "equip" && target.getCards("h").includes(card)) {
            await target.recover();
            await target.chooseUseTarget(card);
        }
    },
    ai: {
        order: 4,
        result: {
            player(player, target) {
                // 只对队友发动：交牌是纯资助
                if (get.attitude(player, target) <= 0) return 0;
                // 队友受伤且手上有装备牌：交装备触发回血，收益最高
                if (target.isDamaged() && player.hasCard(card => get.type(card) == "equip", "h")) return 2;
                // 普通资助：交一张低价值牌
                return 0.5;
            },
            target(player, target) {
                const att = get.attitude(player, target);
                if (att <= 0) return -1;
                let val = 1;
                // 受伤队友优先（装备牌可触发回血）
                if (target.isDamaged() && player.hasCard(card => get.type(card) == "equip", "h")) val += 1;
                // 缺牌队友更需要资助
                if (target.countCards("h") <= 2) val += 0.5;
                return val;
            },
        },
    },
    skill_id: "hfhy_jikun",
    _priority: 0,
},
"hfhy_qiaosi": {
    audio: ["rejizhi1.mp3","rejizhi2.mp3","reqicai1.mp3","reqicai2.mp3"],
    trigger: { player: "useCardAfter" },
    filter(event, player) {
        if (event.card.hfhy_qiaosi_copy) return false;
        if (player != _status.currentPhase || !event.getParent("phaseUse")) return false;
        if (get.type(event.card) == "equip") return false;
        const used = player.storage.hfhy_qiaosi_used || [];
        if (used.includes(event.card.name)) return false;
        const copy = get.autoViewAs({ name: event.card.name, nature: event.card.nature, isCard: true, hfhy_qiaosi_copy: true });
        if (!player.hasUseTarget(copy)) return false;
        return player.hasCard(card => get.type(card) == get.type(event.card), "h");
    },
    async cost(event, trigger, player) {
        const type = get.type(trigger.card);
        const result = await player.chooseToDiscard("h", get.prompt2("hfhy_qiaosi"))
            .set("filterCard", card => get.type(card) == type)
            .set("ai", card => 5 - get.value(card))
            .forResult();
        event.result = { bool: result?.bool };
    },
    async content(event, trigger, player) {
        const used = player.storage.hfhy_qiaosi_used || [];
        if (!used.includes(trigger.card.name)) used.push(trigger.card.name);
        player.storage.hfhy_qiaosi_used = used;
        const card = get.autoViewAs({ name: trigger.card.name, nature: trigger.card.nature, isCard: true, hfhy_qiaosi_copy: true });
        await player.chooseUseTarget(card, true);
    },
    mod: {
        cardUsable(card, player, num) {
            if (card.hfhy_qiaosi_copy) return Infinity;
        },
    },
    group: ["hfhy_qiaosi_reset"],
    subSkill: {
        reset: {
            charlotte: true,
            forced: true,
            trigger: { player: "phaseUseBegin" },
            firstDo: true,
            async content(event, trigger, player) {
                player.storage.hfhy_qiaosi_used = [];
            },
            sub: true,
            sourceSkill: "hfhy_qiaosi",
            skill_id: "hfhy_qiaosi_reset",
            _priority: 0,
        },
    },
    skill_id: "hfhy_qiaosi",
    _priority: 0,
},
"hfhy_tiangong": {
    audio: ["jiqiao1.mp3","jiqiao2.mp3"],
    trigger: { player: "phaseUseBegin" },
    filter(event, player) {
        return true;
    },
    async cost(event, trigger, player) {
        player.storage.hfhy_tiangong_types = [];
        const choices = [["basic", "基本牌"], ["trick", "锦囊牌"], ["equip", "装备牌"]];
        const result = await player.chooseButton(["天工：选择一种类型", [choices, "textbutton"]])
            .set("ai", button => {
                const type = button.link;
                let num = player.countCards("h", card => get.type(card) == type);
                if (type == "equip") num += 1.5;
                return num;
            })
            .forResult();
        event.result = { bool: result?.bool, cost_data: result?.links?.[0] };
    },
    async content(event, trigger, player) {
        player.storage.hfhy_tiangong_type = event.cost_data;
        player.addTempSkill("hfhy_tiangong_effect", "phaseUseEnd");
        player.markSkill("hfhy_tiangong_effect");
    },
    group: ["hfhy_tiangong_track", "hfhy_tiangong_jieshu"],
    subSkill: {
        effect: {
            charlotte: true,
            forced: true,
            nopop: true,
            mark: true,
            marktext: "工",
            intro: {
                content(storage, player) {
                    const names = { basic: "基本牌", trick: "锦囊牌", equip: "装备牌" };
                    const type = names[player.storage.hfhy_tiangong_type] || "所选类型";
                    return `本阶段使用${type}时摸一张牌，使用其他类型的牌无距离限制`;
                },
            },
            onremove(player) {
                delete player.storage.hfhy_tiangong_type;
            },
            trigger: { player: "useCard" },
            forced: true,
            filter(event, player) {
                return _status.currentPhase == player && get.type(event.card) == player.storage.hfhy_tiangong_type;
            },
            async content(event, trigger, player) {
                await player.draw();
            },
            mod: {
                targetInRange(card, player, target) {
                    if (get.type(card) != player.storage.hfhy_tiangong_type) return true;
                },
            },
            sub: true,
            sourceSkill: "hfhy_tiangong",
            skill_id: "hfhy_tiangong_effect",
            _priority: 0,
        },
        track: {
            charlotte: true,
            forced: true,
            nopop: true,
            trigger: { player: "useCard" },
            filter(event, player) {
                return _status.currentPhase == player && player.hasSkill("hfhy_tiangong_effect");
            },
            async content(event, trigger, player) {
                const types = player.storage.hfhy_tiangong_types || [];
                const type = get.type(trigger.card);
                if (!types.includes(type)) types.push(type);
                player.storage.hfhy_tiangong_types = types;
            },
            sub: true,
            sourceSkill: "hfhy_tiangong",
            skill_id: "hfhy_tiangong_track",
            _priority: 0,
        },
        jieshu: {
            trigger: { player: "phaseJieshuBegin" },
            filter(event, player) {
                return new Set(player.storage.hfhy_tiangong_types || []).size >= 3;
            },
            async cost(event, trigger, player) {
                const result = await player.chooseTarget("天工：选择一名角色，置入一张装备牌")
                    .set("filterTarget", (card, player, target) => {
                        return player.hasCard(cd => get.type(cd) == "equip" && target.canEquip(cd, true), "h") ||
                            Array.from(ui.discardPile.childNodes).some(cd => get.type(cd) == "equip" && target.canEquip(cd, true));
                    })
                    .set("ai", target => get.attitude(player, target))
                    .forResult();
                if (!result.bool) return;
                const target = result.targets[0];
                const handEquips = player.getCards("h", cd => get.type(cd) == "equip" && target.canEquip(cd, true));
                const pileEquips = Array.from(ui.discardPile.childNodes).filter(cd => get.type(cd) == "equip" && target.canEquip(cd, true));
                const chooseResult = await player.chooseButton([
                    "天工：选择一张装备牌置入" + get.translation(target) + "的装备区",
                    [handEquips.concat(pileEquips), "card"],
                ])
                    .set("ai", button => {
                        const card = button.link;
                        if (pileEquips.includes(card)) return 10 + get.value(card);
                        return 10 - get.value(card);
                    })
                    .forResult();
                if (!chooseResult.bool) return;
                event.result = { bool: true, cost_data: { target, card: chooseResult.links[0] } };
            },
            async content(event, trigger, player) {
                const { target, card } = event.cost_data;
                await target.equip(card);
            },
            sub: true,
            sourceSkill: "hfhy_tiangong",
            skill_id: "hfhy_tiangong_jieshu",
            _priority: 0,
        },
    },
    skill_id: "hfhy_tiangong",
    _priority: 0,
},
"hfhy_kurou": {
    audio: ["kurou1.mp3", "kurou2.mp3"],
    locked: true,
    enable: "phaseUse",
    usable: 1,
    filter(event, player) {
        return player.hp > 0;
    },
    async content(event, trigger, player) {
        await player.loseHp();
    },
    ai: {
        order: 6,
        // 苦肉①把伤害转成体力流失还附带摸牌，敌人打他收益打折
        maixie: true,
        effect: {
            target(card, player, target) {
                if (get.tag(card, "damage") && target.hp > 1) return [1, 0.65];
            },
        },
        result: {
            player(player) {
                // 掉1血换已损体力数的摸牌（苦肉②）+一枚"降"标记（诈降①），血线安全才主动发动
                if (player.hp > 2) return 1;
                if (player.hp > 1 && game.hasPlayer(current => get.attitude(player, current) < 0 && current.countMark("hfhy_jiang") > 0)) return 1;
                return 0;
            },
        },
    },
    group: ["hfhy_kurou_convert", "hfhy_kurou_draw"],
    subSkill: {
        // ①你即将受到的伤害视为失去体力（官方绝情·改同款：damageBefore取消伤害改loseHp）
        convert: {
            audio: ["kurou1.mp3", "kurou2.mp3"],
            forced: true,
            trigger: { player: "damageBefore" },
            filter(event, player) {
                return event.num > 0;
            },
            async content(event, trigger, player) {
                trigger.cancel();
                await player.loseHp(trigger.num);
            },
            sub: true,
            sourceSkill: "hfhy_kurou",
            skill_id: "hfhy_kurou_convert",
            _priority: 0,
        },
        // ②当你失去体力后，摸已损失体力值数的牌
        draw: {
            audio: ["kurou1.mp3", "kurou2.mp3"],
            forced: true,
            trigger: { player: "loseHpAfter" },
            async content(event, trigger, player) {
                await player.draw(player.getDamagedHp());
            },
            sub: true,
            sourceSkill: "hfhy_kurou",
            skill_id: "hfhy_kurou_draw",
            _priority: 0,
        },
    },
    skill_id: "hfhy_kurou",
    _priority: 0,
},
"hfhy_zhaxiang": {
    audio: ["zhaxiang1.mp3", "zhaxiang2.mp3"],
    forced: true,
    trigger: { player: "loseHpAfter" },
    // ③效果一（≥1枚"降"）：对被标记角色用牌无距离限制
    mod: {
        targetInRange(card, player, target) {
            if (target.countMark("hfhy_jiang") > 0) return true;
        },
    },
    async content(event, trigger, player) {
        const result = await player.chooseTarget("诈降：令一名其他角色获得一枚“降”标记", true)
            .set("filterTarget", (card, player2, target) => target != player && target.isIn())
            .set("ai", target => {
                // "降"是负面标记：优先给敌人，已带标记的叠到3枚激活受伤+1，残血敌人优先
                if (get.attitude(player, target) >= 0) return -1;
                let score = 3;
                if (target.countMark("hfhy_jiang") > 0) score += 1;
                if (target.hp <= 2) score += 1;
                return score;
            })
            .forResult();
        if (!result.bool || !result.targets?.length) return;
        const target = result.targets[0];
        target.addMark("hfhy_jiang", 1, false);
        target.markSkill("hfhy_jiang");
    },
    group: ["hfhy_zhaxiang_choose", "hfhy_zhaxiang_direct", "hfhy_zhaxiang_damage"],
    subSkill: {
        // ③效果二（≥2枚"降"）：对其使用的牌无法被响应（directHit）
        direct: {
            audio: ["zhaxiang1.mp3", "zhaxiang2.mp3"],
            forced: true,
            trigger: { player: "useCardToPlayered" },
            filter(event, player) {
                return event.target != player && event.target.countMark("hfhy_jiang") >= 2;
            },
            logTarget: "target",
            async content(event, trigger, player) {
                trigger.getParent().directHit.push(trigger.target);
            },
            sub: true,
            sourceSkill: "hfhy_zhaxiang",
            skill_id: "hfhy_zhaxiang_direct",
            _priority: 0,
        },
        // ③效果三（≥3枚"降"）：其受到你造成的伤害+1
        damage: {
            audio: ["zhaxiang1.mp3", "zhaxiang2.mp3"],
            forced: true,
            trigger: { source: "damageBegin1" },
            filter(event, player) {
                return event.player != player && event.player.countMark("hfhy_jiang") >= 3;
            },
            logTarget: "player",
            async content(event, trigger, player) {
                trigger.num++;
            },
            sub: true,
            sourceSkill: "hfhy_zhaxiang",
            skill_id: "hfhy_zhaxiang_damage",
            _priority: 0,
        },
        // ②当拥有"降"标记的角色受到伤害后，二选一
        choose: {
            audio: ["zhaxiang1.mp3", "zhaxiang2.mp3"],
            forced: true,
            trigger: { global: "damageAfter" },
            filter(event, player) {
                return event.num > 0 && event.player.isIn() && event.player != player && event.player.countMark("hfhy_jiang") > 0;
            },
            logTarget: "player",
            async content(event, trigger, player) {
                const target = trigger.player;
                const canSteal = target.countCards("h") > 0;
                const controls = canSteal ? ["选项一", "选项二"] : ["选项一"];
                const { control } = await player.chooseControl(controls)
                    .set("choiceList", [
                        "失去1点体力",
                        `获得${get.translation(target)}的一张手牌，然后移去其一枚“降”标记`,
                    ])
                    .set("prompt", `诈降：${get.translation(target)}拥有“降”标记且正在受到伤害`)
                    .set("ai", () => {
                        const me = get.player();
                        if (!canSteal) return "选项一";
                        const hostile = get.attitude(me, target) < 0;
                        // 血线低或敌方手牌多时优先偷牌；血量充裕时选失去体力（苦肉②摸牌+诈降①叠标记）
                        if (me.hp <= 2) return "选项二";
                        if (hostile && target.countCards("h") >= 3) return "选项二";
                        if (me.hp > 2) return "选项一";
                        return "选项二";
                    })
                    .forResult();
                if (control == "选项二" && canSteal) {
                    await player.gainPlayerCard(target, "h", true);
                    target.removeMark("hfhy_jiang", 1, false);
                } else {
                    await player.loseHp();
                }
            },
            sub: true,
            sourceSkill: "hfhy_zhaxiang",
            skill_id: "hfhy_zhaxiang_choose",
            _priority: 0,
        },
    },
    skill_id: "hfhy_zhaxiang",
    _priority: 0,
},
"hfhy_jiang": {
    // 「降」标记载体：诈降授予其他角色的负面标记
    mark: true,
    marktext: "降",
    intro: {
        content(storage) {
            return `拥有${storage || 0}枚"降"标记`;
        },
    },
},
"hfhy_fenqu": {
    audio: ["dcsblieji1.mp3", "dcsblieji2.mp3"],
    forced: true,
    unique: true,
    juexingji: true,
    skillAnimation: true,
    animationColor: "fire",
    derivation: "hfhy_pozhen",
    trigger: { player: "dying" },
    filter(event, player) {
        return game.countPlayer(current => current.countMark("hfhy_jiang") > 0);
    },
    async content(event, trigger, player) {
        player.awakenSkill("hfhy_fenqu");
        await player.addSkills("hfhy_pozhen");
        await player.link(true);
        const marked = game.filterPlayer(current => current != player && current.countMark("hfhy_jiang") > 0);
        for (const target of marked) {
            if (target.isIn()) await target.link(true);
        }
        let removed = 0;
        for (const current of game.filterPlayer()) {
            const count = current.countMark("hfhy_jiang");
            if (count > 0) {
                current.removeMark("hfhy_jiang", count, false);
                removed += count;
            }
        }
        // 每移除一枚"降"标记回复1点体力（濒死时机，可自救）
        if (removed > 0) {
            await player.recover(removed);
        }
        await player.removeSkills(["hfhy_kurou", "hfhy_zhaxiang"]);
    },
    skill_id: "hfhy_fenqu",
    _priority: 0,
},
"hfhy_pozhen": {
    audio: ["twjuyan1.mp3", "twjuyan2.mp3"],
    limited: true,
    skillAnimation: true,
    animationColor: "fire",
    enable: "phaseUse",
    filter(event, player) {
        return player.countCards("h") > 0;
    },
    async content(event, trigger, player) {
        player.awakenSkill("hfhy_pozhen");
        const result = await player.chooseTarget("破阵：选择一名角色（可以是你自己）", true)
            .set("filterTarget", (card, player2, target) => {
                if (!target.isIn() || !target.countCards("h")) return false;
                if (target == player) return true;
                // 需存在双方共有花色，否则无从弃起、伤害为0
                const mySuits = new Set(player.getCards("h").map(c => get.suit(c)));
                return target.getCards("h").some(c => mySuits.has(get.suit(c)));
            })
            .set("ai", target => {
                if (target == player) return -10;
                if (get.attitude(player, target) >= 0) return -1;
                // 共有花色越多伤害越高（双方都会弃掉这些花色的牌），残血敌人优先
                const mySuits = new Set(player.getCards("h").map(c => get.suit(c)));
                let common = 0;
                for (const suit of new Set(target.getCards("h").map(c => get.suit(c)))) {
                    if (mySuits.has(suit)) common++;
                }
                return common * 2 + (target.hp <= 4 ? 1 : 0);
            })
            .forResult();
        if (!result.bool || !result.targets?.length) return;
        const target = result.targets[0];
        await target.showHandcards(`破阵：${get.translation(target)}的手牌`);

        // 对自己发动：只弃自己的牌，X=弃置牌的花色数
        if (target == player) {
            const result2 = await player.chooseCard("h", [1, player.countCards("h")], true, "破阵：弃置任意张手牌，对你造成X点火焰伤害（X为弃置牌的花色数）")
                .set("ai", card => -get.value(card, player))
                .forResult();
            if (!result2.bool || !result2.cards?.length) return;
            const x2 = new Set(result2.cards.map(card => get.suit(card))).size;
            await player.discard(result2.cards);
            if (x2 > 0 && player.isIn()) {
                await player.damage(x2, player, "fire");
            }
            return;
        }

        const myCards = player.getCards("h");
        const targetCards = target.getCards("h");
        const mySuits = new Set(myCards.map(card => get.suit(card)));
        const targetSuits = new Set(targetCards.map(card => get.suit(card)));
        const common = [...mySuits].filter(suit => targetSuits.has(suit));
        const myPanel = myCards.filter(card => common.includes(get.suit(card)));
        const targetPanel = targetCards.filter(card => common.includes(get.suit(card)));

        // 双栏选牌窗口（同劫营）：我选择双方各弃哪些牌，每种花色双方至少各选一张
        const dialog = [
            "破阵：请选择双方手牌中花色相同的牌（每种花色双方至少各选一张）",
            "你的手牌",
            myPanel,
            `${get.translation(target)}的手牌`,
            targetPanel,
        ];
        // AI预案：每种共有花色，用我最廉价的一张换目标最值钱的一张并+1伤害，净收益为正才纳入
        const plan = new Set();
        for (const suit of common) {
            const mine = myPanel.filter(card => get.suit(card) === suit);
            const theirs = targetPanel.filter(card => get.suit(card) === suit);
            if (!mine.length || !theirs.length) continue;
            const myCheapest = mine.sort((a, b) => get.value(a, player) - get.value(b, player))[0];
            const theirBest = theirs.sort((a, b) => get.value(b, target) - get.value(a, target))[0];
            if (get.value(theirBest, target) - get.value(myCheapest, player) + 2 > 0) {
                plan.add(myCheapest);
                plan.add(theirBest);
            }
        }
        const next = player.chooseButton([2, 100], dialog);
        next.set("filterButton", filterButton);
        next.set("filterOk", filterOk);
        next.set("ai", processAI);
        const result2 = await next.forResult();
        if (!result2.bool) return;
        const mySel = result2.links.filter(card => get.owner(card) === player);
        const targetSel = result2.links.filter(card => get.owner(card) === target);
        if (!mySel.length) return;
        const x = new Set(mySel.map(card => get.suit(card))).size;
        await player.discard(mySel);
        if (targetSel.length) await target.discard(targetSel);
        if (x > 0 && target.isIn()) {
            await target.damage(x, player, "fire");
        }

        function filterButton(button) {
            const card = button.link;
            const owner = get.owner(card);
            const suit = get.suit(card);
            if (owner && !lib.filter.canBeDiscarded(card, owner, player)) return false;
            const selected = ui.selected.buttons.map(b => b.link);
            const mySel2 = selected.filter(c => get.owner(c) === player);
            const targetSel2 = selected.filter(c => get.owner(c) === target);
            if (owner === player) {
                // 对面该花色已选过，或还有未选的可配对牌
                if (targetSel2.some(c => get.suit(c) === suit)) return true;
                return targetPanel.some(c => !selected.includes(c) && get.suit(c) === suit && lib.filter.canBeDiscarded(c, target, player));
            }
            if (owner === target) {
                if (mySel2.some(c => get.suit(c) === suit)) return true;
                return myPanel.some(c => !selected.includes(c) && get.suit(c) === suit && lib.filter.canBeDiscarded(c, player, player));
            }
            return false;
        }
        function filterOk() {
            const selected = ui.selected.buttons.map(b => b.link);
            if (!selected.length) return false;
            const mySel2 = selected.filter(c => get.owner(c) === player);
            const targetSel2 = selected.filter(c => get.owner(c) === target);
            if (!mySel2.length || !targetSel2.length) return false;
            const mySuits2 = new Set(mySel2.map(c => get.suit(c)));
            const targetSuits2 = new Set(targetSel2.map(c => get.suit(c)));
            if (mySuits2.size !== targetSuits2.size) return false;
            for (const suit of mySuits2) {
                if (!targetSuits2.has(suit)) return false;
            }
            return true;
        }
        function processAI(button) {
            return plan.has(button.link) ? 1 : -1;
        }
    },
    ai: {
        order: 10,
        result: {
            player(player) {
                const mySuits = new Set(player.getCards("h").map(c => get.suit(c)));
                return game.hasPlayer(current => {
                    if (current == player || get.attitude(player, current) >= 0 || !current.countCards("h")) return false;
                    return current.getCards("h").some(c => mySuits.has(get.suit(c)));
                }) ? 1 : 0;
            },
        },
    },
    skill_id: "hfhy_pozhen",
    _priority: 0,
},
"hfhy_gudan": {
    // 孤胆：高频触发静默用 popup:false（引擎触发技弹窗判断 info.popup!=false）；
    // 不能用 nopop:true —— 图鉴技能列表会过滤 nopop 技能导致"无法查看技能"
    audio: "sblongdan",
    popup: false,
    mark: true,
    marktext: "胆",
    intro: {
        content(storage) {
            const n = storage || 0;
            const list = [];
            if (n >= 2) list.push("龙胆");
            if (n >= 6) list.push("绝境");
            if (n >= 10) list.push("怀幼");
            if (n >= 14) list.push("破围");
            return `拥有${n}个"胆"标记（上限14）` + (list.length ? `，视为拥有【${list.join("】【")}】` : "");
        },
    },
    init(player, skill) {
        player.storage[skill] = 0;
    },
    forced: true,
    trigger: {
        player: ["useCard", "respond", "dying", "dyingAfter", "damageEnd"],
        source: "damageSource",
    },
    filter(event, player) {
        if (event.name == "useCard" || event.name == "respond") {
            return event.card && get.type(event.card) == "basic";
        }
        if (event.name == "dyingAfter") {
            return player.isIn();
        }
        return true;
    },
    async content(event, trigger, player) {
        // popup:false 抑制自动弹窗/记录，但每次触发仍播一次龙胆系语音
        game.trySkillAudio("hfhy_gudan", player, true);
        if (player.countMark("hfhy_gudan") < 14) {
            player.addMark("hfhy_gudan", 1, false);
        }
        player.markSkill("hfhy_gudan");
        const n = player.countMark("hfhy_gudan");
        const toGain = [];
        if (n >= 2 && !player.hasSkill("hfhy_longdan", null, null, false)) toGain.push("hfhy_longdan");
        if (n >= 6 && !player.hasSkill("hfhy_juejing", null, null, false)) toGain.push("hfhy_juejing");
        if (n >= 10 && !player.hasSkill("hfhy_huaiyou", null, null, false)) toGain.push("hfhy_huaiyou");
        if (n >= 14 && !player.hasSkill("hfhy_powei", null, null, false)) toGain.push("hfhy_powei");
        if (toGain.length) {
            game.log(player, "获得了技能", "#g【" + toGain.map(name => get.translation(name)).join("】【") + "】");
            for (const skill of toGain) {
                await player.addSkills([skill]);
                const { control } = await player.chooseControl(["选项一", "选项二"])
                    .set("choiceList", [
                        "获得一点护甲",
                        "摸两张牌",
                    ])
                    .set("prompt", `孤胆：因获得“${get.translation(skill)}”，选择一项`)
                    .set("ai", () => {
                        const me = get.player();
                        // 护甲残血更划算，手牌缺口大或状态健康时补牌
                        return me.hp <= 2 && me.hujia < 3 ? "选项一" : "选项二";
                    })
                    .forResult();
                if (control == "选项一") {
                    await player.changeHujia(1);
                } else {
                    await player.draw(2);
                }
            }
        }
    },
    derivation: ["hfhy_longdan", "hfhy_juejing", "hfhy_huaiyou", "hfhy_powei"],
    skill_id: "hfhy_gudan",
    _priority: 0,
},
"hfhy_longdan": {
    audio: ["sblongdan1.mp3", "sblongdan2.mp3"],
    // 主技能只做容器：enable/viewAs 全在子技能上，主技能不可被 chooseToUse 选中（否则 setContent(undefined) 崩溃）
    // mod 必须在子技能上：主技能带 mod 会被判定为锁定技，导致非锁定技失效时绕过限制
    group: ["hfhy_longdan_unlimited", "hfhy_longdan_sha", "hfhy_longdan_shan"],
    subSkill: {
        unlimited: {
            // 以此法转换的牌不计入次数限制：viewAs 带 storage 标记（VCard 构造时保留，unsure 按钮阶段也在）
            mod: {
                cardUsable(card, player, num) {
                    if (card.name == "sha" && card.storage && card.storage.hfhy_longdan_convert) {
                        return Infinity;
                    }
                },
            },
            sub: true,
            sourceSkill: "hfhy_longdan",
            skill_id: "hfhy_longdan_unlimited",
            _priority: 0,
        },
        sha: {
            audio: ["sblongdan1.mp3", "sblongdan2.mp3"],
            enable: ["chooseToUse", "chooseToRespond"],
            // 硬门槛：必须已解锁龙胆（孤胆≥2授予），防止任何候选路径在未解锁时漏出
            filter(event, player) {
                return player.hasSkill("hfhy_longdan");
            },
            filterCard: { name: "shan" },
            position: "hs",
            viewAs: { name: "sha", storage: { hfhy_longdan_convert: true } },
            viewAsFilter(player) {
                if (!player.hasCards("hs", "shan")) return false;
            },
            prompt: "龙胆：将一张【闪】当【杀】使用或打出",
            check(card) {
                return 6 - get.value(card);
            },
            ai: {
                respondSha: true,
                skillTagFilter(player) {
                    if (!player.hasCards("hs", "shan")) return false;
                },
                order() {
                    return get.order({ name: "sha" }) + 0.1;
                },
                useful: -1,
                value: -1,
            },
            sub: true,
            sourceSkill: "hfhy_longdan",
            skill_id: "hfhy_longdan_sha",
            _priority: 0,
        },
        shan: {
            audio: ["sblongdan1.mp3", "sblongdan2.mp3"],
            enable: ["chooseToUse", "chooseToRespond"],
            filter(event, player) {
                return player.hasSkill("hfhy_longdan");
            },
            filterCard: { name: "sha" },
            position: "hs",
            viewAs: { name: "shan", storage: { hfhy_longdan_convert: true } },
            viewAsFilter(player) {
                if (!player.hasCards("hs", "sha")) return false;
            },
            prompt: "龙胆：将一张【杀】当【闪】使用或打出",
            check(card) {
                return 6 - get.value(card);
            },
            ai: {
                respondShan: true,
                skillTagFilter(player) {
                    if (!player.hasCards("hs", "sha")) return false;
                },
                effect: {
                    target(card, player, target, current) {
                        if (get.tag(card, "respondShan") && current < 0) return 0.6;
                    },
                },
            },
            sub: true,
            sourceSkill: "hfhy_longdan",
            skill_id: "hfhy_longdan_shan",
            _priority: 0,
        },
    },
    skill_id: "hfhy_longdan",
    _priority: 0,
},
"hfhy_juejing": {
    audio: ["xinjuejing1.mp3", "xinjuejing2.mp3"],
    trigger: { player: "dying" },
    filter(event, player) {
        return player.countCards("h") > 0;
    },
    async cost(event, trigger, player) {
        event.result = await player.chooseToDiscard("h", [1, player.countCards("h")], "绝境：是否弃置任意张手牌？（♥回复体力，♣摸牌，♠弃置伤害来源一张牌，♦获得伤害来源一张牌）")
            .set("ai", card => {
                const me = get.player();
                const suit = get.suit(card, me);
                // 按花色收益权衡：残血红桃最优，梅花次之，来源有牌时黑/方片有价值
                let benefit = 0;
                if (suit == "heart") benefit = 2.5;
                else if (suit == "club") benefit = 1.5;
                else if (suit == "spade" || suit == "diamond") {
                    const source = event.getTrigger()?.source;
                    if (source && source.isIn() && source.countCards("he") > 0) benefit = 1.5;
                }
                const w = benefit - get.value(card, me) / 3;
                return w > 0 ? w : -1;
            })
            .forResult();
    },
    async content(event, trigger, player) {
        const suits = new Set(event.cards.map(card => get.suit(card, player)));
        const source = trigger.source;
        if (suits.has("heart")) {
            await player.recover(1);
        }
        if (suits.has("club")) {
            await player.draw(1);
        }
        if (suits.has("spade") && source && source.isIn() && source.countCards("he") > 0) {
            await player.discardPlayerCard(source, true, "he", "绝境：弃置伤害来源的一张牌");
        }
        if (suits.has("diamond") && source && source.isIn() && source.countGainableCards(player, "he") > 0) {
            await player.gainPlayerCard(source, true, "he", "绝境：获得伤害来源的一张牌");
        }
    },
    skill_id: "hfhy_juejing",
    _priority: 0,
},
"hfhy_huaiyou": {
    audio: ["longdan_sha1.mp3", "longdan_sha2.mp3"],
    mod: {
        maxHandcard(player, num) {
            return Math.floor(player.countMark("hfhy_gudan") / 2);
        },
    },
    group: ["hfhy_huaiyou_draw"],
    subSkill: {
        draw: {
            audio: ["longdan_sha1.mp3", "longdan_sha2.mp3"],
            forced: true,
            trigger: { player: "phaseDrawBegin1" },
            filter(event, player) {
                const x = Math.floor(player.countMark("hfhy_gudan") / 2);
                return x > 2 && !event.numFixed;
            },
            async content(event, trigger, player) {
                const x = Math.floor(player.countMark("hfhy_gudan") / 2);
                trigger.num += x - 2;
            },
            sub: true,
            sourceSkill: "hfhy_huaiyou",
            skill_id: "hfhy_huaiyou_draw",
            _priority: 0,
        },
    },
    skill_id: "hfhy_huaiyou",
    _priority: 0,
},
"hfhy_powei": {
    audio: ["chongzhen1.mp3", "chongzhen2.mp3"],
    enable: "phaseUse",
    usable: 1,
    filter(event, player) {
        return player.countCards("he") > 0;
    },
    async content(event, trigger, player) {
        const result = await player.chooseToDiscard("he", [1, player.countCards("he")], true, "破围：弃置任意张牌")
            .set("ai", card => 5 - get.value(card))
            .forResult();
        if (!result.bool || !result.cards?.length) return;
        const num = result.cards.length;
        const { control } = await player.chooseControl(["选项一", "选项二"])
            .set("choiceList", [
                "从弃牌堆随机获得等量的基本牌",
                "从弃牌堆随机获得等量的非基本牌",
            ])
            .set("prompt", `破围：获得${num}张牌`)
            .set("ai", () => {
                const me = get.player();
                // 基本牌兜底实用；非基本牌看弃牌堆里有没有高质量锦囊/装备
                const discardPile = Array.from(ui.discardPile.childNodes);
                const basicValue = discardPile.filter(card => get.type(card, "basic") == "basic")
                    .reduce((sum, card) => sum + get.value(card, me), 0);
                const nonBasicValue = discardPile.filter(card => get.type(card, "basic") != "basic")
                    .reduce((sum, card) => sum + get.value(card, me), 0);
                return nonBasicValue > basicValue ? "选项二" : "选项一";
            })
            .forResult();
        const wantBasic = control == "选项一";
        const pool = Array.from(ui.discardPile.childNodes).filter(card =>
            wantBasic ? get.type(card, "basic") == "basic" : get.type(card, "basic") != "basic"
        );
        // 从弃牌堆随机取 num 张（池子不足则有多少拿多少）
        const gained = pool.sort(() => Math.random() - 0.5).slice(0, num);
        if (gained.length) {
            await player.gain(gained, "gain2");
            player.addGaintag(gained, "hfhy_powei_free");
        }
    },
    group: ["hfhy_powei_free"],
    subSkill: {
        free: {
            charlotte: true,
            mod: {
                targetInRange(card) {
                    // 破围获得的牌本身，以及经龙胆等转换、底层为破围牌的虚牌，均无距离限制
                    // hasGaintag 需 typeof 判断：某些包装对象上它存在但不是函数
                    const hasTag = (c, tag) => c && typeof c.hasGaintag == "function" && c.hasGaintag(tag);
                    if (hasTag(card, "hfhy_powei_free")) return true;
                    if (card.cards && card.cards.some(c => hasTag(c, "hfhy_powei_free"))) return true;
                },
            },
            sub: true,
            sourceSkill: "hfhy_powei",
            skill_id: "hfhy_powei_free",
            _priority: 0,
        },
    },
    skill_id: "hfhy_powei",
    _priority: 0,
},
"hfhy_tiandu": {
    audio: ["sbtiandu1.mp3", "sbtiandu2.mp3", "tiandu_re_guojia1.mp3", "tiandu_re_guojia2.mp3"],
    locked: true,
    forced: true,
    // ①判定牌生效后获得之（官方天妒同款时机与过滤）
    trigger: { player: "judgeEnd" },
    filter(event, player) {
        return event.result?.card && get.position(event.result.card, true) === "o";
    },
    async content(event, trigger, player) {
        await player.gain(trigger.result.card, "gain2");
    },
    group: ["hfhy_tiandu_maxhp"],
    subSkill: {
        // ②出牌阶段开始时判定，非♥减1点体力上限
        maxhp: {
            audio: ["sbtiandu1.mp3", "sbtiandu2.mp3", "tiandu_re_guojia1.mp3", "tiandu_re_guojia2.mp3"],
            forced: true,
            trigger: { player: "phaseUseBegin" },
            async content(event, trigger, player) {
                const result = await player.judge().forResult();
                if (result && result.suit != "heart") {
                    await player.loseMaxHp();
                }
            },
            sub: true,
            sourceSkill: "hfhy_tiandu",
            skill_id: "hfhy_tiandu_maxhp",
            _priority: 0,
        },
    },
    skill_id: "hfhy_tiandu",
    _priority: 0,
},
"hfhy_shisheng": {
    audio: ["shishengshibai.mp3"],
    enable: "phaseUse",
    filter(event, player) {
        if (!player.countCards("h") || player.hasSkillTag("noCompareSource")) return false;
        return game.hasPlayer(target => {
            return target != player && target.isIn() &&
                player.canCompare(target) &&
                hfhy_shishengHasBlockableSkill(target) &&
                !player.getStorage("hfhy_shisheng_targets", []).includes(target);
        });
    },
    filterTarget(card, player, target) {
        return target != player && target.isIn() &&
            player.canCompare(target) &&
            hfhy_shishengHasBlockableSkill(target) &&
            !player.getStorage("hfhy_shisheng_targets", []).includes(target);
    },
    init(player, skill) {
        if (!Array.isArray(player.storage.hfhy_shisheng_targets)) {
            player.storage.hfhy_shisheng_targets = [];
        }
    },
    async content(event, trigger, player) {
        const target = event.target;
        player.storage.hfhy_shisheng_targets.push(target);
        const result = await player.chooseToCompare(target).forResult();
        if (result.bool || result.tie) {
            // 拼点不输（赢或平局）：令其失去一个技能直到其下个回合结束时
            const result2 = await player.chooseSkill(target, "十胜：令其失去一个技能直到其下个回合结束时")
                .set("skillRankPlayer", target)
                .set("func", hfhy_shishengCanBlockSkill)
                .forResult();
            const chosen = result2?.skill;
            if (chosen && lib.skill[chosen]) {
                target.addTempSkill("hfhy_shisheng_block", { player: "phaseAfter" });
                target.storage.hfhy_shisheng_block = chosen;
                game.log(player, "令", target, "失去了技能", "#g【" + get.translation(chosen) + "】");
            }
        } else {
            // 拼点输：受到1点伤害
            await player.damage();
        }
    },
    group: ["hfhy_shisheng_judge", "hfhy_shisheng_reset"],
    ai: {
        order: 8,
        result: {
            player(player, target) {
                // 只把技能价值算在敌方目标上，友方目标始终由 target 结果否决
                if (target && get.attitude(player, target) >= 0) return 0;
                if (player.hasSkillTag("noCompareSource") || !player.countCards("h")) return 0;
                const used = player.getStorage("hfhy_shisheng_targets", []);
                const enemies = game.filterPlayer(current => {
                    return current != player && current.isIn() && get.attitude(player, current) < 0 &&
                        player.canCompare(current) && hfhy_shishengHasBlockableSkill(current) &&
                        !used.includes(current);
                });
                if (!enemies.length) return 0;
                const best = enemies.reduce((value, current) => Math.max(value, hfhy_shishengSkillValue(current)), 0);
                const cheapest = player.getCards("h").slice().sort((a, b) => get.value(a, player) - get.value(b, player))[0];
                const cost = cheapest ? get.value(cheapest, player) : 4;
                // 十胜的判定让拼点几乎必胜，主要成本只是一张手牌
                return Math.max(0.8, 3.2 + best * 0.35 - cost * 0.55);
            },
            target(player, target) {
                // 对友方封锁技能同样是负收益；对敌方按可封锁技能的最高价值评估
                if (get.attitude(player, target) >= 0) return -4;
                return -(1.4 + hfhy_shishengSkillValue(target) * 0.6);
            },
        },
    },
    subSkill: {
        // ②拼点时判定：红色你的点数视为K，黑色对方点数视为A（官方君刘永 jun_zhiyang_number 同款改点）
        judge: {
            audio: ["shishengshibai.mp3"],
            trigger: {
                player: "compare",
                target: "compare",
            },
            check() {
                return true;
            },
            async content(event, trigger, player) {
                const result = await player.judge().forResult();
                if (!result) return;
                const iAmInitiator = trigger.player == player;
                if (result.color == "red") {
                    game.log(player, "的拼点牌点数视为", "#yK");
                    if (iAmInitiator) trigger.num1 = 13;
                    else trigger.num2 = 13;
                } else {
                    game.log(player, "的对方拼点牌点数视为", "#yA");
                    if (iAmInitiator) trigger.num2 = 1;
                    else trigger.num1 = 1;
                }
            },
            sub: true,
            sourceSkill: "hfhy_shisheng",
            skill_id: "hfhy_shisheng_judge",
            _priority: 0,
        },
        // 每个出牌阶段重置已拼点名单
        reset: {
            charlotte: true,
            firstDo: true,
            forced: true,
            popup: false,
            trigger: { player: "phaseUseBegin" },
            async content(event, trigger, player) {
                player.storage.hfhy_shisheng_targets = [];
            },
            sub: true,
            sourceSkill: "hfhy_shisheng",
            skill_id: "hfhy_shisheng_reset",
            _priority: 0,
        },
    },
    skill_id: "hfhy_shisheng",
    _priority: 0,
},
// 「失去一个技能」的封锁载体：挂在目标身上，skillBlocker 只放行被封的那一个
"hfhy_shisheng_block": {
    charlotte: true,
    init(player, skill) {
        player.addSkillBlocker(skill);
        player.addTip(skill, "技能失效");
    },
    onremove(player, skill) {
        player.removeSkillBlocker(skill);
        player.removeTip(skill);
        delete player.storage.hfhy_shisheng_block;
    },
    skillBlocker(skill, player) {
        const blocked = player.getStorage("hfhy_shisheng_block");
        if (!blocked || skill !== blocked) return false;
        const info = lib.skill[skill];
        return info && !info.charlotte && !info.locked && !info.persevereSkill;
    },
    mark: true,
    marktext: "封",
    intro: {
        content(storage, player) {
            const blocked = player.getStorage("hfhy_shisheng_block");
            return blocked ? `【${get.translation(blocked)}】失效直到其下个回合结束` : "技能失效";
        },
    },
},
"hfhy_yiji": {
    audio: ["reyiji1.mp3", "reyiji2.mp3", "reyiji_yj_sb_guojia1.mp3", "reyiji_yj_sb_guojia2.mp3"],
    forced: true,
    trigger: { player: "damageEnd" },
    filter(event, player) {
        return event.num > 0;
    },
    async content(event, trigger, player) {
        const num = trigger.num || 1;
        const suits = ["spade", "heart", "club", "diamond"];
        for (let i = 0; i < num; i++) {
            const result = await player.chooseTarget("遗计：令一名角色获得一张【破釜沉舟】", true)
                .set("ai", target => {
                    const me = get.player();
                    // 残血优先自留（濒死当桃保命），其次给能立即发挥攻击价值或需要保命的队友
                    if (target == me) {
                        let value = 4.5;
                        if (me.hp <= 2) value += 4;
                        else if (me.hp <= 3) value += 1.5;
                        if (me.countCards("h") <= 1) value += 1;
                        return value;
                    }
                    const att = get.attitude(me, target);
                    if (att <= 0) return att * 0.8 - 1;
                    let value = 2 + att * 2;
                    if (target.hp <= 2) value += 2.5;
                    if (game.hasPlayer(current => {
                        return current != target && current.isIn() &&
                            get.attitude(target, current) < 0 &&
                            get.distance(target, current) == 1;
                    })) {
                        value += 1.5;
                    }
                    return value;
                })
                .forResult();
            if (!result.bool || !result.targets?.length) break;
            const target = result.targets[0];
            const card = game.createCard("hfhy_pofuchenzhou", suits[Math.floor(Math.random() * suits.length)], 13);
            await target.gain(card, "gain2");
        }
    },
    ai: {
        // 官方遗计同款：打郭嘉等于送他"破釜沉舟"，敌方 AI 伤害意愿打折
        maixie: true,
        maixie_hp: true,
        effect: {
            target(card, player, target) {
                if (get.tag(card, "damage")) {
                    if (player.hasSkillTag("jueqing", false, target)) {
                        return [1, -2];
                    }
                    if (!target.hasFriend()) {
                        return;
                    }
                    let num = 1;
                    if (get.attitude(player, target) > 0) {
                        if (player.needsToDiscard()) {
                            num = 0.7;
                        } else {
                            num = 0.5;
                        }
                    }
                    if (target.hp >= 4) {
                        return [1, num * 2];
                    }
                    if (target.hp == 3) {
                        return [1, num * 1.5];
                    }
                    if (target.hp == 2) {
                        return [1, num * 0.5];
                    }
                }
            },
        },
    },
    skill_id: "hfhy_yiji",
    _priority: 0,
},
// 破釜沉舟跳过摸牌阶段的可见标记
"hfhy_pofuchenzhou_skip": {
    charlotte: true,
    mark: true,
    marktext: "釜",
    intro: {
        content: "其下一个摸牌阶段将被跳过",
    },
},
// 铁骑专用「非锁定技失效」：官方 fengyin 受 get.is.locked 影响不锁 forced 触发技/mod 技，
// 此封锁器只豁免显式标注锁定（locked）与被动 mod 技（踏浪/怀幼等真锁定技），其余可锁
"hfhy_tieji_blocker": {
    charlotte: true,
    init(player, skill) {
        player.addSkillBlocker(skill);
        player.addTip(skill, "非锁定技失效");
    },
    onremove(player, skill) {
        player.removeSkillBlocker(skill);
        player.removeTip(skill);
    },
    skillBlocker(skill, player) {
        const info = lib.skill[skill];
        if (!info) return false;
        if (info.persevereSkill || info.charlotte) return false;
        if (info.locked || info.mod) return false;
        return true;
    },
    mark: true,
    intro: {
        content(storage, player, skill) {
            const list = player.getSkills(null, false, false).filter(i => lib.skill.hfhy_tieji_blocker.skillBlocker(i, player));
            return list.length ? "失效技能：" + get.translation(list) : "无失效技能";
        },
    },
},
"hfhy_guqu": {
    audio: ["potyinhui1.mp3","potyinhui2.mp3","potyinhui3.mp3","potyinhui4.mp3","potyinhui5.mp3","potyinhui6.mp3","potyinhui7.mp3","potyinhui8.mp3","potyinhui9.mp3","potyinhui10.mp3","potyinhui11.mp3","potyinhui12.mp3"],
    mark: true,
    marktext: "谱",
    intro: {
        content(storage, player) {
            const pu = player.getStorage("hfhy_guqu_pu", []);
            if (!pu.length) return "点击「执行弦歌合律」生成花色谱";
            const pos = player.getStorage("hfhy_guqu_pos", 0);
            const correct = player.getStorage("hfhy_guqu_correct", 0);
            const shown = pu.map((s, i) => (i === pos ? "【" + GUQU_SYMBOL[s] + "】" : GUQU_SYMBOL[s])).join(" ");
            return `谱：${shown}<br>比对位：第${pos + 1}/${pu.length}个｜已中：${correct}`;
        },
    },
    round: 1,
    // global 触发：首轮开始时无论是否一号位都能收到（friend诸葛亮同款）
    trigger: { global: ["roundStart", "phaseZhunbeiBegin"] },
    filter(event, player, triggername) {
        // 准备阶段只在自己的准备阶段触发；roundStart 全员一次
        if (triggername == "phaseZhunbeiBegin" && event.player != player) return false;
        return true;
    },
    async cost(event, trigger, player) {
        event.result = await player.chooseBool("顾曲：是否执行“弦歌合律”？")
            .set("ai", () => {
                const me = get.player();
                // 手牌充足时可配合天香凑花色，优先合律
                return me.countCards("h") >= 2;
            })
            .forResult();
        if (event.result.bool) event.result.cost_data = "合律";
    },
    async content(event, trigger, player) {
        // 执行弦歌合律——生成长度为 len 的随机花色谱
        const len = player.getStorage("hfhy_guqu_len", 5);
        const pu = [];
        for (let i = 0; i < len; i++) {
            pu.push(GUQU_SUITS[Math.floor(Math.random() * GUQU_SUITS.length)]);
        }
        player.storage.hfhy_guqu_pu = pu;
        player.storage.hfhy_guqu_pos = 0;
        player.storage.hfhy_guqu_correct = 0;
        player.markSkill("hfhy_guqu");
        game.log(player, "执行了“弦歌合律”，花色谱已生成");
    },
    group: ["hfhy_guqu_verify"],
    subSkill: {
        // 弦歌合律验证：使用或打出牌（含回合外响应）时与谱当前比对位对比，无论是否相同比对位均推进
        verify: {
            audio: ["friendzhugelianggongli1.mp3", "friendzhugelianggongli2.mp3"],
            forced: true,
            popup: false,
            trigger: { player: ["useCard", "respond"] },
            filter(event, player) {
                const pu = player.getStorage("hfhy_guqu_pu", []);
                return pu.length > 0 && player.getStorage("hfhy_guqu_pos", 0) < pu.length;
            },
            async content(event, trigger, player) {
                const pu = player.getStorage("hfhy_guqu_pu", []);
                const pos = player.getStorage("hfhy_guqu_pos", 0);
                const suit = get.suit(trigger.card, player);
                let correct = player.getStorage("hfhy_guqu_correct", 0);
                if (suit === pu[pos]) {
                    correct++;
                    player.popup("合律", "wood");
                    // 合律成功：立即摸一张牌
                    await player.draw(1);
                }
                player.storage.hfhy_guqu_correct = correct;
                player.storage.hfhy_guqu_pos = pos + 1;
                player.markSkill("hfhy_guqu");
                if (pos + 1 >= pu.length) {
                    // 全部验证完毕，结算
                    player.storage.hfhy_guqu_pu = [];
                    player.storage.hfhy_guqu_pos = 0;
                    if (correct > 0) {
                        const trick = guquRandomTyped(player, "trick");
                        if (trick) await player.gain(trick, "gain2");
                    }
                    if (correct > 2) {
                        const equip = guquRandomTyped(player, "equip");
                        if (equip) await player.gain(equip, "gain2");
                    }
                    if (correct > 4) {
                        const result = await player.chooseTarget("弦歌合律：令一名其他角色摸" + correct + "张牌", true)
                            .set("filterTarget", (card, player2, target) => target != player2 && target.isIn())
                            .set("ai", target => {
                                const me = get.player();
                                return get.attitude(me, target) > 0 ? 1 : -1;
                            })
                            .forResult();
                        if (result.bool && result.targets?.length) {
                            await result.targets[0].draw(correct);
                        }
                        // 花色谱长度+1，下次弦歌合律的谱更长
                        player.storage.hfhy_guqu_len = pu.length + 1;
                        game.log(player, "的“弦歌合律”花色数增至", pu.length + 1);
                    }
                    game.log(player, "的“弦歌合律”验证完毕：", correct + "/" + pu.length, "合律");
                    player.storage.hfhy_guqu_correct = 0;
                }
            },
            sub: true,
            sourceSkill: "hfhy_guqu",
            skill_id: "hfhy_guqu_verify",
            _priority: 0,
        },
    },
    skill_id: "hfhy_guqu",
    _priority: 0,
},
"hfhy_tianxiang": {
    audio: ["potheyun1.mp3", "potheyun2.mp3"],
    trigger: { player: ["useCardBefore", "respondBefore"] },
    filter(event, player) {
        if (!event.card) return false;
        const used = player.getStorage("hfhy_tianxiang_used", []);
        const current = get.suit(event.card, player);
        return GUQU_SUITS.some(suit => suit !== current && !used.includes(suit));
    },
    async cost(event, trigger, player) {
        const used = player.getStorage("hfhy_tianxiang_used", []);
        const current = get.suit(trigger.card, player);
        const suitName = { spade: "♠", heart: "♥", club: "♣", diamond: "♦" };
        const cnName = { spade: "黑桃", heart: "红桃", club: "梅花", diamond: "方片" };
        const available = GUQU_SUITS.filter(suit => suit !== current && !used.includes(suit));
        // 谱激活时 AI 改成谱当前比对位的花色；否则不改
        const pu = player.getStorage("hfhy_guqu_pu", []);
        const pos = player.getStorage("hfhy_guqu_pos", 0);
        const desired = pu.length && pos < pu.length ? pu[pos] : null;
        const { control } = await player.chooseControl(available.map(s => cnName[s]).concat("cancel2"))
            .set("prompt", "天香：是否改变此牌的花色？")
            .set("ai", () => {
                if (desired && desired !== current && available.includes(desired)) return cnName[desired];
                return "cancel2";
            })
            .forResult();
        if (control == "cancel2") {
            event.result = { bool: false };
            return;
        }
        const suit = Object.keys(cnName).find(key => cnName[key] === control);
        event.result = { bool: true, cost_data: suit };
    },
    async content(event, trigger, player) {
        const suit = event.cost_data;
        if (!suit) return;
        const used = player.getStorage("hfhy_tianxiang_used", []);
        used.push(suit);
        player.storage.hfhy_tianxiang_used = used;
        trigger.card.suit = suit;
        trigger.card.color = (suit === "heart" || suit === "diamond") ? "red" : "black";
        game.log(player, "将", trigger.card, "的花色改为了", "#g" + ({ spade: "黑桃", heart: "红桃", club: "梅花", diamond: "方片" })[suit]);
    },
    group: ["hfhy_tianxiang_reset"],
    subSkill: {
        reset: {
            forced: true,
            popup: false,
            // global：无论是否一号位，每轮开始都重置改色记录
            trigger: { global: "roundStart" },
            async content(event, trigger, player) {
                player.storage.hfhy_tianxiang_used = [];
            },
            sub: true,
            sourceSkill: "hfhy_tianxiang",
            skill_id: "hfhy_tianxiang_reset",
            _priority: 0,
        },
    },
    skill_id: "hfhy_tianxiang",
    _priority: 0,
},
"hfhy_lianyin": {
    audio: ["sbjieyin1.mp3", "sbjieyin2.mp3", "sbjieyin3.mp3"],
    dutySkill: true,
    unique: true,
    initGroup: "wu",
    forced: true,
    mark: true,
    marktext: "姻",
    intro: {
        content(storage, player) {
            const target = guquLianyinTarget(player);
            const rec = player.getStorage("hfhy_lianyin_recover", 0);
            return (target ? "联姻对象：" + get.translation(target) : "未选择联姻对象") + "<br>联姻双方累计回复：" + rec + "/4";
        },
    },
    derivation: ["hfhy_xiaoji_gai", "hfhy_jiejiang"],
    forced: true,
    trigger: { global: "gameStart" },
    filter(event, player) {
        return !player.storage.hfhy_lianyin_target;
    },
    async content(event, trigger, player) {
        // forced 自动触发，由玩家主动选择联姻对象
        const result = await player.chooseTarget("联姻：选择一名其他男性角色", true)
            .set("filterTarget", (card, player2, target) => target != player2 && target.hasSex("male"))
            .set("ai", target => {
                const me = get.player();
                const att = get.attitude(me, target);
                if (att <= 0) return att;
                return att * 10 + get.threaten(target) + (target.maxHp - target.hp) * 2;
            })
            .forResult();
        if (result.bool && result.targets?.length) {
            player.storage.hfhy_lianyin_target = result.targets[0].playerid;
            player.markSkill("hfhy_lianyin");
            game.log(player, "选择了", result.targets[0], "作为联姻对象");
        }
    },
    group: ["hfhy_lianyin_use", "hfhy_lianyin_achieve", "hfhy_lianyin_fail"],
    subSkill: {
        use: {
            audio: ["sbjieyin1.mp3", "sbjieyin2.mp3", "sbjieyin3.mp3"],
            trigger: { player: "phaseZhunbeiBegin" },
            filter(event, player) {
                const target = guquLianyinTarget(player);
                if (!target || !target.isIn()) return false;
                if (!(player.isDamaged() || target.isDamaged())) return false;
                return player.countDiscardableCards(player, "h") > 0;
            },
            logTarget: () => guquLianyinTarget(get.player()),
            async cost(event, trigger, player) {
                const target = guquLianyinTarget(player);
                event.result = await player.chooseToDiscard("h", 1, "联姻：是否弃置一张手牌，令你与" + get.translation(target) + "各回复1点体力？")
                    .set("ai", card => {
                        const me = get.player();
                        let benefit = get.recoverEffect(me, me, me);
                        if (target && target.isIn()) {
                            benefit += get.recoverEffect(target, me, me);
                        }
                        if (me.isDamaged()) {
                            benefit += 1;
                            if (me.getStorage("hfhy_lianyin_recover", 0) >= 3) {
                                benefit += 6;
                            }
                        }
                        return benefit - get.value(card, me);
                    })
                    .forResult();
            },
            async content(event, trigger, player) {
                const target = guquLianyinTarget(player);
                // 先计数再回复：achieve 子技能在 recoverAfter 时机读取最新进度
                if (player.isDamaged()) {
                    player.storage.hfhy_lianyin_recover = player.getStorage("hfhy_lianyin_recover", 0) + 1;
                    await player.recover(1);
                }
                if (target && target.isIn() && target.isDamaged()) {
                    player.storage.hfhy_lianyin_recover = player.getStorage("hfhy_lianyin_recover", 0) + 1;
                    await target.recover(1);
                }
            },
            sub: true,
            sourceSkill: "hfhy_lianyin",
            skill_id: "hfhy_lianyin_use",
            _priority: 0,
        },
        achieve: {
            audio: ["sbjieyin1.mp3", "sbjieyin2.mp3", "sbjieyin3.mp3"],
            forced: true,
            skillAnimation: true,
            animationColor: "green",
            trigger: { global: "recoverAfter" },
            filter(event, player) {
                const target = guquLianyinTarget(player);
                return player.hasSkill("hfhy_xiaoji") &&
                    event.getParent().name == "hfhy_lianyin_use" &&
                    (event.player == player || event.player == target) &&
                    player.getStorage("hfhy_lianyin_recover", 0) >= 4;
            },
            async content(event, trigger, player) {
                player.awakenSkill("hfhy_lianyin");
                player.changeSkin({ characterName: "yong_sunshangxiang" }, "shu_yong_sunshangxiang");
                player.changeGroup("shu");
                await player.gainMaxHp(1);
                await player.recover(1);
                await player.removeSkill("hfhy_xiaoji");
                await player.addSkills("hfhy_xiaoji_gai");
                game.log(player, "使命成功：势力变更为蜀，【枭姬】升级为【枭姬·改】");
            },
            sub: true,
            sourceSkill: "hfhy_lianyin",
            skill_id: "hfhy_lianyin_achieve",
            _priority: 0,
        },
        fail: {
            audio: ["sbjieyin1.mp3", "sbjieyin2.mp3", "sbjieyin3.mp3"],
            forced: true,
            skillAnimation: true,
            animationColor: "gray",
            trigger: { global: "dying" },
            filter(event, player) {
                const target = guquLianyinTarget(player);
                return player.hasSkill("hfhy_xiaoji") && (event.player == player || (target && event.player == target));
            },
            async content(event, trigger, player) {
                player.awakenSkill("hfhy_lianyin");
                const target = guquLianyinTarget(player);
                player.changeHujia(1);
                if (target && target.isIn()) {
                    target.changeHujia(1);
                }
                await player.removeSkill("hfhy_xiaoji");
                await player.addSkills("hfhy_jiejiang");
                game.log(player, "使命失败：获得护甲，【枭姬】改为【截江】");
            },
            sub: true,
            sourceSkill: "hfhy_lianyin",
            skill_id: "hfhy_lianyin_fail",
            _priority: 0,
        },
    },
    skill_id: "hfhy_lianyin",
    _priority: 0,
},
"hfhy_xiaoji": {
    audio: ["sbxiaoji1.mp3", "sbxiaoji2.mp3"],
    zhuanhuanji: true,
    forced:true,
    mark: true,
    marktext: "☯",
    intro: {
        content(storage, player) {
            return storage ? "阴：当你失去装备区里的一张牌时，你可以摸两张牌" : "阳：当你于回合内使用一张装备牌后，可以视为使用一张无次数限制的【杀】";
        },
    },
    group: ["hfhy_xiaoji_supply", "hfhy_xiaoji_yang", "hfhy_xiaoji_yin"],
    subSkill: {
        supply: {
            audio: ["sbxiaoji1.mp3", "sbxiaoji2.mp3"],
            forced: true,
            trigger: { player: "phaseUseBegin" },
            filter(event, player) {
                return !player.getEquips(1).some(card => card.name == "hfhy_xueying");
            },
            async content(event, trigger, player) {
                // 友徐庶 friendxiaxing 范式：createCard2 + hasUseTarget/chooseUseTarget 守卫
                const card = game.createCard2("hfhy_xueying", "club", 2);
                await player.gain(card, "gain2");
                if (player.hasUseTarget(card) && player.getCards("h").includes(card) && get.name(card, player) == "hfhy_xueying") {
                    await player.chooseUseTarget(card, true, false);
                }
            },
            sub: true,
            sourceSkill: "hfhy_xiaoji",
            skill_id: "hfhy_xiaoji_supply",
            _priority: 0,
        },
        yang: {
            audio: ["sbxiaoji1.mp3", "sbxiaoji2.mp3"],
            forced:true,
            trigger: { player: "useCardAfter" },
            filter(event, player) {
                if (player.getStorage("hfhy_xiaoji", false)) return false;
                // 换装时阴已先结算并翻阳：同一张装备牌的使用不再触发阳（只按换装时刻的阴阳状态结算）
                if (event.hfhy_xiaoji_yin_done) return false;
                if (_status.currentPhase != player) return false;
                return event.card && get.type(event.card) == "equip";
            },
            async content(event, trigger, player) {
                const sha = get.autoViewAs({ name: "sha", isCard: true });
                const result = await player.chooseTarget("枭姬：是否视为使用一张无次数限制的【杀】？", false, (card, player2, target) => player2.canUse(sha, target))
                    .set("ai", target => get.effect(target, { name: "sha", isCard: true }, get.player(), get.player()))
                    .forResult();
                if (!result.bool || !result.targets?.length) {
                    return;
                }
                await player.useCard(get.autoViewAs({ name: "sha" }), result.targets, false);
                player.changeZhuanhuanji("hfhy_xiaoji");
            },
            sub: true,
            sourceSkill: "hfhy_xiaoji",
            skill_id: "hfhy_xiaoji_yang",
            _priority: 0,
        },
        yin: {
            audio: ["sbxiaoji1.mp3", "sbxiaoji2.mp3"],
            // 官方 xiaoji 范式：仅靠 player loseAfter 抓不全（换装备、异步失去、装备被他人获得）
            trigger: {
                player: "loseAfter",
                global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
            },
            frequent: true,
            filter(event, player) {
                return player.getStorage("hfhy_xiaoji", false) == true;
            },
            getIndex(event, player) {
                const evt = event.getl(player);
                if (evt?.player === player && evt.es) {
                    return evt.es.length;
                }
                return false;
            },
            async content(event, trigger, player) {
                // 本次失去若源自你使用装备牌（换装顶掉旧装备），标记该 useCard，令阳对本张装备牌不再生效
                const useCardEvt = event.getParent("useCard");
                if (useCardEvt && useCardEvt.player == player && useCardEvt.card && get.type(useCardEvt.card) == "equip") {
                    useCardEvt.set("hfhy_xiaoji_yin_done", true);
                }
                await player.draw(2);
                player.changeZhuanhuanji("hfhy_xiaoji");
            },
            ai: {
                noe: true,
                reverseEquip: true,
                effect: {
                    target(card, player, target, current) {
                        if (get.type(card) == "equip" && !get.cardtag(card, "gifts")) {
                            return [1, 3];
                        }
                    },
                },
            },
            sub: true,
            sourceSkill: "hfhy_xiaoji",
            skill_id: "hfhy_xiaoji_yin",
            _priority: 0,
        },
    },
    skill_id: "hfhy_xiaoji",
    _priority: 0,
},
"hfhy_xiaoji_gai": {
    audio: ["dcshuren1.mp3", "dcshuren2.mp3"],
    group: ["hfhy_xiaoji_gai_supply", "hfhy_xiaoji_gai_lose"],
    subSkill: {
        supply: {
            audio: ["dcshuren1.mp3", "dcshuren2.mp3"],
            forced: true,
            trigger: { player: "phaseUseBegin" },
            filter(event, player) {
                return !player.getEquips(1).some(card => card.name == "hfhy_xueying");
            },
            async content(event, trigger, player) {
                // 友徐庶 friendxiaxing 范式：createCard2 + hasUseTarget/chooseUseTarget 守卫
                const card = game.createCard2("hfhy_xueying", "club", 2);
                await player.gain(card, "gain2");
                if (player.hasUseTarget(card) && player.getCards("h").includes(card) && get.name(card, player) == "hfhy_xueying") {
                    await player.chooseUseTarget(card, true, false);
                }
            },
            sub: true,
            sourceSkill: "hfhy_xiaoji_gai",
            skill_id: "hfhy_xiaoji_gai_supply",
            _priority: 0,
        },
        lose: {
            audio: ["dcshuren1.mp3", "dcshuren2.mp3"],
            trigger: {
                player: "loseAfter",
                global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
            },
            frequent: true,
            filter(event, player) {
                const evt = event.getl(player);
                return evt?.player === player && evt.es?.length > 0;
            },
            getIndex(event, player) {
                const evt = event.getl(player);
                if (evt?.player === player && evt.es) {
                    return evt.es.length;
                }
                return false;
            },
            async cost(event, trigger, player) {
                const { control } = await player.chooseControl(["选项一", "选项二", "cancel2"])
                    .set("choiceList", ["回复1点体力", "令一名角色摸两张牌"])
                    .set("prompt", "枭姬·改：请选择一项")
                    .set("ai", () => {
                        const me = get.player();
                        return me.isDamaged() ? "选项一" : "选项二";
                    })
                    .forResult();
                event.result = { bool: control != "cancel2", cost_data: control };
            },
            async content(event, trigger, player) {
                if (event.cost_data == "选项一") {
                    await player.recover(1);
                    return;
                }
                const result = await player.chooseTarget("枭姬·改：令一名角色摸两张牌", true)
                    .set("ai", target => {
                        const me = get.player();
                        return get.attitude(me, target) > 0 ? 1 : -1;
                    })
                    .forResult();
                if (result.bool && result.targets?.length) {
                    await result.targets[0].draw(2);
                }
            },
            sub: true,
            sourceSkill: "hfhy_xiaoji_gai",
            skill_id: "hfhy_xiaoji_gai_lose",
            _priority: 0,
        },
    },
    skill_id: "hfhy_xiaoji_gai",
    _priority: 0,
},
"hfhy_jiejiang": {
    audio: ["xiaoji1.mp3", "xiaoji2.mp3"],
    groupSkill: "wu",
    trigger: { player: "useCardToPlayered" },
    filter(event, player) {
        return event.card && event.card.name == "sha" && event.target.countCards("e") > 0;
    },
    logTarget: "target",
    async cost(event, trigger, player) {
        event.result = await player.discardPlayerCard(trigger.target, "e", get.prompt("hfhy_jiejiang", trigger.target)).forResult();
    },
    async content(event, trigger, player) {
        const card = event.cards && event.cards[0];
        if (!card) return;
        const subtype = get.subtype(card);
        if (subtype == "equip1") {
            // 武器牌：摸两张牌
            await player.draw(2);
        } else if (subtype == "equip2") {
            // 防具牌：此伤害+1
            const useCardEvent = trigger.getParent("useCard");
            if (useCardEvent) {
                const targets = (useCardEvent.hfhy_jiejiang_damage_targets || []).slice();
                if (!targets.includes(trigger.target.playerid)) {
                    targets.push(trigger.target.playerid);
                }
                useCardEvent.set("hfhy_jiejiang_damage_targets", targets);
            }
        } else {
            // 坐骑牌：不可响应此【杀】
            trigger.getParent().directHit.push(trigger.target);
        }
    },
    group: ["hfhy_jiejiang_damage"],
    subSkill: {
        damage: {
            forced: true,
            popup: false,
            charlotte: true,
            trigger: { source: "damageBegin1" },
            filter(event, player) {
                if (!event.card || event.card.name != "sha") return false;
                const useCardEvent = event.getParent("useCard");
                return useCardEvent?.hfhy_jiejiang_damage_targets?.includes(event.player.playerid) == true;
            },
            async content(event, trigger, player) {
                trigger.num++;
            },
            sub: true,
            sourceSkill: "hfhy_jiejiang",
            skill_id: "hfhy_jiejiang_damage",
            _priority: 0,
        },
    },
    skill_id: "hfhy_jiejiang",
    _priority: 0,
},
// hfhy_xueying_skill 及其结束阶段弃置效果已随「血影挽歌」卡牌迁入 card.js（官方装备卡技能随卡注册范式）
"hfhy_shensu": {
    audio: ["sbshensu1.mp3", "sbshensu2.mp3", "shensu11.mp3", "shensu12.mp3"],
    // 官方 shensu1 范式：在 phaseXxxBefore 时机 trigger.cancel() 才能取消即将进行的阶段
    // （phaseXxxBegin 时阶段已开始，player.skip 只对未来的阶段生效）
    trigger: { player: ["phaseJudgeBefore", "phaseDrawBefore", "phaseUseBefore", "phaseDiscardBefore"] },
    filter(event, player) {
        // 跳过判定阶段的代价是弃一张手牌：无手牌不可跳（阶段已在跳过列表中的不再询问）
        if (event.name == "phaseJudge" && !player.countCards("h")) return false;
        return !player.skipList.includes(event.name);
    },
    async cost(event, trigger, player) {
        const phase = trigger.name;
        const phaseName = { phaseJudge: "判定", phaseDraw: "摸牌", phaseUse: "出牌", phaseDiscard: "弃牌" }[phase];
        event.result = await player.chooseBool(`神速：是否跳过${phaseName}阶段并视为使用一张无次数限制的基本牌？`)
            .set("ai", () => {
                const me = get.player();
                const canSha = game.hasPlayer(cur => get.attitude(me, cur) < 0 && me.canUse({ name: "sha", isCard: true }, cur) && get.effect(cur, { name: "sha", isCard: true }, me, me) > 0);
                const canTao = me.hp < me.maxHp;
                const useful = canSha || canTao;
                switch (phase) {
                    case "phaseJudge":
                        // 有延时锦囊必跳；能白嫖一张基本牌也跳
                        return (me.countCards("j") > 0 || useful) ? 1 : 0;
                    case "phaseDraw":
                        return useful ? 1 : 0;
                    case "phaseUse":
                        // 跳出牌损失正常出牌机会，仅在手牌匮乏或急需护甲时考虑
                        return (me.countCards("h") <= 1 || me.hp <= 2) && (useful || me.hujia < 4) ? 1 : 0;
                    case "phaseDiscard":
                        // 翻面在回合结束真实生效（失去下个回合）：仅当不跳过将弃置较多手牌时才值得
                        return me.needsToDiscard() >= 2 ? 1 : 0;
                    default:
                        return 0;
                }
            })
            .forResult();
        if (event.result.bool) event.result.cost_data = phase;
    },
    async content(event, trigger, player) {
        const phase = event.cost_data;
        // 官方 shensu1 范式：取消当前阶段事件即跳过
        trigger.cancel();
        const phaseName = { phaseJudge: "判定", phaseDraw: "摸牌", phaseUse: "出牌", phaseDiscard: "弃牌" }[phase];
        if (phaseName) game.log(player, "跳过了" + phaseName + "阶段");
        if (!Array.isArray(player.storage.hfhy_shensu_skipped)) player.storage.hfhy_shensu_skipped = [];
        player.storage.hfhy_shensu_skipped.push(phase);
        // 视为使用一张无次数限制的基本牌（canUse 不传 includecard 即不查次数）
        const basics = get.inpileVCardList(info => info[0] == "basic" && (info[2] == "sha" || info[2] == "tao"));
        if (basics.length) {
            const result = await player.chooseButton(["神速：视为使用一张无次数限制的基本牌", [basics, "vcard"]], true)
                .set("filterButton", button => {
                    const me = get.player();
                    const link = button.link;
                    if (link[2] == "tao") return me.hp < me.maxHp;
                    if (link[2] == "sha") return game.hasPlayer(cur => me.canUse({ name: "sha", nature: link[3], isCard: true }, cur));
                    return false;
                })
                .set("ai", button => {
                    const me = get.player();
                    const link = button.link;
                    if (link[2] == "tao") return 2 + (me.maxHp - me.hp) + (me.hp <= 2 ? 2 : 0);
                    const target = game.findPlayer(cur => me.canUse({ name: "sha", nature: link[3], isCard: true }, cur) && get.effect(cur, { name: "sha", isCard: true }, me, me) > 0);
                    return target ? get.effect(target, { name: "sha", isCard: true }, me, me) : -1;
                })
                .forResult();
            if (result.bool && result.links?.length) {
                const link = result.links[0];
                const card = get.autoViewAs({ name: link[2], nature: link[3], isCard: true });
                if (link[2] == "sha") {
                    const targets = await player.chooseTarget(true, "神速：选择【杀】的目标", (card2, player2, target) => player2.canUse({ name: "sha", nature: link[3], isCard: true }, target))
                        .set("ai", target => get.effect(target, { name: "sha", nature: link[3], isCard: true }, get.player(), get.player()))
                        .forResult();
                    if (targets.bool && targets.targets?.length) {
                        await player.useCard(card, targets.targets, false);
                    }
                } else {
                    await player.useCard(card, player);
                }
            }
        }
        // 跳过对应阶段的附加效果
        switch (phase) {
            case "phaseJudge": {
                if (player.countCards("h")) {
                    await player.chooseToDiscard("h", true, "神速：弃置一张手牌")
                        .set("ai", card => 5 - get.value(card))
                        .forResult();
                }
                break;
            }
            case "phaseDraw": {
                const pileBasics = Array.from(ui.discardPile.childNodes).filter(card => get.type(card) == "basic");
                if (pileBasics.length) {
                    const card = pileBasics.randomGet();
                    await player.gain(card, "gain2");
                    game.log(player, "从弃牌堆中获得了", card);
                }
                break;
            }
            case "phaseUse": {
                await player.changeHujia(1);
                break;
            }
            // 跳过弃牌阶段的翻面延迟到回合结束（restore）结算，避免被本轮复原直接抵消
        }
    },
    group: ["hfhy_shensu_damage", "hfhy_shensu_restore", "hfhy_shensu_reset"],
    subSkill: {
        damage: {
            // 本轮造成伤害计数（damageSource 在伤害结算末尾触发，num 已定值）
            forced: true,
            popup: false,
            trigger: { source: "damageSource" },
            filter(event, player) {
                return event.num > 0;
            },
            async content(event, trigger, player) {
                player.storage.hfhy_shensu_damage = (player.storage.hfhy_shensu_damage || 0) + trigger.num;
            },
            sub: true,
            sourceSkill: "hfhy_shensu",
            skill_id: "hfhy_shensu_damage",
            _priority: 0,
        },
        restore: {
            // 回合结束时：播报本轮跳过/伤害统计；本轮伤害 ≥ 本轮跳过阶段数 → 复原武将牌
            // 官方 xinshensu 调用的即 shensu1 组语音（shensu11/12）
            audio: ["shensu11.mp3", "shensu12.mp3"],
            forced: true,
            popup: false,
            trigger: { player: "phaseEnd" },
            filter(event, player) {
                const skipped = player.storage.hfhy_shensu_skipped;
                return Array.isArray(skipped) && skipped.length > 0;
            },
            async content(event, trigger, player) {
                const skipped = player.storage.hfhy_shensu_skipped;
                const damage = player.storage.hfhy_shensu_damage || 0;
                game.log(player, `本轮跳过了${skipped.length}个阶段，造成了${damage}点伤害`);
                if (damage >= skipped.length) {
                    if (player.isTurnedOver()) {
                        await player.turnOver();
                        game.log(player, "复原了武将牌");
                    }
                } else {
                    game.log(player, "未达到复原条件");
                }
                // 先结算复原，再应用跳过弃牌阶段的翻面：该翻面是真实代价，不会被本轮复原抵消
                if (skipped.includes("phaseDiscard") && player.isIn() && !player.isTurnedOver()) {
                    await player.turnOver();
                    game.log(player, "翻面");
                }
            },
            sub: true,
            sourceSkill: "hfhy_shensu",
            skill_id: "hfhy_shensu_restore",
            _priority: 0,
        },
        reset: {
            // 每轮开始清空本轮跳过阶段与伤害计数
            forced: true,
            popup: false,
            silent: true,
            trigger: { global: "roundStart" },
            async content(event, trigger, player) {
                player.storage.hfhy_shensu_skipped = [];
                player.storage.hfhy_shensu_damage = 0;
            },
            sub: true,
            sourceSkill: "hfhy_shensu",
            skill_id: "hfhy_shensu_reset",
            _priority: 0,
        },
    },
    skill_id: "hfhy_shensu",
    _priority: 0,
},
"hfhy_fengxi": {
    locked: true,
    audio: ["shensu11.mp3", "shensu12.mp3"],
    group: ["hfhy_fengxi_mark", "hfhy_fengxi_damage", "hfhy_fengxi_clear"],
    subSkill: {
        mark: {
            // 【杀】结算完毕未对目标造成伤害 → 目标获得“袭”
            forced: true,
            popup: false,
            trigger: { player: "shaAfter" },
            filter(event, player) {
                if (!event.targets || !event.targets.length) return false;
                return event.targets.some(target => target != player && target.isIn());
            },
            async content(event, trigger, player) {
                const marked = [];
                for (const target of trigger.targets) {
                    if (target == player || !target.isIn()) continue;
                    // trigger 是名为"sha"的卡牌结算事件，伤害是其直接子事件（官方 sb.js 双重校验范式）
                    const damaged = target.getHistory("damage", evt => evt.getParent() == trigger && evt.source == player).length > 0;
                    if (!damaged) {
                        target.addSkill("hfhy_xi");
                        target.addMark("hfhy_xi", 1, false);
                        target.markSkill("hfhy_xi");
                        marked.push(target);
                        game.log(target, "获得了1枚“袭”标记");
                    }
                }
                // popup:false 抑制了自动 logSkill，实际施加标记后手动触发（播风袭语音）
                if (marked.length) {
                    player.logSkill("hfhy_fengxi", marked);
                }
            },
            sub: true,
            sourceSkill: "hfhy_fengxi",
            skill_id: "hfhy_fengxi_mark",
            _priority: 0,
        },
        damage: {
            // 对拥有“袭”的目标造成【杀】伤害时：伤害+X 并移除其所有“袭”
            forced: true,
            popup: false,
            trigger: { source: "damageBegin1" },
            filter(event, player) {
                return event.card && event.card.name == "sha" && event.player != player && event.player.countMark("hfhy_xi") > 0;
            },
            async content(event, trigger, player) {
                const num = trigger.player.countMark("hfhy_xi");
                trigger.num += num;
                game.log(player, "对", trigger.player, "造成的伤害+" + num);
                trigger.player.removeMark("hfhy_xi", num);
                trigger.player.unmarkSkill("hfhy_xi");
                trigger.player.removeSkill("hfhy_xi");
            },
            sub: true,
            sourceSkill: "hfhy_fengxi",
            skill_id: "hfhy_fengxi_damage",
            _priority: 0,
        },
        clear: {
            // 准备阶段或死亡时移除场上所有“袭”
            forced: true,
            popup: false,
            forceDie: true,
            trigger: { player: ["phaseZhunbeiBegin", "dieAfter"] },
            async content(event, trigger, player) {
                for (const current of game.players.concat(game.dead || [])) {
                    const num = current.countMark("hfhy_xi");
                    if (num > 0) {
                        current.removeMark("hfhy_xi", num);
                        current.unmarkSkill("hfhy_xi");
                        current.removeSkill("hfhy_xi");
                    }
                }
                game.log(player, "移除了场上所有的“袭”标记");
            },
            sub: true,
            sourceSkill: "hfhy_fengxi",
            skill_id: "hfhy_fengxi_clear",
            _priority: 0,
        },
    },
    skill_id: "hfhy_fengxi",
    _priority: 0,
},
"hfhy_xi": {
    // 「袭」标记载体：风袭施加给目标角色的标记
    mark: true,
    marktext: "袭",
    intro: {
        content(storage, player) {
            return `拥有${player.countMark("hfhy_xi") || 0}枚“袭”标记`;
        },
    },
},
"hfhy_buqu": {
    audio: ["buqu1.mp3", "buqu2.mp3"],
    locked: true,
    // 手牌数上限=已损失体力值：maxHandcard mod 直接返回绝对值（怀幼范式）
    mod: {
        maxHandcard(player, num) {
            return player.getDamagedHp();
        },
    },
    trigger: { player: "dying" },
    forced: true,
    async content(event, trigger, player) {
        await player.loseMaxHp();
        await player.recover();
    },
    ai: {
        effect: {
            target(card, player, target) {
                // 仅影响“周泰对自己”使用回复/救命牌；队友救他不受影响
                if (player != target) return;
                if (!get.tag(card, "save") && !get.tag(card, "recover")) return;
                // 濒死时（不屈已不足）允许自救；平时靠“不屈”扛，不浪费桃
                if (target.isDying()) return;
                return 0;
            },
        },
    },
    skill_id: "hfhy_buqu",
    _priority: 0,
},
"hfhy_xuewei": {
    audio: ["fenji1.mp3", "fenji2.mp3"],
    trigger: { global: "useCardToTargeted" },
    filter(event, player) {
        if (!event.card || event.card.name != "sha") return false;
        const target = event.target;
        if (!target || !target.isIn()) return false;
        return get.distance(player, target) <= 1;
    },
    async cost(event, trigger, player) {
        const target = trigger.target;
        const user = trigger.player;
        event.result = await player.chooseBool(`血卫：是否失去1点体力，令${get.translation(user)}使用的【杀】对${get.translation(target)}无效？`)
            .set("ai", () => {
                const me = get.player();
                const eff = get.effect(target, { name: "sha", isCard: true }, user, me);
                if (target == me) {
                    // 自保：体力不足承受伤害时无效化（不屈可兜底回血）
                    return me.hp <= 1;
                }
                // 只保护队友：态度为正，且此【杀】确实对其不利（get.effect 从己方视角为负）
                if (get.attitude(me, target) <= 0) return false;
                const gain = -eff;
                if (gain <= 0) return false;
                // 体力越健康越愿意替队友挡刀；自己危险时要求更高收益
                if (me.hp > 2) return true;
                if (me.hp == 2) return gain >= 3;
                return gain >= 6;
            })
            .forResult();
    },
    async content(event, trigger, player) {
        // 濒死事件上有 filterStop（hp>0 即中止 arrangeTrigger），不屈先回血会导致排在其后的
        // 濒死时机技能被吞——不能用 dying 触发器补摸，改用引擎在进入濒死时打的 _dyinged 标记
        const loseEvt = player.loseHp(1);
        await loseEvt;
        // 令此【杀】对该目标无效（却敌同款：targets 移除 + excluded）
        trigger.getParent().excluded.add(trigger.target);
        trigger.targets.remove(trigger.target);
        if (loseEvt._dyinged) {
            await player.draw();
            game.log(player, "因“血卫”进入濒死状态，摸一张牌");
        }
    },
    ai: {
        expose: 0.2,
    },
    skill_id: "hfhy_xuewei",
    _priority: 0,
},
};
const GUQU_SUITS = ["spade", "heart", "club", "diamond"];
const GUQU_SYMBOL = { spade: "♠", heart: "♥", club: "♣", diamond: "♦" };
function guquRandomTyped(player, type) {
    const pool = Array.from(ui.cardPile.childNodes).sort(() => Math.random() - 0.5);
    return pool.find(card => get.type(card) === type) || null;
}
function guquLianyinTarget(player) {
    const pid = player.storage.hfhy_lianyin_target;
    return pid ? game.findPlayer(p => p.playerid === pid) : null;
}
function hfhy_tuxiBest(player, cards) {
    cards ??= player.getCards("h", card => lib.filter.cardDiscardable(card, player));
    if (cards.length < 2) return { x: 0, net: 0 };

    const sha = { name: "sha", isCard: true };
    // 每个潜在目标：距离 + 杀的收益（只算一次）
    const infos = game.filterPlayer(current => current !== player && current.isIn())
        .map(current => ({
            dist: get.distance(player, current),
            eff: get.effect(current, sha, player, player),
        }));

    const values = cards.map(card => get.value(card, player)).sort((a, b) => a - b);
    const COST_RATE = 0.3; // 弃牌代价折算系数，按实际手感调整

    let bestX = 0, bestNet = 0, cost = 0;
    for (let X = 1; X <= cards.length; X++) {
        cost += values[X - 1];
        if (X < 2) continue; // X=1 时没有距离小于1的目标
        let gain = 0;
        for (const info of infos) {
            if (info.dist < X) gain += info.eff;
        }
        const net = gain - cost * COST_RATE;
        if (net > bestNet) {
            bestNet = net;
            bestX = X;
        }
    }
    return { x: bestX, net: bestNet };
}
function hfhy_shishengCanBlockSkill(info, skill) {
    return !!info && !info.charlotte && !info.locked && !info.persevereSkill;
}
function hfhy_shishengHasBlockableSkill(target) {
    return target.getGainableSkills(hfhy_shishengCanBlockSkill).length > 0;
}
function hfhy_shishengSkillValue(target) {
    let value = 1;
    const event = _status.event;
    const backup = event?.skillRankPlayer;
    if (event) event.skillRankPlayer = target;
    try {
        for (const skill of target.getGainableSkills(hfhy_shishengCanBlockSkill)) {
            const rank = get.skillRank(skill);
            if (rank > value) value = rank;
        }
    } catch (e) {
        // 个别技能缺少配置时保持保底价值，避免 AI 评估中断
    } finally {
        if (event) {
            if (backup === undefined) delete event.skillRankPlayer;
            else event.skillRankPlayer = backup;
        }
    }
    return value;
}
export { skills };

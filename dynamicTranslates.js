import { lib, game, ui, get, ai, _status } from "noname";

const dynamicTranslates = {
	hfhy_wusheng(player) {
		if (player.storage._wusheng_lv2) {
			return "你可以将一张手牌当作【杀】使用或打出，若为基本牌转换此【杀】不计入次数。若为锦囊牌转换你摸一张牌。若为装备牌转换则不可响应。其他角色因〖武圣〗转换的【杀】受到伤害时，其弃置一张手牌。";
		}
		return "每轮限两次，你可以将一张手牌当作【杀】使用或打出，若为基本牌转换此【杀】不计入次数。若为锦囊牌转换你摸一张牌。若为装备牌转换则不可响应。";
	},
	hfhy_talang(player) {
    if (player.getStorage("_talang_lv2")) {
        return "锁定技。你计算与其他角色的距离-1；其他角色计算与你的距离+1；你受到的雷电伤害+1。其他与你距离为一的角色回合结束时，你摸一张牌。";
    }
    return "锁定技。其他角色计算与你的距离+1；你受到的雷电伤害+1。";
},
};
export default dynamicTranslates;

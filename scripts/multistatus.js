/*
 * Multi Token Status
 * https://github.com/cs96and/FoundryVTT-multistatus
 *
 * Copyright (c) 2022-2023 Alan Davies - All Rights Reserved.
 *
 * You may use, distribute and modify this code under the terms of the MIT license.
 *
 * You should have received a copy of the MIT license with this file. If not, please visit:
 * https://mit-license.org/
 */

Hooks.once("ready", () => {
	if (!game.modules.get('lib-wrapper')?.active) {
		ui.notifications.error("Multi Token Status requires the 'libWrapper' module. Please install and activate it", { permanant: true, console: true });
		return;
	}

	libWrapper.register('multistatus', 'TokenHUD.prototype._onToggleEffect', MultiStatus.onToggleEffect, 'MIXED');
});

class MultiStatus {
	static #isV10 = null;
	static #isV11 = null;

	static get isV10() {
		MultiStatus.#isV10 ??= !isNewerVersion("10", game.version ?? game.data.version);
		return MultiStatus.#isV10;
	}

	static get isV11() {
		MultiStatus.#isV11 ??= !isNewerVersion("11", game.version ?? game.data.version);
		return MultiStatus.#isV11;
	}

	static getTokenData(token) {
		return (MultiStatus.isV10 ? token.document : token.data);
	}

	static onToggleEffect(wrapper, event, options={}) {
		event.preventDefault();
		event.stopPropagation();

		const img = event.currentTarget;
		let effect = null;
		let hasStatus = null;

		if (img.dataset.statusId && this.object.actor) {
			effect = CONFIG.statusEffects.find(e => e.id === img.dataset.statusId);
			if (!effect) {
				// Handle dnd35/pf1e buffs, or other fallback processing
				return wrapper(event, options);
			}

			if (MultiStatus.isV11)
				hasStatus = (token) => token.actor.effects.some(e => e.statuses.has(effect.id));
			else
				hasStatus = (token) => token.actor.effects.some(e => e.getFlag("core", "statusId") === effect.id);
		} else {
			effect = img.getAttribute("src");
			hasStatus = (token) => {
				const tokenData = MultiStatus.getTokenData(token);
				return (options.overlay ? (tokenData.overlayEffect === effect) : tokenData.effects.some(e => e === effect));
			}
		}

		options.active = !hasStatus(this.object);

		const updatedActors = new Set();
		const promises = [];

		for (const token of canvas.tokens.controlled) {
			// If the same actor has multiple tokens, only update one of them if it's a core status effect.
			// Also, only enable/disable the effect if it's not already enabled/disabled.
			const actor = token.actor;
			if ((!effect.id || !updatedActors.has(actor)) && (options.active !== hasStatus(token))) {
				promises.push(token.toggleEffect(effect, options));
				updatedActors.add(actor);
			}
		}

		return Promise.all(promises);
	}
}

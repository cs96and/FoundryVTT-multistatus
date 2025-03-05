/*
 * Multi Token Status
 * https://github.com/cs96and/FoundryVTT-multistatus
 *
 * Copyright (c) 2022-2025 Alan Davies - All Rights Reserved.
 *
 * You may use, distribute and modify this code under the terms of the MIT license.
 *
 * You should have received a copy of the MIT license with this file. If not, please visit:
 * https://mit-license.org/
 */

class MultiStatus {
	static #isV11 = null;
	static #isV12 = null;
	static #hasDfreds = null;

	static {
		Hooks.once("ready", () => {
			if (!game.modules.get('lib-wrapper')?.active) {
				ui.notifications.error("Multi Token Status requires the 'libWrapper' module. Please install and activate it", { permanant: true, console: true });
				return;
			}

			if (MultiStatus.isV12) {
				Hooks.on("renderTokenHUD", MultiStatus.onRenderTokenHUD);
				libWrapper.register('multistatus', 'Actor.prototype.toggleStatusEffect', MultiStatus.Actor_toggleStatusEffect, 'WRAPPER');
			} else {
				libWrapper.register('multistatus', 'TokenHUD.prototype._onToggleEffect', MultiStatus.onToggleEffect, 'MIXED');
				libWrapper.ignore_conflicts('multistatus', 'dfreds-convenient-effects', 'TokenHUD.prototype._onToggleEffect');
			}		
		});
	}

	static get isV11() {
		MultiStatus.#isV11 ??= !foundry.utils.isNewerVersion("11", game.version);
		return MultiStatus.#isV11;
	}

	static get isV12() {
		MultiStatus.#isV12 ??= !foundry.utils.isNewerVersion("12", game.version);
		return MultiStatus.#isV12;
	}

	static get hasDfreds() {
		MultiStatus.#hasDfreds ??= !!game.modules.get('dfreds-convenient-effects')?.active;
		return MultiStatus.#hasDfreds;
	}

	//
	// v10 and v11 handling
	//

	static async onToggleEffect(wrapper, event, options={}) {
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
				return (options.overlay ? (token.document.overlayEffect === effect) : token.document.effects.some(e => e === effect));
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
				// If this is a DFred's Convenient Effect, then handle by calling the correct DFred's function.
				if (MultiStatus.hasDfreds && effect.id.startsWith('Convenient Effect: ')) {
					promises.push(game.dfreds.statusEffects.onToggleEffect({token, wrapper, args: [event, options]}));
				} else {
					promises.push(token.toggleEffect(effect, options));
				}
				updatedActors.add(actor);
			}
		}

		return Promise.all(promises);
	}

	//
	// v12 handling
	//

	static #isOnToggleEffect = false;
	static #callDepth = 0;

	// TokenHUD.#onToggleEffect is private in v12, so we have to override TokenHUD.activateListeners instead,
	// to get it to call our own version of TokenHUD_onToggleEffect.
	static onRenderTokenHUD(app, html, data) {
		const effectsTray = html.find(".status-effects");

		// Replace the click handlers...
		effectsTray.off("click", ".effect-control");
		effectsTray.on("click", ".effect-control", MultiStatus.TokenHUD_onToggleEffect.bind(app));
		effectsTray.off("contextmenu", ".effect-control");
		effectsTray.on("contextmenu", ".effect-control", event => MultiStatus.TokenHUD_onToggleEffect.call(app, event, {overlay: true}));
	}

	// Copy of core TokenHUD.#onToggleEffect, but we set the #isOnToggleEffect flag for the duration of the call.
	static TokenHUD_onToggleEffect(event, {overlay=false}={}) {
		try
		{
			// Set a flag so that Actor_toggleStatusEffect knows it is being called from TokenHUD_onToggleEffect.
			MultiStatus.#isOnToggleEffect = true;

			event.preventDefault();
			event.stopPropagation();
			if ( !this.actor ) return ui.notifications.warn("HUD.WarningEffectNoActor", {localize: true});
			const statusId = event.currentTarget.dataset.statusId;
			this.actor.toggleStatusEffect(statusId, {overlay});
		} finally {
			MultiStatus.#isOnToggleEffect = false;
		}
	}

	static async Actor_toggleStatusEffect(wrapper, statusId, options) {
		try
		{
			// The call to token.actor.toggleStatusEffect below will recurse into this function again (because it's wrapped).
			// We only want to do our custom handling if this is the first time it has been called
			// and it's been called via TokenHUD_onToggleEffect
			if ((++MultiStatus.#callDepth > 1) || !MultiStatus.#isOnToggleEffect) {
				return wrapper(statusId, options);
			}

			const selectedActor = this;
			const updatedActors = new Set();

			let result = undefined;
			options.active = !selectedActor.statuses.has(statusId);

			for (const token of canvas.tokens.controlled) {
				// If the same actor has multiple tokens, only update one of them.
				// Also, only enable/disable the effect if it's not already enabled/disabled.
				if (!updatedActors.has(token.actor) && (options.active !== token.actor.statuses.has(statusId))) {
					if (token.actor === selectedActor) {
						result = wrapper(statusId, options);
					} else {
						token.actor.toggleStatusEffect(statusId, options);
					}
					updatedActors.add(token.actor);
				}
			}

			// Return the result of the token that was actually clicked.
			return result;

		} finally {
			--MultiStatus.#callDepth;
		}
	}
}

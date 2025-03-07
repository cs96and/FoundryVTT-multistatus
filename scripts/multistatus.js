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

class Utils {
	static #isV11 = null;
	static #isV12 = null;
	static #isV13 = null;
	static #hasDfreds = null;

	static get isV11() {
		Utils.#isV11 ??= !foundry.utils.isNewerVersion("11", game.version);
		return Utils.#isV11;
	}

	static get isV12() {
		Utils.#isV12 ??= !foundry.utils.isNewerVersion("12", game.version);
		return Utils.#isV12;
	}

	static get isV13() {
		Utils.#isV13 ??= !foundry.utils.isNewerVersion("13", game.version);
		return Utils.#isV13;
	}

	static get hasDfreds() {
		Utils.#hasDfreds ??= !!game.modules.get('dfreds-convenient-effects')?.active;
		return Utils.#hasDfreds;
	}
}

class MultiStatus {
	static {
		Hooks.once("ready", () => {
			if (!game.modules.get('lib-wrapper')?.active) {
				ui.notifications.error("Multi Token Status requires the 'libWrapper' module. Please install and activate it", { permanant: true, console: true });
				return;
			}

			if (Utils.isV12) {
				Hooks.on("renderTokenHUD", MultiStatus.onRenderTokenHUD);
				libWrapper.register('multistatus', 'Actor.prototype.toggleStatusEffect', MultiStatus.Actor_toggleStatusEffect, 'WRAPPER');
			} else {
				libWrapper.register('multistatus', 'TokenHUD.prototype._onToggleEffect', MultiStatus.onToggleEffect, 'MIXED');
				libWrapper.ignore_conflicts('multistatus', 'dfreds-convenient-effects', 'TokenHUD.prototype._onToggleEffect');
			}		
		});
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

			if (Utils.isV11)
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
				if (Utils.hasDfreds && effect.id.startsWith('Convenient Effect: ')) {
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
	// v12 and v13 handling
	//

	static #isOnToggleEffect = false;
	static #callDepth = 0;

	// TokenHUD.#onToggleEffect is private in v12, so we have to override TokenHUD.activateListeners instead,
	// to get it to call our own version of TokenHUD_onToggleEffect.
	static onRenderTokenHUD(app, html, data) {
		const element = Utils.isV13 ? html : html[0];
		const effectsTray = element.querySelector(".status-effects");

		effectsTray.addEventListener("click",
			MultiStatus.TokenHUD_onToggleEffect.bind(app),
			{ capture: true });

		effectsTray.addEventListener("contextmenu",
			event => MultiStatus.TokenHUD_onToggleEffect.call(app, event, {overlay: true}),
			{ capture: true });
	}

	// Copy of core TokenHUD.#onToggleEffect, but we set the #isOnToggleEffect flag for the duration of the call.
	static async TokenHUD_onToggleEffect(event, options={}) {
		const target = event.target;
		const statusId = target.dataset.statusId;

		if (statusId != null) {
			try
			{
				// Set a flag so that Actor_toggleStatusEffect knows it is being called from TokenHUD_onToggleEffect.
				MultiStatus.#isOnToggleEffect = true;

				event.preventDefault();
				event.stopPropagation();

				// `this` is a TokenHUD here
				if (!this.actor)
					return ui.notifications.warn("HUD.WarningEffectNoActor", {localize: true});

				options.active = !target.classList.contains("active");
				await this.actor.toggleStatusEffect(statusId, options);
			} finally {
				MultiStatus.#isOnToggleEffect = false;
			}
		}
	}

	static async Actor_toggleStatusEffect(wrapper, statusId, options={}) {
		try
		{
			// The call to token.actor.toggleStatusEffect below will recurse into this function again (because it's wrapped).
			// We only want to do our custom handling if this is the first time it has been called
			// and it's been called via TokenHUD_onToggleEffect
			if ((++MultiStatus.#callDepth > 1) || !MultiStatus.#isOnToggleEffect) {
				return wrapper(statusId, options);
			}

			const updatedActors = new Set();

			let result = undefined;
			options.active ??= !this.statuses.has(statusId);

			for (const token of canvas.tokens.controlled) {
				// If the same actor has multiple tokens, only update one of them.
				if (!updatedActors.has(token.actor)) {
					if (token.actor === this) {
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

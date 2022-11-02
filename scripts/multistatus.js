/*
 * Multi Token Status
 * https://github.com/cs96and/FoundryVTT-multistatus
 *
 * Copyright (c) 2021-2022 Alan Davies - All Rights Reserved.
 *
 * You may use, distribute and modify this code under the terms of the MIT license.
 *
 * You should have received a copy of the MIT license with this file. If not, please visit:
 * https://mit-license.org/
 */

Hooks.once("setup", () => {
	Hooks.on("preCreateActiveEffect", MultiSelect.onPreCreateActiveEffect);
	Hooks.on("preDeleteActiveEffect", MultiSelect.onPreDeleteActiveEffect);
});

class MultiSelect {
	/**
	 * Handle the preCreateActiveEffect hook.
	 */
	static onPreCreateActiveEffect(document, data, options, userId) {
		// Prevent infinite recursion
		if (data.flags?.multistatus?.create) return;

		// Check this is a HUD status effect
		const statusId = data.flags?.core?.statusId;
		if (!statusId || !CONFIG.statusEffects.some(e => e.id === statusId)) return;

		const originalActor = document.parent;

		const newData = {
			id: data.flags.core.statusId,
			label: data.label,
			icon: data.icon,
			flags: {
				multistatus: { create: true } // flag to prevent infinite recursion
			}
		}

		const newOptions = { active: true }

		if ("overlay" in data.flags?.core)
			newOptions.overlay = data.flags.core.overlay;

		for (const tkn of canvas.tokens.controlled) {
			// Don't re-add the status to the actor that it was just added to
			if (tkn.actor !== originalActor) {
				// Check that the actor doesn't already have the status
				if (!tkn.actor.effects.some(effect => effect.flags?.core?.statusId === newData.id))
					tkn.document.toggleActiveEffect(newData, newOptions);
			}
		}
	}

	/**
	 * Handle the preDeleteActiveEffect hook.
	 */
	static onPreDeleteActiveEffect(document, options, userId) {
		// Prevent infinite recursion
		if (document.flags?.multistatus?.del) return;

		// Check this is a HUD status effect
		const statusId = document.flags?.core?.statusId;
		if (!statusId || !CONFIG.statusEffects.some(e => e.id === statusId)) return;

		const originalActor = document.parent;
		const newData = { id: document.flags.core.statusId }
		const newOptions = { active: false }

		for (const tkn of canvas.tokens.controlled) {
			// Don't re-delete the status from the actor that it was just removed from
			if (tkn.actor !== originalActor) {
				const effect = tkn.actor.effects.find(effect => effect.flags?.core?.statusId === newData.id)
				if (effect) {
					// Don't use setFlag.  We don't need to update the database, just the local instance
					effect.flags.multistatus ??= {};
					effect.flags.multistatus.del = true;
					tkn.document.toggleActiveEffect(newData, newOptions);
				}
			}
		}
	}
}

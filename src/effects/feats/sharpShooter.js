import { baseFeatEffect } from "../specialFeats.js";

export function sharpShooterEffect(document) {
  let effect = baseFeatEffect(document, `${document.name} - Range Adjustment`, { transfer: true });

  effect.changes.push(
    // changes range
    {
      key: "flags.midi-qol.sharpShooter",
      value: "1",
      mode: CONST.ACTIVE_EFFECT_MODES.ADD,
      priority: 30,
    },
    {
      key: "flags.dnd5e.helpersIgnoreCover",
      value: "2",
      mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
      priority: 30,
    },
  );

  document.effects.push(effect);
  document.system.activation = {
    "type": "none",
    "cost": 1,
    "condition": ""
  };

  document.system["target"]["type"] = "self";
  document.system.range = { value: null, units: "self", long: null };
  document.system.actionType = "other";

  const midiFlags = {
    "effectActivation": false,
    "forceCEOff": false,
    "forceCEOn": true,
    "removeAttackDamageButtons": "default",
  };

  setProperty(document, "flags.midi-qol", midiFlags);
  setProperty(document, "flags.midiProperties.toggleEffect", true);

  return document;
}

import DICTIONARY from "../../dictionary.js";
import { addSimpleConditionEffect, baseEnchantmentEffect, generateEffects } from "../../effects/effects.js";
// import CompendiumHelper from "../../lib/CompendiumHelper.js";
import { DDBCompendiumFolders } from "../../lib/DDBCompendiumFolders.js";
import DDBHelper from "../../lib/DDBHelper.js";
import DDBItemImporter from "../../lib/DDBItemImporter.js";
import { parseDamageRolls, parseTags } from "../../lib/DDBReferenceLinker.js";
import utils from "../../lib/utils.js";
import logger from "../../logger.js";
import DDBAction from "./DDBAction.js";
import DDBAttackAction from "./DDBAttackAction.js";
import { addExtraEffects } from "./fixes.js";

export class DDBInfusion {

  _init() {
    logger.debug(`Generating Infusion Feature ${this.ddbInfusion.name}`);
  }

  _generateDataStub() {

    this.data = {
      _id: utils.namedIDStub(this.name, { postfix: this.nameIdPostfix }),
      name: utils.nameString(`Infusion: ${this.name}`),
      type: this.documentType,
      system: utils.getTemplate(this.documentType),
      effects: [],
      flags: {
        ddbimporter: {
          id: this.ddbInfusion.id,
          infusionId: this.ddbInfusion.id,
          class: "Artificer",
          infusionFeature: true,
          type: this.tagType,
          dndbeyond: {
            defintionKey: this.ddbInfusion.definitionKey,
            requiredLevel: this.ddbInfusion.level,
            modifierType: this.ddbInfusion.modifierDataType,
            type: this.ddbInfusion.type,
            requiresAttunement: this.ddbInfusion.requiresAttunement,
            allowDuplicates: this.ddbInfusion.allowDuplicates,
          },
        },
      }
    };

    this.requiredLevel = null;
    const requiredLevel = foundry.utils.getProperty(this.ddbInfusion, "level");
    if (Number.isInteger(Number.parseInt(requiredLevel))) {
      this.data.system.prerequisites = {
        level: Number.parseInt(requiredLevel),
      };
      this.requiredLevel = Number.parseInt(requiredLevel);
    }

    this.data.system.consume = {
      type: "charges",
      target: "",
      amount: "1",
      scale: false,
    };
    this.data.system.enchantment = {
      items: {
        max: "",
        period: "",
      },
      restrictions: {
        type: "",
        allowMagical: false
      },
      classIdentifier: "",
    };
    this.data.system.source = DDBHelper.parseSource(this.ddbInfusion);
    this.data.system.activation.type = "none";
    if (this.requiredLevel && this.requiredLevel > 1) {
      this.data.system.requirements = ` ${utils.ordinalSuffixOf(this.requiredLevel)}-level Artificer`;
    }
  }

  constructor({ ddbData, ddbInfusion, documentType = "feat", rawCharacter = null, noMods = false, addToCompendium = true, nameIdPostfix = null } = {}) {
    this.ddbData = ddbData;
    this.rawCharacter = rawCharacter;
    this.ddbInfusion = ddbInfusion;
    this.name = utils.nameString(this.ddbInfusion.name);
    this.type = "feat";
    this.isAction = false;
    this.documentType = documentType;
    this.tagType = "infusion";
    this.data = {};
    this.actions = [];
    this.grantedItems = [];
    this.noMods = noMods;
    this.idNames = [];
    this.compendium = null;
    this._init();
    this._generateDataStub();
    this.addToCompendium = addToCompendium;
    this.nameIdPostfix = nameIdPostfix;
  }

  _buildDescription() {
    const chatSnippet = this.ddbInfusion.snippet ? this.ddbInfusion.snippet : "";
    const chatAdd = game.settings.get("ddb-importer", "add-description-to-chat");
    const itemText = foundry.utils.getProperty(this.ddbInfusion, "itemRuleData.text");
    const prerequisitesHeader = this.requiredLevel && this.requiredLevel > 1
      ? `<p><i>Prerequisites: ${utils.ordinalSuffixOf(this.requiredLevel)}-level Artificer</i></p>`
      : "";
    const itemHeader = itemText
      ? `<p><i>Item: ${itemText}</i></p>`
      : "";

    const valueDamageText = parseDamageRolls({ text: this.ddbInfusion.description, document: this.data, actor: null });
    const chatDamageText = chatAdd ? parseDamageRolls({ text: chatSnippet, document: this.data, actor: null }) : "";
    this.data.system.description = {
      value: parseTags(prerequisitesHeader + itemHeader + valueDamageText),
      chat: chatAdd ? parseTags(chatDamageText) : "",
    };
  }

  _generateSystemType() {
    foundry.utils.setProperty(this.data, "system.type.value", "enchantment");
    foundry.utils.setProperty(this.data, "system.type.subtype", "artificerInfusion");
  }

  _generateEnchantmentType() {
    if (this.ddbInfusion.type === "replicate") {
      foundry.utils.setProperty(this.data, "system.enchantment.restrictions.allowMagical", true);
    }
    let type = "";
    const itemRule = foundry.utils.getProperty(this.ddbInfusion, "itemRuleData.text");
    if (!itemRule) return;
    if (itemRule.includes("weapon")) type = "weapon";
    else if (itemRule.includes("armor")) type = "equipment";
    else if (itemRule.includes("shield")) type = "equipment";
    else if (itemRule.includes("gem")) type = "loot";
    // tool, equipment, consumable, loot, container, weapon
    foundry.utils.setProperty(this.data, "system.enchantment.restrictions.type", type);
  }

  _generateActionType() {
    if (["augment", "replicate"].includes(this.ddbInfusion.type)) {
      this.data.system.actionType = "ench";
    } else if (this.ddbInfusion.type === "creature") {
      this.data.system.actionType = "summon";
      this.data.system.activation = {
        type: "action",
        cost: 1,
      };
    }
  }

  async compendiumInit() {
    this.compendiumFolders = new DDBCompendiumFolders("features");
    await this.compendiumFolders.loadCompendium("features");
  }

  async addInfusionsToCompendium(documents) {
    const featureHandlerOptions = {
      chrisPremades: false,
      deleteBeforeUpdate: false,
      removeSRDDuplicates: false,
      filterDuplicates: false,
      matchFlags: ["infusionId"],
      useCompendiumFolders: true,
    };

    logger.debug(`Creating infusion compendium feature`, {
      documents,
      featureHandlerOptions,
      addToCompendium: this.addToCompendium,
      this: this,
    });
    const featureHandler = this.addToCompendium
      ? await DDBItemImporter.buildHandler("features", documents, true, featureHandlerOptions)
      : new DDBItemImporter("features", documents, featureHandlerOptions);
    await featureHandler.buildIndex({
      fields: [
        "name",
        "flags.ddbimporter.classId",
        "flags.ddbimporter.class",
        "flags.ddbimporter.subClass",
        "flags.ddbimporter.parentClassId",
        "flags.ddbimporter.featureName",
        "flags.ddbimporter.infusionId",
      ],
    });
    const compendiumFeatures = await featureHandler.compendiumIndex.filter((i) =>
      featureHandler.documents.some((orig) => i.name === orig.name)
    );
    return compendiumFeatures;
  }

  _buildActions() {
    // build actions fomr this.ddbInfusion.actions
    // for example radiant weapon reaction
    if (!this.ddbInfusion.actions) return;

    for (const actionData of this.ddbInfusion.actions) {
      // const itemLookup = ddb.infusions.item.find((mapping) => mapping.definitionKey === infusionDetail.definitionKey);
      if (!actionData.name) {
        const activationType = foundry.utils.getProperty(actionData, "activation.activationType");
        const postfix = [3, 4].includes(activationType)
          ? ` (${utils.capitalize(DICTIONARY.actions.activationTypes.find((a) => a.id === activationType).value)})`
          : "";
        actionData.name = `${this.name}${postfix}`;
      }
      const action = DDBHelper.displayAsAttack(this.ddbData, actionData, this.rawCharacter)
        ? new DDBAttackAction({ ddbData: this.ddbData, ddbDefinition: actionData, rawCharacter: this.rawCharacter, type: actionData.actionSource })
        : new DDBAction({ ddbData: this.ddbData, ddbDefinition: actionData, rawCharacter: this.rawCharacter });
      action.build();
      foundry.utils.setProperty(action.data, "flags.ddbimporter.class", "Artificer");
      foundry.utils.setProperty(action.data, "flags.ddbimporter.infusionFeature", true);
      foundry.utils.setProperty(action.data, "flags.ddbimporter.infusionId", actionData.id);
      action._id = utils.namedIDStub(actionData.name);
      this.actions.push(action.data);
    }
    logger.debug(`Generated Infusions Actions`, this.actions);
  }

  async _addActionsToEffects() {
    if (this.actions.length === 0) return;
    const cItems = await this.addInfusionsToCompendium(this.actions);
    if (cItems.length === 0) return;

    const descriptions = this.ddbInfusion.actions.map((i) => `[[/item ${i.name}]]`);

    const uuids = cItems.map((i) => i.uuid);
    this.data.effects.forEach((e) => {
      if (e.flags.ddbimporter?.infusion) e.flags.dnd5e.enchantment.riders.item.push(...uuids);
      e.changes.push({
        key: "system.description.value",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: `<hr> <br><h2>Infusion Actions</h2><p> ${descriptions.join(", ")} </p>`,
      });
    });
  }

  _specials() {
    // handle special cases
    // e.g. radiant weapon blindness effect

    switch (this.name) {
      // example
      case "Radiant Weapon": {
        break;
      }
      // no default
    }


    for (let action of this.actions) {
      const name = foundry.utils.getProperty(action, "flags.ddbimporter.originalName") ?? action.name;
      switch (name) {
        case "Radiant Weapon (Reaction)": {
          action = addSimpleConditionEffect(action, "Blinded", { transfer: false });
          break;
        }
        // no default
      }
    }

  }

  _getEnchantmentEffect(modifierData, { useModifierLabelName = false, useOrigin = false } = {}) {
    const label = modifierData.name ?? this.name;
    const foundryItem = foundry.utils.deepClone(this.data);
    foundryItem.effects = [];
    const effect = baseEnchantmentEffect(foundryItem, label, {
      origin: useOrigin ? `Item.${this.data._id}` : null,
    });
    effect.flags.ddbimporter.infusion = true;
    const modifiers = foundry.utils.deepClone(modifierData.modifiers) ?? [];
    const modifierItem = {
      definition: {
        name: this.name,
        grantedModifiers: modifiers.filter((mod) =>
          !(mod.type === "bonus" && mod.subType === "armor-class")
          && !(mod.type === "bonus" && mod.subType === "magic")
        ),
      },
    };

    const mockItem = generateEffects(this.ddbData, this.rawCharacter, modifierItem, foundryItem, this.noMods, "infusion");
    if (mockItem.effects.length > 0) effect.changes = mockItem.effects.map((e) => e.changes).flat(1);

    effect.changes.push(...this._getMagicBonusChanges(modifiers));

    if (this.ddbInfusion.requiresAttunement) {
      effect.changes.push({
        key: "system.attunement",
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: "required",
      });
    }

    const nameLabel = this.ddbInfusion.type === "replicate"
      ? `: Replicated [Infusion]`
      : `: ${useModifierLabelName ? label : this.name} [Infusion]`;
    effect.changes.push(
      {
        key: "name",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: nameLabel,
        priority: 20,
      }
    );
    return effect;
  }

  _generateEnchantmentStubEffect() {
    const useModifierLabelName = ["damage-type-choice"].includes(this.ddbInfusion.modifierDataType);
    const effect = this._getEnchantmentEffect([], {
      useModifierLabelName,
    });
    this.data.effects.push(effect);
  }

  _addDescriptionToEffect(effect) {
    effect.changes.push({
      key: "system.description.value",
      mode: CONST.ACTIVE_EFFECT_MODES.ADD,
      value: `<hr> <br> ${this.ddbInfusion.description}`,
    });
  }

  _generateEnchantmentEffects() {
    const useModifierLabelName = ["damage-type-choice"].includes(this.ddbInfusion.modifierDataType);
    for (const [index, effectData] of this.ddbInfusion.modifierData.entries()) {
      const effect = this._getEnchantmentEffect(effectData, {
        useModifierLabelName,
      });

      switch (this.ddbInfusion.modifierDataType) {
        case "class-level": {
          const minLevel = effectData.value;
          const maxLevel = index < this.ddbInfusion.modifierData.length - 1
            ? (this.ddbInfusion.modifierData[index + 1].value ?? null)
            : null;
          const level = {
            min: minLevel,
            max: maxLevel,
          };
          foundry.utils.setProperty(effect, "flags.dnd5e.enchantment.level", level);
          effect.description = this.ddbInfusion.snippet;
          this._addDescriptionToEffect(effect);
          break;
        }
        case "granted": {
          effect.description = this.ddbInfusion.snippet;
          this._addDescriptionToEffect(effect);
          break;
        }
        case "damage-type-choice": {
          effect.description = this.ddbInfusion.snippet;
          this._addDescriptionToEffect(effect);
          break;
        }
        default: {
          this._addDescriptionToEffect(effect);
          logger.debug(`Infusion ${this.name} has no additional config`);
        }
      }

      this.data.effects.push(effect);
    }

  }

  _getMagicBonusChanges(modifiers) {
    const filteredModifiers = DDBHelper.filterModifiersOld(modifiers, "bonus", "magic");
    const magicBonus = DDBHelper.getModifierSum(filteredModifiers, this.rawCharacter);

    const acFilteredModifiers = DDBHelper.filterModifiersOld(modifiers, "bonus", "armor-class");
    const acMagicalBonus = DDBHelper.getModifierSum(acFilteredModifiers, this.rawCharacter);

    const changes = [];
    if (magicBonus && magicBonus !== 0 && magicBonus !== "") {
      changes.push(
        {
          key: "system.magicalBonus",
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: magicBonus,
          priority: 20,
        },
      );
    }
    if (acMagicalBonus && acMagicalBonus !== 0 && acMagicalBonus !== "") {
      changes.push(
        {
          key: "system.armor.magicalBonus",
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: acMagicalBonus,
          priority: 20,
        },
      );
    }

    // all items infused become magical
    changes.push({
      key: "system.properties",
      mode: CONST.ACTIVE_EFFECT_MODES.ADD,
      value: "mgc",
      priority: 20,
    });
    return changes;
  }

  _generateEnchantments() {
    if ((this.data.system.actionType !== "ench")) return;

    this._generateEnchantmentEffects();

    switch (this.ddbInfusion.modifierDataType) {
      case "granted":
      default: {
        if (this.data.effects.length === 0) this._generateEnchantmentStubEffect();
      }
    }
  }

  async _addExtraEffects() {
    this.data = await addExtraEffects(this.ddbData, [this.data], this.rawCharacter)[0];
    this.actions = await addExtraEffects(this.ddbData, this.actions, this.rawCharacter);
  }

  // _generateSummons() {
  //   // summons are generated elsewhere and linked to the feature, not handled her.
  // }

  async build() {
    await this.compendiumInit();
    this._generateSystemType();
    this._generateEnchantmentType();
    this._generateActionType();
    this._buildDescription();
    this._generateEnchantments();
    this._buildActions();
    this._specials();
    // await this._addExtraEffects();
    await this._addActionsToEffects();

    await this.addInfusionsToCompendium([this.data]);

    logger.debug(`DDBInfusions for ${this.name}`, {
      data: foundry.utils.deepClone(this.data),
      actions: foundry.utils.deepClone(this.actions),
      this: this,
    });
  }

}

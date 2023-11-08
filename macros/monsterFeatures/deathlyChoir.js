if (args[0].macroPass === "preambleComplete") {
    if (workflow.targets.size === 0) return;
    let validTargets = [];
    for (let i of Array.from(workflow.targets)) {
      const nullEffects = game.modules.get("ddb-importer").api.effects.findEffects(i.actor, ["Deafened", "Dead", "Mind Blank"]);
      if (nullEffects.length > 0) continue;
      validTargets.push(i.id);
    }
    game.modules.get("ddb-importer").api.effects.updateTargets(validTargets);
}

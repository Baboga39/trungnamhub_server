const fs = require("fs");
const path = require("path");

const templatesDir = path.join(__dirname, "templates");

const reportRegistry = {};
const reportConfigs = [];

fs.readdirSync(templatesDir).forEach((file) => {
  if (file.endsWith(".js")) {
    const template = require(path.join(templatesDir, file));
    
    // Register the logical handler
    reportRegistry[template.id] = template.handler;
    
    // Push the metadata layout for Frontend
    reportConfigs.push({
      id: template.id,
      name: template.name,
      description: template.description,
      icon: template.icon,
      color: template.color,
      inputs: template.inputs
    });
  }
});

module.exports = {
  reportRegistry,
  reportConfigs
};

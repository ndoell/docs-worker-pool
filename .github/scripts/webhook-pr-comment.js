const fs = require('fs');

module.exports = ({ github }) => {
  const outputsFile = fs.readFileSync('cdk-infra/outputs.json').toString();
  const outputs = JSON.parse(outputsFile);
  console.log(github.head_ref);
  console.log(outputsFile);
  const webhook = Object.values(outputs[`auto-builder-stack-enhancedApp-stg-${github.head_ref}-webhooks`])[0];
  return webhook;
};

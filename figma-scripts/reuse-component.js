// Drop-in async para REUSAR componentes (reemplaza figma_instantiate_component).
// Seguro en archivos documentAccess: dynamic-page. Local (nodeId) y librería (componentKey = variant key).
async function reuseComponent({ nodeId, componentKey, parentId, position, variant, overrides }) {
  let comp = null;
  if (nodeId)                comp = await figma.getNodeByIdAsync(nodeId);
  if (!comp && componentKey) comp = await figma.importComponentByKeyAsync(componentKey);
  if (!comp) throw new Error("componente no resuelto: " + (nodeId || componentKey));
  if (comp.type === "COMPONENT_SET") comp = comp.defaultVariant || comp.children[0];

  const inst = comp.createInstance();
  if (parentId) { const p = await figma.getNodeByIdAsync(parentId); if (p) p.appendChild(inst); }
  if (position) { inst.x = position.x; inst.y = position.y; }
  const props = { ...(variant || {}), ...(overrides || {}) };
  if (Object.keys(props).length) inst.setProperties(props); // nombres de prop pueden traer sufijo #nodeId

  const main = await inst.getMainComponentAsync();
  return { instanceId: inst.id, name: inst.name, mainComponentId: main && main.id };
}

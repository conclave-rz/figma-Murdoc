// apply-contract · Paso 3 — recrear los 3 stubs (dynamic-page safe).
// Corre por el path figma_execute de Murdoc. pluginData "contract" fiel a la sesión.
// NOTA: las colecciones Contract/* (48 tokens) las crea apply-contract Paso 2, NO este script
//       (sus valores/alias vienen del contrato DTCG; no se pueden reconstruir a mano fielmente).
const STUBS = [
  { name:"action/button/primary", contract:{ id:"action/button/primary",
    slots:["label","icon-start","icon-end"],
    states:["default","hover","focus","active","disabled","loading"],
    tokensUsed:["component.button.primary.bg","component.button.primary.text","component.button.primary.radius"],
    a11y:{role:"button"}, behavior:null } },
  { name:"form/field/text", contract:{ id:"form/field/text",
    slots:["label","input","hint","error"],
    states:["default","focus","filled","disabled","invalid"],
    tokensUsed:["semantic.color.bg.base","semantic.color.text.primary","semantic.color.border.default","semantic.radius.control"],
    a11y:{role:"textbox"}, behavior:"zag:field" } },
  { name:"overlay/dialog/modal", contract:{ id:"overlay/dialog/modal",
    slots:["trigger","title","body","footer","close"],
    states:["closed","open"],
    tokensUsed:["semantic.color.bg.base","semantic.color.text.primary","semantic.radius.card"],
    a11y:{role:"dialog"}, behavior:"ark:dialog" } }
];
const sec = figma.createSection();
sec.name = "Contract / Component stubs";
sec.x = 0; sec.y = 0;
const out = []; let y = 0;
for (const s of STUBS) {
  const c = figma.createComponent();
  c.resize(240, 40);
  c.name = s.name;
  c.setPluginData("contract", JSON.stringify(s.contract));
  sec.appendChild(c);
  c.x = 0; c.y = y; y += 120;
  out.push({ id: c.id, name: c.name });
}
return out;

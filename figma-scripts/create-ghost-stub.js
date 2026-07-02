// Trampa connect-codebase · nodo huérfano (data-component NO en el registry).
const sec = figma.currentPage.findOne(n => n.type==="SECTION" && n.name==="Contract / Component stubs");
const c = figma.createComponent();
c.resize(240, 40);
c.name = "data/table/ghost";
c.setPluginData("contract", JSON.stringify({ id:"data/table/ghost", slots:["header","row"], states:["default"], tokensUsed:[], a11y:{role:"table"}, behavior:null }));
(sec || figma.currentPage).appendChild(c);
return { id: c.id, name: c.name };

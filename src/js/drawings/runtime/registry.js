  // tool registry: exactly two toolbar tabs.
  //   "Lines"  = line tools plus Rectangle
  //   "Tools"  = positions first, followed by the remaining tools
  var TABS = [
    { group: { id: "lines", label: "Lines", icon: "hline" }, tools: [LINE_TOOLS.find((x) => x.type === "hline"), ...LINE_TOOLS.filter((x) => x.type !== "hline"), rect] },
    { group: { id: "other", label: "Tools", icon: "fibret" }, tools: [...POSITION_TOOLS, ...FIB_TOOLS, ...SHAPE_TOOLS.filter((x) => x.type !== "rect"), ...ANNOT_TOOLS, ...MEASURE_TOOLS, ...VOLUME_PROFILE_TOOLS] }
  ];
  var TOOLS = TABS.flatMap((t) => t.tools.map((x) => (x.group = t.group.id, x)));
  var TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.type, t]));
  var GROUPS = TABS.map((t) => t.group);

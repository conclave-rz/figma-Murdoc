#!/usr/bin/env python3
"""
html_parser.py — Extrae tokens de diseño y estructura de componentes
de archivos HTML/CSS/React/Tailwind para migrar a Figma.

Uso:
    python html_parser.py <archivo.html|.jsx|.tsx|.css> [--output spec.json]

Produce un JSON intermedio que el skill html-to-figma usa para crear
tokens, componentes y pantallas en Figma.
"""

import re
import json
import sys
from pathlib import Path
from collections import Counter, OrderedDict

# ─── Tailwind → Token mappings ──────────────────────────────────────

TAILWIND_COLORS = {
    "slate": {"50":"#f8fafc","100":"#f1f5f9","200":"#e2e8f0","300":"#cbd5e1","400":"#94a3b8","500":"#64748b","600":"#475569","700":"#334155","800":"#1e293b","900":"#0f172a","950":"#020617"},
    "gray": {"50":"#f9fafb","100":"#f3f4f6","200":"#e5e7eb","300":"#d1d5db","400":"#9ca3af","500":"#6b7280","600":"#4b5563","700":"#374151","800":"#1f2937","900":"#111827","950":"#030712"},
    "zinc": {"50":"#fafafa","100":"#f4f4f5","200":"#e4e4e7","300":"#d4d4d8","400":"#a1a1aa","500":"#71717a","600":"#52525b","700":"#3f3f46","800":"#27272a","900":"#18181b","950":"#09090b"},
    "neutral": {"50":"#fafafa","100":"#f5f5f5","200":"#e5e5e5","300":"#d4d4d4","400":"#a3a3a3","500":"#737373","600":"#525252","700":"#404040","800":"#262626","900":"#171717","950":"#0a0a0a"},
    "red": {"50":"#fef2f2","100":"#fee2e2","200":"#fecaca","300":"#fca5a5","400":"#f87171","500":"#ef4444","600":"#dc2626","700":"#b91c1c","800":"#991b1b","900":"#7f1d1d","950":"#450a0a"},
    "orange": {"50":"#fff7ed","100":"#ffedd5","200":"#fed7aa","300":"#fdba74","400":"#fb923c","500":"#f97316","600":"#ea580c","700":"#c2410c","800":"#9a3412","900":"#7c2d12","950":"#431407"},
    "amber": {"50":"#fffbeb","100":"#fef3c7","200":"#fde68a","300":"#fcd34d","400":"#fbbf24","500":"#f59e0b","600":"#d97706","700":"#b45309","800":"#92400e","900":"#78350f","950":"#451a03"},
    "yellow": {"50":"#fefce8","100":"#fef9c3","200":"#fef08a","300":"#fde047","400":"#facc15","500":"#eab308","600":"#ca8a04","700":"#a16207","800":"#854d0e","900":"#713f12","950":"#422006"},
    "green": {"50":"#f0fdf4","100":"#dcfce7","200":"#bbf7d0","300":"#86efac","400":"#4ade80","500":"#22c55e","600":"#16a34a","700":"#15803d","800":"#166534","900":"#14532d","950":"#052e16"},
    "emerald": {"50":"#ecfdf5","100":"#d1fae5","200":"#a7f3d0","300":"#6ee7b7","400":"#34d399","500":"#10b981","600":"#059669","700":"#047857","800":"#065f46","900":"#064e3b","950":"#022c22"},
    "teal": {"50":"#f0fdfa","100":"#ccfbf1","200":"#99f6e4","300":"#5eead4","400":"#2dd4bf","500":"#14b8a6","600":"#0d9488","700":"#0f766e","800":"#115e59","900":"#134e4a","950":"#042f2e"},
    "cyan": {"50":"#ecfeff","100":"#cffafe","200":"#a5f3fc","300":"#67e8f9","400":"#22d3ee","500":"#06b6d4","600":"#0891b2","700":"#0e7490","800":"#155e75","900":"#164e63","950":"#083344"},
    "blue": {"50":"#eff6ff","100":"#dbeafe","200":"#bfdbfe","300":"#93c5fd","400":"#60a5fa","500":"#3b82f6","600":"#2563eb","700":"#1d4ed8","800":"#1e40af","900":"#1e3a8a","950":"#172554"},
    "indigo": {"50":"#eef2ff","100":"#e0e7ff","200":"#c7d2fe","300":"#a5b4fc","400":"#818cf8","500":"#6366f1","600":"#4f46e5","700":"#4338ca","800":"#3730a3","900":"#312e81","950":"#1e1b4e"},
    "violet": {"50":"#f5f3ff","100":"#ede9fe","200":"#ddd6fe","300":"#c4b5fd","400":"#a78bfa","500":"#8b5cf6","600":"#7c3aed","700":"#6d28d9","800":"#5b21b6","900":"#4c1d95","950":"#2e1065"},
    "purple": {"50":"#faf5ff","100":"#f3e8ff","200":"#e9d5ff","300":"#d8b4fe","400":"#c084fc","500":"#a855f7","600":"#9333ea","700":"#7e22ce","800":"#6b21a8","900":"#581c87","950":"#3b0764"},
    "pink": {"50":"#fdf2f8","100":"#fce7f3","200":"#fbcfe8","300":"#f9a8d4","400":"#f472b6","500":"#ec4899","600":"#db2777","700":"#be185d","800":"#9d174d","900":"#831843","950":"#500724"},
    "rose": {"50":"#fff1f2","100":"#ffe4e6","200":"#fecdd3","300":"#fda4af","400":"#fb7185","500":"#f43f5e","600":"#e11d48","700":"#be123c","800":"#9f1239","900":"#881337","950":"#4c0519"},
}

TAILWIND_SPACING = {
    "0": 0, "px": 1, "0.5": 2, "1": 4, "1.5": 6, "2": 8, "2.5": 10,
    "3": 12, "3.5": 14, "4": 16, "5": 20, "6": 24, "7": 28, "8": 32,
    "9": 36, "10": 40, "11": 44, "12": 48, "14": 56, "16": 64,
    "20": 80, "24": 96, "28": 112, "32": 128, "36": 144, "40": 160,
}

TAILWIND_FONT_SIZE = {
    "xs": {"size": 12, "lineHeight": 16},
    "sm": {"size": 14, "lineHeight": 20},
    "base": {"size": 16, "lineHeight": 24},
    "lg": {"size": 18, "lineHeight": 28},
    "xl": {"size": 20, "lineHeight": 28},
    "2xl": {"size": 24, "lineHeight": 32},
    "3xl": {"size": 30, "lineHeight": 36},
    "4xl": {"size": 36, "lineHeight": 40},
    "5xl": {"size": 48, "lineHeight": 48},
    "6xl": {"size": 60, "lineHeight": 60},
}

TAILWIND_RADIUS = {
    "none": 0, "sm": 2, "": 4, "md": 6, "lg": 8, "xl": 12, "2xl": 16, "3xl": 24, "full": 9999
}

TAILWIND_SHADOW = {
    "sm": {"y": 1, "blur": 2, "alpha": 0.05},
    "": {"y": 1, "blur": 3, "alpha": 0.1},
    "md": {"y": 4, "blur": 6, "alpha": 0.1},
    "lg": {"y": 10, "blur": 15, "alpha": 0.1},
    "xl": {"y": 20, "blur": 25, "alpha": 0.1},
    "2xl": {"y": 25, "blur": 50, "alpha": 0.25},
}

TAILWIND_FONT_WEIGHT = {
    "thin": 100, "extralight": 200, "light": 300, "normal": 400,
    "medium": 500, "semibold": 600, "bold": 700, "extrabold": 800, "black": 900
}


def extract_tailwind_classes(code):
    patterns = [
        r'className\s*=\s*["\']([^"\']+)["\']',
        r'className\s*=\s*\{`([^`]+)`\}',
        r'class\s*=\s*["\']([^"\']+)["\']',
        r'cn\(([^)]+)\)',
        r'clsx\(([^)]+)\)',
    ]
    classes = []
    for pattern in patterns:
        matches = re.findall(pattern, code)
        for m in matches:
            cleaned = re.sub(r'\$\{[^}]+\}', '', m)
            cleaned = re.sub(r'["\',]', ' ', cleaned)
            classes.extend(cleaned.split())
    return classes


def extract_css_variables(code):
    tokens = {}
    root_blocks = re.findall(r':root\s*\{([^}]+)\}', code, re.DOTALL)
    for block in root_blocks:
        vars_found = re.findall(r'--([\w-]+)\s*:\s*([^;]+);', block)
        for name, value in vars_found:
            tokens[f"--{name}"] = value.strip()
    dark_blocks = re.findall(r'(?:\[data-theme=["\']dark["\']\]|\.dark)\s*\{([^}]+)\}', code, re.DOTALL)
    for block in dark_blocks:
        vars_found = re.findall(r'--([\w-]+)\s*:\s*([^;]+);', block)
        for name, value in vars_found:
            tokens[f"--{name}__dark"] = value.strip()
    return tokens


def extract_inline_colors(code):
    hex_colors = re.findall(r'#(?:[0-9a-fA-F]{3}){1,2}\b', code)
    rgb_colors = re.findall(r'rgba?\([^)]+\)', code)
    return list(set(hex_colors + rgb_colors))


def classify_tailwind_tokens(classes):
    colors_used = Counter()
    spacing_used = Counter()
    font_sizes_used = Counter()
    radii_used = Counter()
    shadows_used = Counter()
    font_weights_used = Counter()

    for cls in classes:
        color_match = re.match(r'(?:bg|text|border|ring|accent|from|to|via)-([\w]+)-(\d+)', cls)
        if color_match:
            color_name, shade = color_match.groups()
            if color_name in TAILWIND_COLORS:
                colors_used[f"{color_name}-{shade}"] += 1
            continue
        spacing_match = re.match(r'(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-[xy])-(\S+)', cls)
        if spacing_match:
            val = spacing_match.group(1)
            if val in TAILWIND_SPACING:
                spacing_used[val] += 1
            continue
        font_match = re.match(r'text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)$', cls)
        if font_match:
            font_sizes_used[font_match.group(1)] += 1
            continue
        radius_match = re.match(r'rounded(?:-(none|sm|md|lg|xl|2xl|3xl|full))?$', cls)
        if radius_match:
            size = radius_match.group(1) or ""
            radii_used[size] += 1
            continue
        shadow_match = re.match(r'shadow(?:-(sm|md|lg|xl|2xl))?$', cls)
        if shadow_match:
            size = shadow_match.group(1) or ""
            shadows_used[size] += 1
            continue
        weight_match = re.match(r'font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$', cls)
        if weight_match:
            font_weights_used[weight_match.group(1)] += 1
            continue

    return {
        "colors": dict(colors_used),
        "spacing": dict(spacing_used),
        "font_sizes": dict(font_sizes_used),
        "radii": dict(radii_used),
        "shadows": dict(shadows_used),
        "font_weights": dict(font_weights_used),
    }


def detect_react_components(code):
    components = []
    patterns = [
        r'(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w+)\s*\(([^)]*)\)',
        r'(?:export\s+)?(?:default\s+)?const\s+([A-Z]\w+)\s*(?::\s*\w+\s*)?=\s*(?:\([^)]*\)|(\w+))\s*=>',
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, code):
            name = match.group(1)
            props = extract_component_props(code, name)
            variants = detect_variants(code, name)
            components.append({
                "name": name,
                "props": props,
                "variants": variants,
                "has_children": "children" in code[match.start():match.start()+2000].lower()
            })
    return components


def extract_component_props(code, component_name):
    props = {}
    pattern = rf'{component_name}\s*(?::\s*\w+\s*)?=?\s*(?:function\s*)?\(?\s*\{{\s*([^}}]+)\}}'
    match = re.search(pattern, code)
    if match:
        prop_str = match.group(1)
        prop_names = re.findall(r'(\w+)(?:\s*=\s*[^,}]+)?', prop_str)
        for p in prop_names:
            if p in ('children', 'className', 'style', 'key', 'ref'):
                continue
            props[p] = guess_prop_type(p, code)
    type_pattern = rf'(?:interface|type)\s+{component_name}Props\s*(?:=\s*)?\{{([^}}]+)\}}'
    type_match = re.search(type_pattern, code)
    if type_match:
        type_str = type_match.group(1)
        type_props = re.findall(r'(\w+)\??\s*:\s*([^;\n]+)', type_str)
        for name, type_val in type_props:
            if name in ('children', 'className', 'style', 'key', 'ref'):
                continue
            props[name] = ts_type_to_figma(type_val.strip())
    return props


def guess_prop_type(prop_name, code):
    name_lower = prop_name.lower()
    if any(k in name_lower for k in ['disabled', 'visible', 'show', 'active', 'open', 'loading', 'checked']):
        return "BOOLEAN"
    if any(k in name_lower for k in ['icon', 'avatar', 'image', 'component']):
        return "INSTANCE_SWAP"
    if any(k in name_lower for k in ['variant', 'size', 'type', 'status', 'color']):
        return "VARIANT"
    return "TEXT"


def ts_type_to_figma(ts_type):
    ts_type = ts_type.strip().rstrip(';')
    if ts_type == 'boolean':
        return "BOOLEAN"
    if ts_type == 'string':
        return "TEXT"
    if ts_type in ('ReactNode', 'React.ReactNode', 'JSX.Element'):
        return "INSTANCE_SWAP"
    if '|' in ts_type and all("'" in v or '"' in v for v in ts_type.split('|')):
        return "VARIANT"
    return "TEXT"


def detect_variants(code, component_name):
    variants = {}
    variant_pattern = r'(\w+)\s*(?:===?|!==?)\s*["\'](\w+)["\']'
    comp_start = code.find(component_name)
    if comp_start >= 0:
        chunk = code[comp_start:comp_start+5000]
        matches = re.findall(variant_pattern, chunk)
        for prop, value in matches:
            if prop.lower() in ('variant', 'size', 'type', 'status', 'state', 'color', 'theme'):
                if prop not in variants:
                    variants[prop] = []
                if value not in variants[prop]:
                    variants[prop].append(value)
    for prop_name in ['variant', 'size', 'type', 'status', 'state']:
        union_pattern = rf'{prop_name}\s*(?:\??\s*:\s*)((?:["\'][^"\']+["\'](?:\s*\|\s*)?)+)'
        match = re.search(union_pattern, code)
        if match:
            values = re.findall(r'["\']([^"\']+)["\']', match.group(1))
            if values:
                variants[prop_name] = values
    return variants


def detect_html_components(code):
    components = []
    class_patterns = re.findall(r'class\s*=\s*["\']([^"\']+)["\']', code)
    root_classes = Counter()
    for classes in class_patterns:
        first_class = classes.split()[0] if classes.split() else ""
        if first_class and not first_class.startswith(('flex', 'grid', 'block', 'inline', 'hidden', 'w-', 'h-', 'p-', 'm-', 'text-', 'bg-', 'border')):
            root_classes[first_class] += 1
    for cls, count in root_classes.most_common(20):
        if count >= 2:
            components.append({
                "name": cls.replace('-', ' ').title().replace(' ', ''),
                "source_class": cls,
                "occurrences": count,
                "props": {},
                "variants": {},
                "has_children": True
            })
    return components


def detect_screens(code, components):
    screens = []
    page_patterns = [
        r'(?:function|const)\s+((?:\w+)?(?:Page|Screen|View|Layout|Home|Dashboard|Login|Register|Profile|Settings))\s*',
        r'path\s*[:=]\s*["\']([^"\']+)["\']',
    ]
    for pattern in page_patterns:
        for match in re.finditer(pattern, code):
            name = match.group(1)
            if name.startswith('/'):
                name = name.strip('/').replace('/', '-').title() or "Home"
            screens.append({
                "name": name,
                "type": "desktop",
                "components_used": [c["name"] for c in components[:5]],
                "description": f"Screen: {name}"
            })
    html_sections = re.findall(r'<(?:main|section)\s+(?:[^>]*id\s*=\s*["\']([^"\']+)["\'])?[^>]*>', code)
    for section_id in html_sections:
        if section_id:
            screens.append({
                "name": section_id.replace('-', ' ').title(),
                "type": "desktop",
                "components_used": [c["name"] for c in components[:5]],
                "description": f"Section: {section_id}"
            })
    if not screens:
        screens.append({
            "name": "Main",
            "type": "desktop",
            "components_used": [c["name"] for c in components],
            "description": "Main application screen"
        })
    return screens


def build_token_spec(tw_tokens, css_vars, inline_colors):
    tokens = {"colors": {}, "typography": {}, "spacing": {}, "radii": {}, "shadows": []}
    for color_key in tw_tokens.get("colors", {}):
        parts = color_key.rsplit("-", 1)
        if len(parts) == 2:
            color_name, shade = parts
            if color_name in TAILWIND_COLORS and shade in TAILWIND_COLORS[color_name]:
                hex_val = TAILWIND_COLORS[color_name][shade]
                token_name = f"{color_name}/{shade}"
                tokens["colors"][token_name] = {"light": hex_val}
    for var_name, value in css_vars.items():
        if "__dark" in var_name:
            base_name = var_name.replace("__dark", "").replace("--", "")
            if base_name in tokens["colors"]:
                tokens["colors"][base_name]["dark"] = value
            else:
                tokens["colors"][base_name] = {"dark": value}
        elif "color" in var_name.lower() or value.startswith("#") or value.startswith("rgb"):
            clean_name = var_name.replace("--", "")
            tokens["colors"][clean_name] = {"light": value}
    for size_name in tw_tokens.get("font_sizes", {}):
        if size_name in TAILWIND_FONT_SIZE:
            spec = TAILWIND_FONT_SIZE[size_name]
            tokens["typography"][f"text-{size_name}"] = {
                "family": "Inter",
                "size": spec["size"],
                "lineHeight": spec["lineHeight"],
                "weight": "Regular"
            }
    for sp_key in tw_tokens.get("spacing", {}):
        if sp_key in TAILWIND_SPACING:
            tokens["spacing"][f"space-{sp_key}"] = TAILWIND_SPACING[sp_key]
    for r_key in tw_tokens.get("radii", {}):
        if r_key in TAILWIND_RADIUS:
            name = r_key if r_key else "default"
            tokens["radii"][f"radius-{name}"] = TAILWIND_RADIUS[r_key]
    for s_key in tw_tokens.get("shadows", {}):
        if s_key in TAILWIND_SHADOW:
            spec = TAILWIND_SHADOW[s_key]
            name = s_key if s_key else "default"
            tokens["shadows"].append({
                "name": f"shadow-{name}",
                "x": 0, "y": spec["y"],
                "blur": spec["blur"],
                "color": f"rgba(0,0,0,{spec['alpha']})"
            })
    return tokens


def detect_framework(code):
    if re.search(r'import\s+.*from\s+["\']react', code) or 'jsx' in code.lower() or 'useState' in code:
        return "react"
    if re.search(r'import\s+.*from\s+["\']vue', code) or '<template>' in code:
        return "vue"
    if re.search(r'import\s+.*from\s+["\']svelte', code) or '<script>' in code and '{#if' in code:
        return "svelte"
    if '<html' in code.lower() or '<!doctype' in code.lower():
        return "html"
    return "unknown"


def detect_css_approach(code):
    tw_classes = extract_tailwind_classes(code)
    if len(tw_classes) > 5:
        return "tailwind"
    css_vars = extract_css_variables(code)
    if len(css_vars) > 3:
        return "css-variables"
    if re.search(r'styled\.|css`|@emotion', code):
        return "css-in-js"
    return "plain-css"


def parse_file(filepath):
    path = Path(filepath)
    code = path.read_text(encoding="utf-8", errors="replace")
    framework = detect_framework(code)
    css_approach = detect_css_approach(code)
    tw_classes = extract_tailwind_classes(code)
    tw_tokens = classify_tailwind_tokens(tw_classes)
    css_vars = extract_css_variables(code)
    inline_colors = extract_inline_colors(code)
    if framework == "react":
        components = detect_react_components(code)
    else:
        components = detect_html_components(code)
    tokens = build_token_spec(tw_tokens, css_vars, inline_colors)
    screens = detect_screens(code, components)
    spec = {
        "meta": {
            "nombre": path.stem.replace("-", " ").replace("_", " ").title(),
            "fuente": str(path.name),
            "framework": framework,
            "css_approach": css_approach
        },
        "tokens": tokens,
        "components": [
            {
                "name": c["name"],
                "variants": c.get("variants", {}),
                "props": c.get("props", {}),
                "has_children": c.get("has_children", False)
            }
            for c in components
        ],
        "screens": screens,
        "raw_stats": {
            "tailwind_classes_found": len(tw_classes),
            "css_variables_found": len(css_vars),
            "inline_colors_found": len(inline_colors),
            "components_detected": len(components),
            "screens_detected": len(screens)
        }
    }
    return spec


def main():
    if len(sys.argv) < 2:
        print("Uso: python html_parser.py <archivo> [--output spec.json]")
        sys.exit(1)
    filepath = sys.argv[1]
    output = "spec.json"
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        if idx + 1 < len(sys.argv):
            output = sys.argv[idx + 1]
    spec = parse_file(filepath)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2, ensure_ascii=False)
    print(f"Spec generado: {output}")
    print(f"   Framework: {spec['meta']['framework']}")
    print(f"   CSS: {spec['meta']['css_approach']}")
    print(f"   Tokens: {sum(len(v) if isinstance(v, (dict, list)) else 0 for v in spec['tokens'].values())}")
    print(f"   Componentes: {len(spec['components'])}")
    print(f"   Pantallas: {len(spec['screens'])}")


if __name__ == "__main__":
    main()

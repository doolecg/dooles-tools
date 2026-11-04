"""Copies the Main Menu (Sidebar) shared look (hooks/sidebar-kit.tsx) into every mod that draws a sidebar tab."""
import pathlib
import shutil

HERE = pathlib.Path(__file__).resolve().parent
MODS = ["flightdeck", "self-improve", "idea-shelf", "clean-view", "mod-settings", "graph"]

source = HERE / "hooks" / "sidebar-kit.tsx"
for mod in MODS:
    target = HERE.parent / mod / "hooks" / "sidebar-kit.tsx"
    shutil.copyfile(source, target)
    print(f"copied to {target.relative_to(HERE.parent)}")

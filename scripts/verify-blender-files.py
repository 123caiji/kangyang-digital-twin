"""Reopen native projects and verify GLB containers without external services."""
from pathlib import Path
import json
import struct
import bpy
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs" / "blender-models"
results = []
for source in sorted(OUT.glob("*.blend")):
    bpy.ops.wm.open_mainfile(filepath=str(source))
    raw = source.with_suffix(".glb").read_bytes()
    magic, version, length = struct.unpack_from("<III", raw)
    json_length = struct.unpack_from("<I", raw, 12)[0]
    gltf = json.loads(raw[20:20+json_length])
    assert magic == 0x46546C67 and version == 2 and length == len(raw)
    assert all("bufferView" in i for i in gltf.get("images", []))
    assert len(bpy.context.scene.objects) > 30, "Editable parts unexpectedly merged"
    stats = {"file": source.name, "editableObjects": len(bpy.context.scene.objects),
             "embeddedImages": len(gltf.get("images", [])),
             "semanticNodes": sum("pickLabel" in n.get("extras", {}) for n in gltf.get("nodes", [])),
             "generator": gltf["asset"]["generator"]}
    results.append(stats)
(OUT / "file-validation.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))

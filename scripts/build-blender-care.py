"""Author five editable Blender care interiors and export metre-scale GLB assets.
Run with Blender's Python or an isolated Python environment containing bpy.
No downloaded models, patient records, or external textures are used.
"""
from pathlib import Path
import math
import json
import time
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "models"
OUT = ROOT / "outputs" / "blender-models"
ASSETS.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
M = {}

def material(name, color, rough=0.55, metal=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    m.diffuse_color = (*color, 1)
    return m

def texture_material(name, color, kind):
    m = material(name, color, 0.78 if kind == "fabric" else 0.48)
    rng = np.random.default_rng(42)
    size = 256
    yy, xx = np.mgrid[:size, :size]
    if kind == "wood":
        noise = 0.04 * rng.random((size, size)) + 0.055 * np.sin(xx * .16 + np.sin(yy * .025) * 3) + 0.025 * np.sin(xx * .61 + np.sin(yy * .04))
    else:
        noise = 0.035 * rng.random((size, size)) + 0.035 * ((xx % 4 < 2) ^ (yy % 4 < 2))
    rgba = np.ones((size, size, 4), dtype=np.float32)
    for c in range(3):
        rgba[:, :, c] = np.clip(color[c] + noise, 0, 1)
    img = bpy.data.images.new(name + "_basecolor", width=size, height=size)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    node = m.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    m.node_tree.links.new(node.outputs["Color"], m.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
    return m

def init():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)
    M.clear()
    M.update({
        "wall": material("Warm mineral plaster", (.73, .70, .64), .85),
        "white": material("Porcelain warm white", (.88, .88, .83), .38),
        "wood": texture_material("Natural oak / packed wood grain", (.48, .31, .17), "wood"),
        "lightwood": texture_material("Pale oak / packed wood grain", (.65, .48, .29), "wood"),
        "fabric": texture_material("Sage woven upholstery", (.16, .35, .31), "fabric"),
        "linen": texture_material("Ivory cotton bedding", (.79, .77, .69), "fabric"),
        "blue": texture_material("Dust blue bed throw", (.20, .36, .44), "fabric"),
        "metal": material("Brushed stainless steel", (.55, .61, .63), .27, .82),
        "dark": material("Graphite polymer", (.032, .045, .048), .45),
        "leaf": material("Plant foliage", (.12, .27, .13), .73),
        "orange": material("Call button amber", (.91, .37, .08), .30),
        "glass": material("Frosted blue glazing", (.43, .65, .69), .18, .12),
        "screen": material("Monitor display", (.03, .14, .18), .23),
        "paper": material("Paper", (.91, .87, .73), .87),
    })
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.world.color = (.18, .18, .18)

# Coordinates throughout are the application's x, y(up), z(depth).
def pos(v):
    return (v[0], -v[2], v[1])

def parent(name, label=None, kind="facility"):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    if label:
        o["pickLabel"] = label
        o["assetKind"] = kind
    return o

def finish(o, name, mat, p=None):
    o.name = name
    o.data.materials.append(M[mat])
    if p:
        o.parent = p
    return o

def box(name, size, xyz, mat="wood", bevel=.018, p=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos(xyz))
    o = bpy.context.object
    o.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new("Crafted edge radii", "BEVEL")
        b.width = min(bevel, min(size) * .35)
        b.segments = 3
        bpy.ops.object.modifier_apply(modifier=b.name)
        for poly in o.data.polygons:
            poly.use_smooth = True
        n = o.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
        bpy.ops.object.modifier_apply(modifier=n.name)
    return finish(o, name, mat, p)

def ellipsoid(name, scale, xyz, mat="fabric", p=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1, location=pos(xyz))
    o = bpy.context.object
    o.scale = (scale[0], scale[2], scale[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for face in o.data.polygons:
        face.use_smooth = True
    return finish(o, name, mat, p)

def rod(name, a, b, radius=.025, mat="metal", p=None, vertices=16):
    va, vb = Vector(pos(a)), Vector(pos(b))
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(vb-va).length, location=(va+vb)/2)
    o = bpy.context.object
    o.rotation_euler = (vb-va).to_track_quat("Z", "Y").to_euler()
    for f in o.data.polygons:
        f.use_smooth = len(f.vertices) == 4
    return finish(o, name, mat, p)

def pipe(name, points, radius=.02, mat="metal", p=None):
    c = bpy.data.curves.new(name, "CURVE")
    c.dimensions = "3D"
    c.resolution_u = 8
    c.bevel_depth = radius
    c.bevel_resolution = 3
    spline = c.splines.new("BEZIER")
    spline.bezier_points.add(len(points)-1)
    for b, point in zip(spline.bezier_points, points):
        b.co = pos(point)
        b.handle_left_type = b.handle_right_type = "AUTO"
    o = bpy.data.objects.new(name, c)
    bpy.context.collection.objects.link(o)
    finish(o, name, mat, p)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o.select_set(False)
    return o

def text(name, value, xyz, size=.12, mat="dark", p=None):
    c = bpy.data.curves.new(name, "FONT")
    c.body = value
    c.size = size
    c.align_x = "CENTER"
    c.extrude = .001
    o = bpy.data.objects.new(name, c)
    bpy.context.collection.objects.link(o)
    o.location = pos(xyz)
    o.rotation_euler = (math.pi/2, 0, 0)
    finish(o, name, mat, p)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target="MESH")
    o.select_set(False)

def plant(x, z, height=.95):
    p = parent("Plant", "室内绿植", "decor")
    rod("Ceramic planter", (x,.03,z), (x,.3,z), .17, "white", p, 28)
    for i in range(6):
        a = i * 2.4
        px, pz = x + math.sin(a)*.16, z + math.cos(a)*.16
        tip = height*(.65+i*.05)
        pipe("Plant stem", [(x,.25,z),(x,.5,z),(px,tip,pz)], .008, "leaf", p)
        leaf = ellipsoid("Sculpted leaf", (.075,.19,.027), (px,tip,pz), "leaf", p)
        leaf.rotation_euler.y = math.sin(a)*.65

def shell(w, d, title):
    p = parent("Architecture", None)
    box("Floating plinth", (w+.26,.17,d+.26), (0,-.11,0), "dark", .025, p)
    for row in range(math.ceil(d/.24)):
        z = -d/2 + (row+.5)*d/math.ceil(d/.24)
        box("Oak floor plank", (w-.01,.045,d/math.ceil(d/.24)-.007), (0,-.012,z), "lightwood", .004, p)
    for size, xyz in [((w,.82,.14),(0,.41,-d/2)),((w,.40,.14),(0,2.6,-d/2)),((w*.24,1.58,.14),(-w*.38,1.61,-d/2)),((w*.24,1.58,.14),(w*.38,1.61,-d/2)),((.14,2.8,d),(-w/2,1.4,0))]:
        box("Cutaway plaster wall", size, xyz, "wall", .008, p)
    box("Oak wainscot", (.045,.85,d-.04), (-w/2+.09,.43,0), "wood", .008, p)
    for y in [.10,.86]:
        box("Wall protective trim", (.06,.055,d), (-w/2+.12,y,0), "lightwood", .014, p)
    box("Window glazing", (w*.51,1.53,.025), (0,1.61,-d/2), "glass", .004, p)
    for x in [-w*.26,0,w*.26]:
        box("Window mullion", (.045,1.64,.08), (x,1.61,-d/2+.05), "white", .008, p)
    for y in [.79,2.42]:
        box("Window frame", (w*.55,.065,.09), (0,y,-d/2+.05), "white", .01, p)
    box("Window sill", (w*.58,.055,.28), (0,.79,-d/2+.10), "lightwood", .015, p)
    rod("Curtain rail", (-w*.32,2.5,-d/2+.22), (w*.32,2.5,-d/2+.22), .018, "metal", p)
    for sign in [-1,1]:
        for i in range(6):
            ellipsoid("Curtain pleat", (.046,.81,.043), (sign*w*.29 + (i-2.5)*.056,1.59,-d/2+.22), "linen", p)
    box("Wayfinding plaque", (1.2,.22,.035), (-w*.31,2.59,-d/2+.1), "fabric", .02,p)
    text("Raised wayfinding", title, (-w*.31,2.55,-d/2+.13), .085, "white", p)
    plant(w/2-.37,-d/2+.42)

def bed(x, z, n):
    p = parent(f"CareBed_{n}", f"{n}号电动护理床", "bed")
    box("Steel chassis", (.91,.13,1.98),(x,.40,z),"metal",.025,p)
    for xx in [-.35,.35]:
        for zz in [-.80,.80]:
            rod("Caster support",(x+xx,.11,z+zz),(x+xx,.37,z+zz),.035,"metal",p)
            rod("Rubber caster",(x+xx-.034,.085,z+zz),(x+xx+.034,.085,z+zz),.079,"dark",p,20)
    box("Mattress rounded foam", (.91,.19,1.92),(x,.55,z),"linen",.078,p)
    box("Mattress stitched piping",(.93,.012,1.94),(x,.57,z),"white",.005,p)
    pillow=ellipsoid("Cotton pillow",(.35,.085,.23),(x,.70,z-.62),"linen",p)
    box("Woven folded duvet",(.89,.085,1.16),(x,.685,z+.25),"fabric" if n==1 else "blue",.038,p)
    for i in range(7):
        box("Duvet seam",(.86,.006,.006),(x,.731,z-.23+i*.16),"linen",.002,p)
    for zz in [-1.0,1.0]:
        box("Oak end panel",(1.03,.65,.09),(x,.59,z+zz),"lightwood",.04,p)
        box("Padded end inset",(.79,.25,.014),(x,.68,z+zz+.052),"fabric",.035,p)
        text("Bed number",f"0{n}",(x,.64,z+zz+.065),.11,"white",p)
    for xx in [-.49,.49]:
        pipe("Curved safety rail",[(x+xx,.48,z-.42),(x+xx,.87,z-.42),(x+xx,.91,z-.34),(x+xx,.91,z+.38),(x+xx,.86,z+.46),(x+xx,.48,z+.46)],.021,"metal",p)
        for zz in [-.22,0,.22]:
            rod("Rail baluster",(x+xx,.51,z+zz),(x+xx,.88,z+zz),.012,"metal",p)
    return p

def chair(x,z,angle=0):
    p=parent("UpholsteredArmchair","适老化扶手座椅","chair")
    box("Seat cushion",(.52,.15,.51),(0,.48,0),"fabric",.062,p)
    box("Padded back",(.52,.49,.115),(0,.77,-.225),"fabric",.05,p)
    for s in [-1,1]:
        for zz in [-.2,.2]:
            rod("Tapered oak leg",(s*.22,.025,zz),(s*.22,.57,zz),.026,"wood",p)
        box("Rounded armrest",(.075,.055,.52),(s*.27,.68,0),"lightwood",.025,p)
    p.location=pos((x,0,z))
    p.rotation_euler.z=-angle

def cabinet(x,z,label="床头储物柜",height=.72):
    p=parent("StorageCabinet",label,"cabinet")
    box("Cabinet carcase",(.58,height,.5),(x,height/2,z),"lightwood",.018,p)
    for i in range(3):
        y=(i+.5)*height/3
        box("Drawer front",(.535,height/3-.018,.035),(x,y,z+.263),"white",.012,p)
        rod("Drawer pull",(x-.10,y+.04,z+.30),(x+.10,y+.04,z+.30),.012,"metal",p)
    box("Overhanging top",(.63,.04,.55),(x,height+.02,z),"wood",.012,p)
    return p

def call_button(x,z):
    p=parent("NurseCall","床头紧急呼叫按钮","call")
    box("Call unit",(.19,.15,.05),(x,1.14,z),"white",.025,p)
    rod("Amber call key",(x,1.14,z+.026),(x,1.14,z+.037),.036,"orange",p)
    pipe("Call pendant cord",[(x+.06,1.10,z+.035),(x+.10,.97,z+.08),(x+.03,.88,z+.07)],.005,"dark",p)

def table(x,z):
    p=parent("DiningTable","适老化圆角餐桌","table")
    box("Rounded oak tabletop",(1.5,.09,1.05),(x,.78,z),"lightwood",.045,p)
    for xx in [-.6,.6]:
        for zz in [-.38,.38]:
            rod("Dining table leg",(x+xx,.025,z+zz),(x+xx,.75,z+zz),.035,"wood",p)
    for xx in [-.36,.36]:
        rod("Ceramic plate",(x+xx,.834,z),(x+xx,.851,z),.135,"white",p,32)
        rod("Ceramic cup",(x+xx+.2,.834,z-.1),(x+xx+.2,.945,z-.1),.038,"fabric",p,20)
        box("Linen place mat",(.42,.005,.36),(x+xx,.829,z),"linen",.002,p)

def fixtures(theme):
    if theme=="room":
        shell(4,4,"CARE RESIDENCE")
        bed(-1.05,-.5,1); bed(1.05,-.5,2)
        cabinet(0,-1.45)
        for x in [-1.05,1.05]: call_button(x,-1.89)
        chair(-1.5,1.35,-.2); chair(1.45,1.32,.2)
    elif theme=="corridor":
        shell(3.2,7,"ACCESSIBLE LIVING")
        for i,z in enumerate([-2.3,0,2]):
            p=parent(f"Door_{i}","居室通道门","door")
            box("Oak door panel",(.065,2.12,.84),(-1.49,1.06,z),"lightwood",.016,p)
            for zz in [-.46,.46]: box("Door frame",(.11,2.23,.065),(-1.47,1.115,z+zz),"white",.01,p)
            box("Door lintel",(.11,.065,.99),(-1.47,2.23,z),"white",.01,p)
            rod("Accessible door lever",(-1.38,.96,z+.23),(-1.38,.96,z+.08),.018,"metal",p)
        p=parent("CorridorHandrail","无障碍通行扶手","rail")
        pipe("Continuous handrail",[(1.35,.70,-3),(1.35,.87,-2.85),(1.35,.87,2.85),(1.35,.70,3)],.036,"wood",p)
        for z in [-2.8,0,2.8]: rod("Rail support",(1.35,.03,z),(1.35,.84,z),.023,"metal",p)
    elif theme=="dining":
        shell(6,5,"COMMUNITY DINING")
        for x in [-1.45,1.45]:
            table(x,-.3); chair(x-.36,.55); chair(x+.36,-1.15,math.pi)
        cabinet(-2.5,-1.9,"餐具储存柜",1.4)
    elif theme=="nursing":
        shell(5.6,4.6,"NURSING STATION")
        p=parent("ReceptionDesk","护理接待台","desk")
        box("Reception carcase",(3,.95,.65),(0,.475,.5),"wood",.035,p)
        box("Solid surface countertop",(3.14,.085,.79),(0,.99,.5),"white",.035,p)
        for x in np.linspace(-1.42,1.42,30): box("Oak fluted front",(.035,.77,.035),(float(x),.45,.844),"lightwood",.012,p)
        text("Reception lettering","CARE +",(.72,.57,.88),.16,"white",p)
        p=parent("WorkstationMonitor","护理工作站终端","monitor")
        box("Monitor housing",(.78,.46,.06),(-.4,1.32,.49),"dark",.022,p)
        box("Display glass",(.71,.39,.008),(-.4,1.32,.524),"screen",.008,p)
        box("Monitor pedestal",(.10,.20,.08),(-.4,1.10,.49),"metal",.015,p)
        box("Monitor foot",(.35,.025,.22),(-.4,1.043,.49),"metal",.01,p)
        for i in range(5): box("Display status row",(.45-i*.035,.009,.003),(-.46,1.43-i*.05,.53),"fabric",.001,p)
        box("Keyboard",(.5,.025,.16),(-.4,1.045,.73),"dark",.01,p)
        cabinet(-2.15,-1.8,"药品收纳柜",1.8); cabinet(-1.4,-1.8,"护理档案柜",1.8)
    else:
        shell(6,5,"REHABILITATION")
        p=parent("ParallelBars","康复平行杠","rehab")
        box("Training mat",(1.5,.045,2.9),(-1.22,.024,-.1),"fabric",.018,p)
        for x in [-1.7,-.75]:
            pipe("Rounded parallel bar",[(x,.80,-1.45),(x,.94,-1.32),(x,.94,1.12),(x,.80,1.25)],.035,"wood",p)
            for z in [-1.2,1]:
                rod("Adjustable post",(x,.07,z),(x,.92,z),.026,"metal",p)
                rod("Height collar",(x,.40,z),(x,.46,z),.04,"dark",p)
                box("Base foot",(.24,.04,.27),(x,.067,z),"metal",.012,p)
        p=parent("TherapySteps","康复训练阶梯","steps")
        for i in range(3):
            h=(i+1)*.13
            box("Oak step",(1.15,h,.4),(1.7,h/2,.5-i*.4),"lightwood",.012,p)
            box("Anti-slip tread",(1.1,.006,.33),(1.7,h+.003,.5-i*.4),"dark",.003,p)
        cabinet(2.4,-1.9,"康复器具柜",1.2)

# Consolidate each semantic item without sacrificing material slots or picking metadata.
def consolidate():
    for root in [o for o in bpy.context.scene.objects if o.type == "EMPTY"]:
        meshes=[o for o in root.children_recursive if o.type=="MESH"]
        if len(meshes)<2: continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in meshes: o.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0]
        bpy.ops.object.join()
        bpy.context.object.name=root.name+"_Mesh"
    bpy.ops.object.select_all(action="DESELECT")

def save(theme):
    scene=bpy.context.scene
    scene["asset_authoring"]="Native Blender bpy; bevelled mesh geometry; embedded PBR basecolor textures"
    scene["scene_theme"]=theme
    scene["units"]="metres"
    scene["privacy"]="Environment only; no resident or business records embedded"
    # Save before runtime batching: individual bed rails, fabric and joinery stay editable.
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action="DESELECT")
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                space = area.spaces.active
                space.shading.type = "MATERIAL"
                space.overlay.show_floor = False
                space.region_3d.view_distance = 10.0
                space.region_3d.view_location = Vector((0, 0, 1.1))
                space.region_3d.view_rotation = Vector((6, -8, 7)).to_track_quat("Z", "Y")
    blend=OUT/f"care-{theme}.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), check_existing=False)
    consolidate()
    glb=ASSETS/f"care-{theme}.glb"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", export_yup=True,
                              export_apply=True, export_extras=True, export_animations=False,
                              export_cameras=False, export_lights=False, export_image_format="AUTO")
    (OUT/glb.name).write_bytes(glb.read_bytes())
    triangles=0
    for obj in scene.objects:
        if obj.type=="MESH":
            obj.data.calc_loop_triangles()
            triangles+=len(obj.data.loop_triangles)
    return {"theme":theme,"blend":str(blend.relative_to(ROOT)),"glb":str(glb.relative_to(ROOT)),
            "bytes":glb.stat().st_size,"triangles":triangles,"meshes":sum(o.type=="MESH" for o in scene.objects)}

if __name__=="__main__":
    started=time.time()
    report=[]
    for theme in ["room","corridor","dining","nursing","rehab"]:
        init(); fixtures(theme); report.append(save(theme))
        print(json.dumps(report[-1],ensure_ascii=False),flush=True)
    (OUT/"asset-manifest.json").write_text(json.dumps({"blender":bpy.app.version_string,"durationSeconds":round(time.time()-started,2),"assets":report},ensure_ascii=False,indent=2),encoding="utf-8")
    print("BLENDER_ASSETS_COMPLETE",flush=True)

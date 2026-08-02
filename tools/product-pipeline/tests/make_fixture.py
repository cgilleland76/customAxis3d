"""Build a synthetic Orca/Bambu-style sliced 3MF so we can test the parser
without needing a real project file. Also builds a fake 'photo' on a backdrop.
"""
import zipfile, sys
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "products/_example")
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "photos").mkdir(exist_ok=True)

# unit cube, scaled 40 x 60 x 80 and shifted -- exercises the transform math
V = [(0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1)]
T = [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),
     (1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]

verts = "".join(f'<vertex x="{x}" y="{y}" z="{z}"/>' for x,y,z in V)
tris  = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a,b,c in T)

MODEL = f'''<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>
  <object id="1" type="model" name="Hex Planter">
   <mesh><vertices>{verts}</vertices><triangles>{tris}</triangles></mesh>
  </object>
 </resources>
 <build>
  <item objectid="1" transform="40 0 0 0 60 0 0 0 80 120 110 0"/>
 </build>
</model>'''

SLICE_INFO = '''<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="prediction" value="14220"/>
    <metadata key="weight" value="86.40"/>
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#2C5F3EFF" used_m="21.80" used_g="65.02"/>
    <filament id="2" tray_info_idx="GFA01" type="PLA" color="#F2EFE6FF" used_m="7.15" used_g="21.38"/>
  </plate>
</config>'''

PROJECT = '''{
  "layer_height": "0.2",
  "nozzle_diameter": ["0.4"],
  "printer_model": "Bambu Lab P1S",
  "filament_type": ["PLA", "PLA"],
  "filament_colour": ["#2C5F3E", "#F2EFE6"]
}'''

# plate preview the slicer would have rendered
img = Image.new("RGBA", (512, 512), (0,0,0,0))
d = ImageDraw.Draw(img)
d.polygon([(256,90),(400,175),(400,340),(256,425),(112,340),(112,175)], fill=(44,95,62,255))
d.polygon([(256,90),(400,175),(256,260),(112,175)], fill=(242,239,230,255))
img.save("/tmp/plate_1.png")

dest = OUT / "model.3mf"
with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("3D/3dmodel.model", MODEL)
    z.writestr("Metadata/slice_info.config", SLICE_INFO)
    z.writestr("Metadata/project_settings.config", PROJECT)
    z.write("/tmp/plate_1.png", "Metadata/plate_1.png")
print("wrote", dest)

# a fake product photo: object on a plain light-grey sweep (tests bg removal)
photo = Image.new("RGB", (900, 900), (238, 238, 240))
p = ImageDraw.Draw(photo)
p.polygon([(450,240),(620,340),(620,560),(450,660),(280,560),(280,340)], fill=(44,95,62))
p.polygon([(450,240),(620,340),(450,440),(280,340)], fill=(242,239,230))
photo.save(OUT / "photos" / "hero.jpg", quality=92)
print("wrote", OUT / "photos" / "hero.jpg")

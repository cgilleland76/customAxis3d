"""Download the seven faces the site previews with. Run once."""
import os, urllib.request
BASE = "https://raw.githubusercontent.com/google/fonts/main/"
FILES = {
    "GreatVibes-Regular.ttf":     "ofl/greatvibes/GreatVibes-Regular.ttf",
    "DancingScript-Bold.ttf":     "ofl/dancingscript/static/DancingScript-Bold.ttf",
    "Pacifico-Regular.ttf":       "ofl/pacifico/Pacifico-Regular.ttf",
    "PlayfairDisplay-Black.ttf":  "ofl/playfairdisplay/static/PlayfairDisplay-Black.ttf",
    "Inter-Bold.ttf":             "ofl/inter/static/Inter-Bold.ttf",
    "BebasNeue-Regular.ttf":      "ofl/bebasneue/BebasNeue-Regular.ttf",
    "Righteous-Regular.ttf":      "ofl/righteous/Righteous-Regular.ttf",
}
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
os.makedirs(here, exist_ok=True)
for name, path in FILES.items():
    dest = os.path.join(here, name)
    if os.path.exists(dest):
        print("have", name); continue
    try:
        urllib.request.urlretrieve(BASE + path, dest)
        print("got ", name)
    except Exception as e:
        print("FAIL", name, e)

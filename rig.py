"""Rig configuration — single source of truth for the DMX patch.

Update this when fixtures get repatched on the desk.
"""

from dataclasses import dataclass, field

from dmx import Universe
from fixtures import Atomic, FocusSpotTwo, Fog, MegaTripar, MSZoom250, Pinspot, Switch

PORT = "/dev/cu.usbserial-BG03CYC2"

TRIPAR_ADDRS = [1 + i * 6 for i in range(12)]    # 1, 7, 13, ..., 67
PINSPOT_ADDRS = [80, 81, 82]                     # 3 single-channel dimmers
SPOTLIGHT_ADDR = 83                              # 1 binary switch
ATOMIC_ADDR = 100
FOCUS_ADDRS = [110, 128, 146, 164]
GROOT_ADDRS = [182, 198, 214]
FOG_ADDR = 500


def fixture_ids() -> list[dict]:
    """Stable IDs + display metadata for the layout editor / viz."""
    out: list[dict] = []
    for i, a in enumerate(TRIPAR_ADDRS, 1):
        out.append({"id": f"tripar-{i}", "type": "tripar", "label": f"T{i}", "addr": a})
    for i, a in enumerate(PINSPOT_ADDRS, 1):
        out.append({"id": f"pinspot-{i}", "type": "pinspot", "label": f"P{i}", "addr": a})
    out.append({"id": "spotlight", "type": "spotlight", "label": "SPL", "addr": SPOTLIGHT_ADDR})
    for i, a in enumerate(FOCUS_ADDRS, 1):
        out.append({"id": f"focus-{i}", "type": "focus", "label": f"F{i}", "addr": a})
    for i, a in enumerate(GROOT_ADDRS, 1):
        out.append({"id": f"groot-{i}", "type": "groot", "label": f"G{i}", "addr": a})
    out.append({"id": "atomic", "type": "atomic", "label": "ATM", "addr": ATOMIC_ADDR})
    out.append({"id": "fog",    "type": "fog",    "label": "FOG", "addr": FOG_ADDR})
    return out


@dataclass
class Rig:
    tripars: list[MegaTripar]
    pinspots: list[Pinspot]
    spotlight: Switch
    focus: list[FocusSpotTwo]
    groot: list[MSZoom250]
    atomic: Atomic
    fog: Fog

    @property
    def heads(self) -> list[FocusSpotTwo | MSZoom250]:
        """All moving heads as one list (focus + groot)."""
        return [*self.focus, *self.groot]


def build_rig(uni: Universe) -> Rig:
    """Instantiate every fixture in the rig, register with the universe,
    and put each into a sane default state."""
    tripars = [
        MegaTripar(start_address=a, name=f"Tripar {i + 1}")
        for i, a in enumerate(TRIPAR_ADDRS)
    ]
    pinspots = [
        Pinspot(start_address=a, name=f"Pinspot {i + 1}")
        for i, a in enumerate(PINSPOT_ADDRS)
    ]
    spotlight = Switch(start_address=SPOTLIGHT_ADDR, name="Spotlight")
    focus = [
        FocusSpotTwo(start_address=a, name=f"Focus {i + 1}")
        for i, a in enumerate(FOCUS_ADDRS)
    ]
    groot = [
        MSZoom250(start_address=a, name=f"Groot {i + 1}")
        for i, a in enumerate(GROOT_ADDRS)
    ]
    atomic = Atomic(start_address=ATOMIC_ADDR, name="Atomic")
    fog = Fog(start_address=FOG_ADDR, name="Fog")

    uni.add(*tripars, *pinspots, spotlight, *focus, *groot, atomic, fog)

    for t in tripars:
        t.enable()
    for h in focus:
        h.home()
    for h in groot:
        h.home()
    for p in pinspots:
        p.off()
    spotlight.off()
    atomic.blackout()
    fog.output(0)

    return Rig(
        tripars=tripars, pinspots=pinspots, spotlight=spotlight,
        focus=focus, groot=groot, atomic=atomic, fog=fog,
    )

"""Rig configuration — single source of truth for the DMX patch.

Update this when fixtures get repatched on the desk.
"""

from dataclasses import dataclass

from dmx import Universe
from fixtures import Atomic, FocusSpotTwo, Fog, MegaTripar, MSZoom250

PORT = "/dev/cu.usbserial-BG03CYC2"

TRIPAR_ADDRS = [1 + i * 6 for i in range(12)]    # 1, 7, 13, ..., 67
FOCUS_ADDRS = [110, 128, 146, 164]
GROOT_ADDRS = [182, 198, 214]
ATOMIC_ADDR = 100
FOG_ADDR = 500


@dataclass
class Rig:
    tripars: list[MegaTripar]
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

    uni.add(*tripars, *focus, *groot, atomic, fog)

    for t in tripars:
        t.enable()
    for h in focus:
        h.home()
    for h in groot:
        h.home()
    atomic.blackout()
    fog.output(0)

    return Rig(tripars=tripars, focus=focus, groot=groot, atomic=atomic, fog=fog)

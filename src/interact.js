// Nearest-interactable-wins prompt router. Each game registers a zone; every
// frame the closest in-range zone owns the "Press E" prompt (desktop) or the
// sit button (touch), so overlapping zones never fight over the HUD.
export class Interact {
  constructor(player) {
    this.player = player;
    this.zones = [];
    this.active = null;
    this.promptEl = document.getElementById('prompt');
    this.sitBtn = document.getElementById('sitbtn');

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.active && !player.seated && player.active) {
        this.active.activate();
      }
    });
    this.sitBtn.addEventListener('click', () => {
      if (this.active && !player.seated) this.active.activate();
    });
  }

  // zone = { x, z, range, prompt, icon, activate }
  register(zone) {
    this.zones.push(zone);
  }

  update() {
    const p = this.player;
    let next = null;
    if (!p.seated && p.active) {
      let best = Infinity;
      for (const z of this.zones) {
        const d = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
        if (d < z.range && d < best) { best = d; next = z; }
      }
    }
    if (next === this.active) return;
    this.active = next;
    if (p.touchMode) {
      this.sitBtn.style.display = next ? 'block' : 'none';
      if (next) this.sitBtn.textContent = next.icon;
    } else {
      this.promptEl.style.display = next ? 'block' : 'none';
      if (next) this.promptEl.textContent = next.prompt;
    }
  }
}

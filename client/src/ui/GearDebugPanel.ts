/**
 * In-game debug panel for adjusting equipment position, rotation, and scale.
 * Toggle with /geardebug chat command.
 * Adjusts the currently equipped weapon in real-time.
 */

import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

export class GearDebugPanel {
  private container: HTMLDivElement;
  private visible = false;
  private target: TransformNode | null = null;
  private sliders: Map<string, HTMLInputElement> = new Map();
  private labels: Map<string, HTMLSpanElement> = new Map();

  constructor() {
    this.container = this.buildUI();
    document.body.appendChild(this.container);
  }

  private buildUI(): HTMLDivElement {
    const div = document.createElement('div');
    div.id = 'gear-debug-panel';
    div.style.cssText = `
      position: fixed; top: 60px; left: 10px; width: 280px;
      background: rgba(0,0,0,0.85); color: #fff; font-family: monospace;
      font-size: 12px; padding: 10px; border-radius: 6px; z-index: 9999;
      display: none; user-select: none;
    `;

    div.innerHTML = `
      <div style="font-weight:bold;margin-bottom:8px;color:#ffd700;">Gear Debug <span id="gear-debug-slot" style="color:#8cf;"></span></div>
      <div id="gear-debug-controls"></div>
      <button id="gear-debug-copy" style="margin-top:8px;width:100%;padding:4px;cursor:pointer;background:#333;color:#fff;border:1px solid #555;border-radius:3px;">Copy Values to Console</button>
    `;

    const controls = div.querySelector('#gear-debug-controls') as HTMLDivElement;
    const params = [
      { key: 'pos.x', label: 'Pos X', min: -1, max: 1, step: 0.01, value: 0 },
      { key: 'pos.y', label: 'Pos Y', min: -1, max: 1, step: 0.01, value: 0 },
      { key: 'pos.z', label: 'Pos Z', min: -1, max: 1, step: 0.01, value: 0 },
      { key: 'rot.x', label: 'Rot X', min: -3.15, max: 3.15, step: 0.05, value: 0 },
      { key: 'rot.y', label: 'Rot Y', min: -3.15, max: 3.15, step: 0.05, value: 0 },
      { key: 'rot.z', label: 'Rot Z', min: -3.15, max: 3.15, step: 0.05, value: 0 },
      { key: 'scale', label: 'Scale', min: 0.1, max: 3, step: 0.05, value: 1 },
    ];

    for (const p of params) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;margin-bottom:4px;gap:6px;';

      const label = document.createElement('span');
      label.style.cssText = 'width:40px;flex-shrink:0;';
      label.textContent = p.label;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(p.min);
      slider.max = String(p.max);
      slider.step = String(p.step);
      slider.value = String(p.value);
      slider.style.cssText = 'flex:1;';

      const valLabel = document.createElement('span');
      valLabel.style.cssText = 'width:45px;text-align:right;flex-shrink:0;font-size:11px;';
      valLabel.textContent = p.value.toFixed(2);

      slider.addEventListener('input', () => {
        valLabel.textContent = parseFloat(slider.value).toFixed(2);
        this.applyToTarget();
      });

      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(valLabel);
      controls.appendChild(row);

      this.sliders.set(p.key, slider);
      this.labels.set(p.key, valLabel);
    }

    div.querySelector('#gear-debug-copy')!.addEventListener('click', () => {
      this.printValues();
    });

    return div;
  }

  toggle(gearNode?: TransformNode | null): void {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? 'block' : 'none';
    if (gearNode) {
      this.setTarget(gearNode);
    }
  }

  setTarget(node: TransformNode): void {
    this.target = node;
    const slotLabel = this.container.querySelector('#gear-debug-slot') as HTMLSpanElement;
    slotLabel.textContent = `(${node.name})`;

    // Read current values from the node
    this.setSlider('pos.x', node.position.x);
    this.setSlider('pos.y', node.position.y);
    this.setSlider('pos.z', node.position.z);
    this.setSlider('rot.x', node.rotation.x);
    this.setSlider('rot.y', node.rotation.y);
    this.setSlider('rot.z', node.rotation.z);
    this.setSlider('scale', node.scaling.x);
  }

  private setSlider(key: string, value: number): void {
    const slider = this.sliders.get(key);
    const label = this.labels.get(key);
    if (slider) slider.value = String(value);
    if (label) label.textContent = value.toFixed(2);
  }

  private getVal(key: string): number {
    return parseFloat(this.sliders.get(key)?.value ?? '0');
  }

  private applyToTarget(): void {
    if (!this.target) return;
    this.target.position.set(this.getVal('pos.x'), this.getVal('pos.y'), this.getVal('pos.z'));
    this.target.rotation.set(this.getVal('rot.x'), this.getVal('rot.y'), this.getVal('rot.z'));
    const s = this.getVal('scale');
    this.target.scaling.set(s, s, s);
  }

  private printValues(): void {
    const pos = `{ x: ${this.getVal('pos.x').toFixed(3)}, y: ${this.getVal('pos.y').toFixed(3)}, z: ${this.getVal('pos.z').toFixed(3)} }`;
    const rot = `{ x: ${this.getVal('rot.x').toFixed(3)}, y: ${this.getVal('rot.y').toFixed(3)}, z: ${this.getVal('rot.z').toFixed(3)} }`;
    const scale = this.getVal('scale').toFixed(3);
    const output = `pos: ${pos}, rot: ${rot}, scale: ${scale}`;
    console.log(`[GearDebug] ${output}`);
    // Also copy to clipboard
    navigator.clipboard.writeText(output).then(() => {
      console.log('[GearDebug] Copied to clipboard!');
    }).catch(() => {});
  }

  dispose(): void {
    this.container.remove();
  }
}

import type { ObjectRecipe, ItemDef } from '@projectrs/shared';

export type SmithCallback = (recipeIndex: number) => void;

/**
 * Popup panel showing available smithing recipes when interacting with an anvil.
 * Groups recipes by input bar, shows item icons, names, bar cost, and level requirement.
 * Greyed-out items are unsmithable (missing bars, level, or hammer).
 */
export class SmithingPanel {
  private container: HTMLDivElement;
  private gridEl: HTMLDivElement;
  private visible: boolean = false;
  private onSmith: SmithCallback | null = null;
  private onCloseCallback: (() => void) | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 480px; max-height: 520px;
      background: url('/ui/stone-dark.png') repeat;
      border: 2px solid #5a4a35;
      border-radius: 4px; z-index: 1001; display: none;
      font-family: monospace; color: #ddd; user-select: none;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 12px;
      background: url('/ui/stone-light.png') repeat;
      border-bottom: 2px solid #1a1510;
      border-radius: 2px 2px 0 0;
    `;
    const title = document.createElement('span');
    title.textContent = 'Anvil — What would you like to smith?';
    title.style.cssText = 'font-size: 13px; color: #fc0; font-weight: bold; text-shadow: 1px 1px 0 #000;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'X';
    closeBtn.style.cssText = `
      background: linear-gradient(180deg, #5a3a2a 0%, #3a2518 100%);
      border: 1px solid #6a4a35; color: #d4a44a; cursor: pointer;
      padding: 2px 8px; border-radius: 3px; font-family: monospace; font-weight: bold;
    `;
    closeBtn.onclick = () => this.hide();
    header.appendChild(title);
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    // Recipe grid
    this.gridEl = document.createElement('div');
    this.gridEl.style.cssText = 'padding: 8px; overflow-y: auto; max-height: 440px;';
    this.container.appendChild(this.gridEl);

    document.body.appendChild(this.container);
  }

  show(
    recipes: ObjectRecipe[],
    inventory: ({ itemId: number; quantity: number } | null)[],
    smithingLevel: number,
    hasHammer: boolean,
    itemDefs: Map<number, ItemDef>,
    onSmith: SmithCallback,
  ): void {
    this.onSmith = onSmith;
    this.gridEl.innerHTML = '';

    // Count how many of each item the player has
    const itemCounts = new Map<number, number>();
    for (const slot of inventory) {
      if (slot) itemCounts.set(slot.itemId, (itemCounts.get(slot.itemId) ?? 0) + slot.quantity);
    }

    // Group recipes by input bar
    const groups = new Map<number, { recipe: ObjectRecipe; index: number }[]>();
    recipes.forEach((recipe, index) => {
      const list = groups.get(recipe.inputItemId) ?? [];
      list.push({ recipe, index });
      groups.set(recipe.inputItemId, list);
    });

    for (const [barId, entries] of groups) {
      const barDef = itemDefs.get(barId);
      const barName = barDef?.name ?? `Item ${barId}`;
      const barCount = itemCounts.get(barId) ?? 0;

      // Section header
      const sectionHeader = document.createElement('div');
      sectionHeader.style.cssText = `
        padding: 4px 8px; margin-top: 6px; font-size: 12px; font-weight: bold;
        color: #aa8844; border-bottom: 1px solid #333;
      `;
      sectionHeader.textContent = `${barName} (${barCount} in inventory)`;
      this.gridEl.appendChild(sectionHeader);

      // Recipe rows
      for (const { recipe, index } of entries) {
        const outputDef = itemDefs.get(recipe.outputItemId);
        const outputName = outputDef?.name ?? `Item ${recipe.outputItemId}`;
        const hasLevel = smithingLevel >= recipe.levelRequired;
        const hasBars = barCount >= recipe.inputQuantity;
        const canSmith = hasLevel && hasBars && hasHammer;

        const row = document.createElement('div');
        row.style.cssText = `
          display: flex; align-items: center; gap: 8px;
          padding: 5px 8px; margin: 2px 0; border-radius: 3px;
          background: ${canSmith ? '#222' : '#1a1a1a'};
          border: 1px solid ${canSmith ? '#444' : '#2a2a2a'};
          opacity: ${canSmith ? '1' : '0.45'};
          cursor: ${canSmith ? 'pointer' : 'default'};
          transition: background 0.1s;
        `;

        // Icon
        const icon = document.createElement('div');
        icon.style.cssText = 'width: 28px; height: 28px; flex-shrink: 0;';
        const iconFile = outputDef?.sprite ?? outputDef?.icon;
        if (iconFile) {
          const img = document.createElement('img');
          const folder = outputDef?.sprite ? 'sprites/items' : 'items';
          img.src = `/${folder}/${iconFile}`;
          img.style.cssText = 'width: 28px; height: 28px; image-rendering: pixelated;';
          icon.appendChild(img);
        } else {
          icon.style.background = '#333';
          icon.style.borderRadius = '3px';
        }
        row.appendChild(icon);

        // Name
        const nameEl = document.createElement('div');
        nameEl.style.cssText = `flex: 1; font-size: 12px; color: ${canSmith ? '#ddd' : '#777'};`;
        nameEl.textContent = outputName;
        row.appendChild(nameEl);

        // Bar cost
        const costEl = document.createElement('div');
        costEl.style.cssText = `font-size: 11px; color: ${hasBars ? '#8a8' : '#a55'}; white-space: nowrap;`;
        costEl.textContent = `${recipe.inputQuantity} bar${recipe.inputQuantity > 1 ? 's' : ''}`;
        row.appendChild(costEl);

        // Level
        const lvlEl = document.createElement('div');
        lvlEl.style.cssText = `
          font-size: 11px; width: 50px; text-align: right;
          color: ${hasLevel ? '#88a' : '#a55'};
        `;
        lvlEl.textContent = `Lv ${recipe.levelRequired}`;
        row.appendChild(lvlEl);

        if (canSmith) {
          row.addEventListener('mouseenter', () => { row.style.background = '#2a3a2a'; row.style.borderColor = '#5a8855'; });
          row.addEventListener('mouseleave', () => { row.style.background = '#222'; row.style.borderColor = '#444'; });
          row.addEventListener('click', () => {
            this.onSmith?.(index);
            this.hide();
          });
        }

        this.gridEl.appendChild(row);
      }
    }

    // No-hammer warning
    if (!hasHammer) {
      const warn = document.createElement('div');
      warn.style.cssText = 'padding: 8px 12px; font-size: 12px; color: #c44; text-align: center; margin-top: 8px;';
      warn.textContent = 'You need a hammer in your inventory to smith.';
      this.gridEl.appendChild(warn);
    }

    this.container.style.display = 'block';
    this.visible = true;
  }

  hide(): void {
    this.container.style.display = 'none';
    this.visible = false;
    this.onSmith = null;
    this.onCloseCallback?.();
  }

  isVisible(): boolean {
    return this.visible;
  }

  setOnClose(cb: (() => void) | null): void {
    this.onCloseCallback = cb;
  }
}

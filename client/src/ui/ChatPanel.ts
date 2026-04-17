export type ChatSendCallback = (message: string) => void;

type ChatTab = 'all' | 'game' | 'public';

export class ChatPanel {
  private container: HTMLDivElement;
  private log: HTMLDivElement;
  private input: HTMLInputElement;
  private onSend: ChatSendCallback | null = null;

  // Chat filtering
  private activeTab: ChatTab = 'all';
  private tabButtons: HTMLDivElement[] = [];
  private messages: { el: HTMLDivElement; type: 'game' | 'public' | 'private' }[] = [];

  constructor() {
    this.container = this.buildUI();
    this.log = this.container.querySelector('#chat-log') as HTMLDivElement;
    this.input = this.container.querySelector('#chat-input') as HTMLInputElement;
    const mount = document.getElementById('ui-chat-area');
    (mount ?? document.body).appendChild(this.container);

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const msg = this.input.value.trim();
        if (msg) {
          this.onSend?.(msg);
          this.input.value = '';
        }
        this.input.blur();
      }
      if (e.key === 'Escape') {
        this.input.blur();
      }
      e.stopPropagation();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement !== this.input) {
        e.preventDefault();
        this.input.focus();
      }
    });

    this.container.addEventListener('click', () => {
      this.input.focus();
    });
  }

  private buildUI(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'chat-panel';
    panel.style.cssText = `
      width: 100%; height: 100%;
      background: #0d0b08;
      display: flex; flex-direction: column;
      font-family: monospace; font-size: 13px;
    `;

    // Tab bar — RS-style chat tabs
    const tabBar = document.createElement('div');
    tabBar.style.cssText = `
      display: flex; gap: 1px; padding: 0 4px;
      background: #151210;
      border-bottom: 1px solid #2a2018;
      flex-shrink: 0;
    `;

    const tabs: { key: ChatTab; label: string }[] = [
      { key: 'all', label: 'All' },
      { key: 'game', label: 'Game' },
      { key: 'public', label: 'Public' },
    ];

    for (const tab of tabs) {
      const btn = document.createElement('div');
      btn.textContent = tab.label;
      btn.dataset.tab = tab.key;
      btn.style.cssText = `
        padding: 3px 12px; cursor: pointer;
        font-size: 11px; font-weight: bold;
        color: #8a7a60;
        border-bottom: 2px solid transparent;
        transition: all 0.1s;
      `;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.switchTab(tab.key);
      });
      tabBar.appendChild(btn);
      this.tabButtons.push(btn);
    }

    panel.appendChild(tabBar);

    // Chat log
    const log = document.createElement('div');
    log.id = 'chat-log';
    log.style.cssText = `
      flex: 1; overflow-y: auto; padding: 4px 8px;
      color: #ddd; line-height: 1.4;
      background: #0d0b08;
    `;
    panel.appendChild(log);

    // Input
    const inputBar = document.createElement('div');
    inputBar.style.cssText = `
      border-top: 1px solid #2a2018; padding: 3px 6px;
      display: flex; align-items: center;
      background: #121010; flex-shrink: 0;
    `;

    const input = document.createElement('input');
    input.id = 'chat-input';
    input.type = 'text';
    input.placeholder = 'Press Enter to chat...';
    input.maxLength = 200;
    input.style.cssText = `
      flex: 1; background: #0a0908;
      border: 1px solid #3a3025; color: #fff;
      font-family: monospace; font-size: 12px;
      padding: 4px 8px; outline: none;
      border-radius: 2px;
    `;

    inputBar.appendChild(input);
    panel.appendChild(inputBar);

    // Set initial tab
    this.switchTab('all');

    return panel;
  }

  private switchTab(tab: ChatTab): void {
    this.activeTab = tab;
    for (const btn of this.tabButtons) {
      if (btn.dataset.tab === tab) {
        btn.style.color = '#fc0';
        btn.style.borderBottomColor = '#fc0';
      } else {
        btn.style.color = '#8a7a60';
        btn.style.borderBottomColor = 'transparent';
      }
    }
    // Filter messages
    for (const msg of this.messages) {
      if (tab === 'all') {
        msg.el.style.display = '';
      } else {
        msg.el.style.display = msg.type === tab ? '' : 'none';
      }
    }
  }

  addMessage(from: string, message: string, color: string = '#ddd'): void {
    const el = document.createElement('div');
    el.innerHTML = `<span style="color: ${color}; font-weight: bold;">${this.escapeHtml(from)}:</span> ${this.escapeHtml(message)}`;
    if (this.activeTab !== 'all' && this.activeTab !== 'public') el.style.display = 'none';
    this.log.appendChild(el);
    this.messages.push({ el, type: 'public' });
    this.log.scrollTop = this.log.scrollHeight;
  }

  addSystemMessage(message: string, color: string = '#ff0'): void {
    const el = document.createElement('div');
    el.innerHTML = `<span style="color: ${color};">${this.escapeHtml(message)}</span>`;
    if (this.activeTab !== 'all' && this.activeTab !== 'game') el.style.display = 'none';
    this.log.appendChild(el);
    this.messages.push({ el, type: 'game' });
    this.log.scrollTop = this.log.scrollHeight;
  }

  setSendHandler(handler: ChatSendCallback): void {
    this.onSend = handler;
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

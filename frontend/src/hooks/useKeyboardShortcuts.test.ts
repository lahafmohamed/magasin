import { describe, expect, it, beforeEach } from 'vitest';
import { isSingleKeyShortcut, shortcutKeysLabel } from './useKeyboardShortcuts';
import {
  areSingleKeyShortcutsEnabled,
  canRunSingleKeyShortcut,
  isShortcutBlockedByTarget,
  setSingleKeyShortcutsEnabled,
} from '../lib/shortcutPreferences';

const noop = () => {};

describe('raccourcis clavier', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reconnaît les raccourcis à une touche (WCAG 2.1.4)', () => {
    expect(isSingleKeyShortcut({ key: 'n' })).toBe(true);
    expect(isSingleKeyShortcut({ key: '/' })).toBe(true);
    expect(isSingleKeyShortcut({ key: 'f', gKey: true })).toBe(true);
    expect(isSingleKeyShortcut({ key: '/', ctrlKey: true })).toBe(false);
    expect(isSingleKeyShortcut({ key: 'F2' })).toBe(false);
  });

  it('affiche les touches en français', () => {
    expect(shortcutKeysLabel({ key: 'f', gKey: true, action: noop, description: '' })).toBe('G puis F');
    expect(shortcutKeysLabel({ key: '/', ctrlKey: true, action: noop, description: '' })).toBe('Ctrl + /');
    expect(shortcutKeysLabel({ key: 'F9', action: noop, description: '' })).toBe('F9');
  });

  it('active les raccourcis à une touche par défaut et retient le choix par utilisateur', () => {
    localStorage.setItem('auth_user', JSON.stringify({ id: 7 }));
    expect(areSingleKeyShortcutsEnabled()).toBe(true);
    setSingleKeyShortcutsEnabled(false);
    expect(areSingleKeyShortcutsEnabled()).toBe(false);
    expect(localStorage.getItem('raccourcis-une-touche:7')).toBe('0');

    // Un autre utilisateur du même poste garde sa propre préférence.
    localStorage.setItem('auth_user', JSON.stringify({ id: 8 }));
    expect(areSingleKeyShortcutsEnabled()).toBe(true);
  });

  it('ignore la frappe dans un champ, une liste ou un menu', () => {
    const input = document.createElement('input');
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-haspopup', 'listbox');
    const plain = document.createElement('div');
    document.body.append(input, trigger, plain);

    expect(isShortcutBlockedByTarget(input)).toBe(true);
    expect(isShortcutBlockedByTarget(trigger)).toBe(true);
    expect(isShortcutBlockedByTarget(plain)).toBe(false);

    const event = new KeyboardEvent('keydown', { key: 'n' });
    Object.defineProperty(event, 'target', { value: plain });
    expect(canRunSingleKeyShortcut(event)).toBe(true);
    setSingleKeyShortcutsEnabled(false);
    expect(canRunSingleKeyShortcut(event)).toBe(false);
  });

  it('n’agit pas quand une fenêtre modale a le focus', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('span');
    dialog.append(button);
    document.body.append(dialog);
    const event = new KeyboardEvent('keydown', { key: 'n' });
    Object.defineProperty(event, 'target', { value: button });
    expect(canRunSingleKeyShortcut(event)).toBe(false);
  });
});

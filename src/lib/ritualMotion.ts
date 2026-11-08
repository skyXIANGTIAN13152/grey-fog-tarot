import { useRef, useSyncExternalStore, type KeyboardEvent } from 'react';

const key = 'grey-fog-tarot.ritual-motion.v1';
const changeEvent = 'grey-fog-tarot:motion-change';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

function storedPreference() {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

let preference = storedPreference();

export function ritualMotionEnabled() {
  if (preference === 'on') return true;
  if (preference === 'off') return false;
  return !reduced.matches;
}

export function setRitualMotion(enabled: boolean) {
  preference = enabled ? 'on' : 'off';
  try { localStorage.setItem(key, preference); }
  catch { /* The choice still works in the current tab if storage is unavailable. */ }
  window.dispatchEvent(new Event(changeEvent));
}

export function subscribeRitualMotion(notify: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== key && event.key !== null) return;
    preference = storedPreference();
    notify();
  }
  reduced.addEventListener('change', notify);
  window.addEventListener(changeEvent, notify);
  window.addEventListener('storage', onStorage);
  return () => {
    reduced.removeEventListener('change', notify);
    window.removeEventListener(changeEvent, notify);
    window.removeEventListener('storage', onStorage);
  };
}

export function useRitualMotion() {
  return useSyncExternalStore(subscribeRitualMotion, ritualMotionEnabled);
}

// Native keyboard activation should be instant. Zero click detail alone can
// also occur with voice input or semantic activation, without a keyboard.
export function useKeyboardActivation() {
  const pending = useRef(false);
  const reset = () => { pending.current = false; };
  return {
    handlers: {
      onKeyDown: (event: KeyboardEvent) => { pending.current = event.key === 'Enter' || event.key === ' '; },
      onPointerDown: reset,
      onBlur: reset,
    },
    consume() {
      const fromKeyboard = pending.current;
      reset();
      return fromKeyboard;
    },
  };
}

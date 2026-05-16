// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  interface Navigator {
    /** WakeLock API — guarded usage; not present on older iOS. */
    wakeLock?: {
      request(type: 'screen'): Promise<WakeLockSentinel>;
    };
  }

  interface WakeLockSentinel extends EventTarget {
    released: boolean;
    type: 'screen';
    release(): Promise<void>;
  }
}

export {};

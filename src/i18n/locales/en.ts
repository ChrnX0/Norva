import type { Dictionary } from './pt-BR';

/** English. */
export const en: Dictionary = {
  common: {
    confirm: 'Confirm',
    adjust: 'Adjust',
    cancel: 'Cancel',
    why: 'why?',
    seeScreens: 'See screens',
    ask: 'Ask something…',
    allClear: 'Everything is in order today.',
  },

  areas: {
    home: 'Home',
    production: 'Production',
    inventory: 'Inventory',
    distribution: 'Distribution',
    storeMirror: 'Store Mirror',
    purchasing: 'Purchasing',
    finance: 'Finance',
    settings: 'Settings',
  },

  units: {
    unit: { one: 'unit', other: 'units' },
    box: { one: 'box', other: 'boxes' },
    crate: { one: 'crate', other: 'crates' },
  },

  signals: {
    checked: 'Checked',
    expiringIn: 'Expires in {{days}} days',
    missing: '{{count}} boxes missing',
    awaitingRoute: 'Awaiting route',
  },

  loss: {
    melted: 'Melted',
    broken: 'Broken',
    expired: 'Expired',
    courtesy: 'Courtesy',
    internalUse: 'Internal use',
    reasonRequired: "Say what happened - it protects everyone's numbers.",
  },

  posts: {
    picked: 'Picked',
    loaded: 'Loaded',
    delivered: 'Delivered',
    checked: 'Checked',
  },

  stepper: {
    echo: '{{parts}}',
    decrease: 'Decrease',
    increase: 'Increase',
  },

  production: {
    suggestedToday: 'Suggested for today',
    yields: 'Yields {{units}}',
    roundedUp: 'rounded up from {{from}}, which fills {{boxes}} whole boxes',
    willDraw: 'Will draw from the store room',
    costOfRun: 'Cost of this run',
    frozenAtRecord: 'per unit · frozen at record time',
    register: 'Record production',
  },

  scan: {
    typeCode: 'Type the code',
    progress: '{{done}} of {{total}}',
    duplicate: 'That crate was already scanned.',
  },

  confirmation: {
    shipment: 'You are sending {{quantity}} of {{product}} to {{destination}}. Confirm?',
    checkForMe: 'Check this for me',
  },

  assistant: {
    title: 'Conversation Mode',
    understood: 'Got it: {{intent}}',
    offline: 'I need internet for that. Opening the screen instead.',
    noAccess: 'Values are not part of your access.',
  },
};

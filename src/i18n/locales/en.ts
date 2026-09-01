import type { Dictionary } from './pt-BR';

/** English. */
export const en: Dictionary = {
  common: {
    /** Joins the last two items of a spoken list: "a, b and c". */
    and: 'and',
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

  app: {
    crash: {
      title: 'Something broke here',
      reassurance:
        'Nothing you recorded was lost. The app saves every entry on the device the moment you confirm it, so you can go back and carry on where you left off.',
      retry: 'Try again',
      detail: 'TECHNICAL DETAIL',
    },

    whatsNew: {
      title: "What's new",
      subtitle: 'The app updated itself. Here is what changed.',
      dismiss: 'Got it',
    },

    confirm: {
      confirm: 'Confirm',
      cancel: 'Cancel',
      adjust: 'Adjust',
      understood: 'Got it',
      close: 'Close',
    },

    home: {
      overline: 'at the factory today',
      unitCost: 'cost per unit · worked out from the recipe and the invoices',
      changed: 'Changed since last time',
      steady: 'No price moved',
      steadyDetail: 'Costs are steady. There is nothing to decide today.',
      checking: 'Checking…',
      allSteady: 'All steady',
      whereTo: 'Where do you want to go',
      nav: {
        ask: { label: 'Ask', hint: 'type what you want to know' },
        inputs: { label: 'Inputs', hint: 'what you buy' },
        recipes: { label: 'Recipes', hint: 'what goes in the batch' },
        products: { label: 'Products', hint: 'what goes out to sell' },
        purchases: { label: 'Purchases', hint: 'the invoice that moves the cost' },
        settings: { label: 'Settings', hint: 'clear data and start over' },
      },
    },
    settings: {
      title: 'Settings',
      stored: 'What is stored',
      checking: 'Checking…',
      inputs: 'Inputs',
      recipes: 'Recipes',
      products: 'Products',
      purchases: 'Invoices recorded',
      hasExample: 'Includes the example data',
      emptyNoExample: 'Empty, no example',
      clearByArea: 'Clear one area',
      clearByAreaHint: 'One area at a time, when you only want to redo part of it.',
      areas: {
        purchases: 'recorded invoices, average cost and price history',
        recipes: 'recipes and every version of them',
        products: 'what goes out to sell',
        inputs: 'storeroom, packaging and store supplies',
      },
      startOver: 'Start over',
      startOverHint:
        'Erases everything at once, in the right order. After that the app opens empty and the example does not come back on its own.',
      eraseAll: 'Erase everything',
      erasing: 'Erasing…',
      cannotYet: 'Not yet',
      noUndo: 'There is no undo.',
      eraseTitle: 'Erase {{area}}?',
      eraseAllTitle: 'Erase everything?',
      erase: 'Erase',
      failedToErase: 'Could not erase',
      exampleTitle: 'Example data',
      exampleEmpty:
        'It is empty. If you want to see the app working before entering your own, you can bring the example back.',
      restore: 'Restore the example data',
      restoreTitle: 'Bring the example back?',
      restoreBody:
        'Puts back the demonstration inputs, recipe and product, with the purchases that give them their cost. Only works if it is empty.',
      restoreConfirm: 'Restore',
      failedToRestore: 'Could not restore',
      back: 'Back',
    },

    inputs: {
      title: 'Storeroom',
      overline: 'what you buy',
      tabs: {
        input: 'Inputs',
        packaging: 'Packaging',
        storeSupply: 'Store supplies',
      },
      empty: {
        input: 'Nothing registered yet.',
        packaging: 'Stick, wrapper, label — nothing yet.',
        storeSupply: 'Cup, spoon, napkin — nothing yet.',
      },
      heldTitle: 'SITTING IN THE STOREROOM',
      heldDetail: '{{count}} · at each one average cost',
      withoutPrice:
        '{{count}} with no price yet — record the invoice and the cost appears on its own.',
      opening: 'Opening…',
      perThousand: 'The figure on the right is the cost per 1,000 {{unit}}.',
      addNew: 'Register a new one',
      inStock: '{{amount}} in stock',
    },

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

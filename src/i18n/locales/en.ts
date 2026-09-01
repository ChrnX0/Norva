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
      blocked: {
        recipesUseInputs: {
          one: 'The inputs cannot go while 1 recipe uses them. Erase the recipes first.',
          other: 'The inputs cannot go while {{n}} recipes use them. Erase the recipes first.',
        },
        purchasesUseInputs: {
          one: 'The inputs cannot go while 1 recorded purchase points at them. Erase the purchases first.',
          other: 'The inputs cannot go while {{n}} recorded purchases point at them. Erase the purchases first.',
        },
        productsUseRecipes: {
          one: 'The recipes cannot go while 1 product is made from them. Erase the products first.',
          other: 'The recipes cannot go while {{n}} products are made from them. Erase the products first.',
        },
        purchasesUseProducts:
          'The products cannot go while there are resale purchases recorded against them. Erase the purchases first.',
      },
      purchasesRow: 'Purchases',
      erases: 'This erases {{what}}.',
      nothingToErase: 'There is nothing here to erase.',
      alreadyEmpty: 'It is all empty already.',
      alsoPurchases: 'This erases {{what}}, and zeroes the average cost of every input — they have no price until the next invoice.',
      alsoRecipes: 'This erases {{what}}, with every version and line of them. The version history goes too.',
      alsoInputs: 'This erases {{what}}, along with their average cost and price history.',
      alsoAll: 'This erases {{what}}. The app opens empty again, and the example data does not come back on its own.',
      counted: {
        inputs: { one: '1 input', other: '{{n}} inputs' },
        recipes: { one: '1 recipe', other: '{{n}} recipes' },
        products: { one: '1 product', other: '{{n}} products' },
        purchases: { one: '1 purchase', other: '{{n}} purchases' },
      },
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

    inputForm: {
      newTitle: 'New input',
      newOverline: 'register',
      editOverline: 'correcting the record',
      fallbackTitle: 'Input',
      name: 'Name',
      namePlaceholder: 'Sugar',
      whatFor: 'WHAT IT IS FOR',
      kinds: { input: 'Input', packaging: 'Packaging', storeSupply: 'Store supply' },
      kindHint: {
        input: 'Goes into a recipe and becomes part of the product cost.',
        packaging: 'Stick, wrapper, label — costs money per unit made.',
        storeSupply: 'Cup, spoon, napkin — costs money at the shop, but never enters a recipe.',
      },
      howYouBuy: 'How you buy it',
      howYouBuyHint: 'The way it comes from the supplier, not the way it goes into a recipe.',
      pack: 'Pack',
      packPlaceholder: '25 kg sack',
      perPack: 'How much is inside',
      useUnit: 'Unit of use',
      useUnitHint: 'The smallest measure a recipe works in: g, ml, un.',
      price: 'Price paid',
      priceNotAsked:
        'The price is not asked here. It comes from the invoices, and changing it this way would move the average cost with no invoice behind it.',
      conversion:
        '{{paid}} ÷ {{factor}} = {{perThousand}} per 1,000 {{unit}} · {{rate}} cents per {{unit}}',
      entersAs: 'ENTERS A RECIPE AS',
      perThousandOf: 'per 1,000 {{unit}}',
      conversionOk: 'The conversion checks out',
      fillFirst: 'Fill in the pack and the price so the app can work out the cost per unit of use.',
      save: 'Save input',
      saveEdit: 'Save correction',
      saving: 'Saving…',
      confirmTitle: 'Confirm?',
      confirmNew:
        'You are registering {{name}}, bought as {{pack}} with {{factor}} {{unit}} per pack, costing {{price}}.',
      confirmEdit:
        '{{name}} will now be bought as {{pack}}, with {{factor}} {{unit}} per pack. The average cost and the purchase history do not change.',
      failedToSave: 'Could not save',
    },

    inputDetail: {
      overline: 'storeroom',
      retiredOverline: 'storeroom · out of circulation',
      opening: 'Opening…',
      gone: 'That item is no longer registered.',
      retiredTitle: 'Out of circulation',
      retiredBody:
        'It no longer appears when you pick an item, and everything that went through it stays as it was.',
      currentCost: 'CURRENT COST',
      averageOf: 'per 1,000 {{unit}} · average of the invoices',
      noInvoiceYet: 'no invoice recorded yet',
      wentUp: 'Up {{percent}} on the last purchase',
      wentDown: 'Down {{percent}} on the last purchase',
      howYouBuy: 'How you buy it',
      pack: 'Pack',
      perPack: 'How much is inside',
      pricePer: 'Price per {{pack}}',
      inStock: 'In stock',
      heldHere: '{{amount}} sitting here',
      history: 'Price history',
      historyHint: 'Nobody wrote this. Every line came from an invoice.',
      historyEmpty: 'There has only been one purchase so far, so there is nothing to compare yet.',
      usedBy: 'What uses it',
      usedByOne: 'One recipe depends on this item.',
      usedByMany: '{{count}} recipes depend on this item — a rise here moves all of them.',
      recordPurchase: 'Record a purchase of this item',
      correct: 'Correct the record',
      retire: 'Take out of circulation',
      bringBack: 'Use it again',
      retireTitle: 'Take out of circulation?',
      retireBody:
        '{{name}} disappears from the pick lists but stays in the history: the purchases already recorded and the recipes that use it are untouched. Reversible whenever you want.',
      retireConfirm: 'Take out',
      bringBackTitle: 'Use it again?',
      bringBackBody: '{{name}} goes back into the pick lists.',
    },

    purchase: {
      title: 'New purchase',
      overline: 'purchases · the invoice moves the cost',
      openingStoreroom: 'Opening the storeroom…',
      whatYouBought: 'What you bought',
      supplier: 'Supplier',
      supplierPlaceholder: 'who sold it',
      howMany: 'How many {{pack}}',
      conversion: '{{packs}} × {{factor}} = {{baseUnits}} {{unit}} going into stock.',
      total: 'Invoice total',
      perPack: '{{price}} per {{pack}}',
      beforeClosing: 'BEFORE YOU CLOSE',
      firstPurchase: 'First purchase of this item. The next one comes with the comparison.',
      nowVsBefore: '{{now}} now · {{before}} last time',
      wellAbove: 'Well above what is normal',
      cheaper: 'Cheaper than last time',
      smallChange: 'Small change',
      averageMoves: 'The average cost of {{name}} moves from {{from}} to {{to}} per 1,000 {{unit}}.',
      whatItMoved: 'What this invoice moved',
      nobodyUpdated: 'Nobody had to update a price.',
      record: 'Record purchase',
      recording: 'Recording…',
      confirmTitle: 'Record this purchase?',
      confirmBody: '{{packs}} × {{pack}} of {{name}}, for {{total}}.',
      confirmAction: 'Record',
      failed: 'Could not record',
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
